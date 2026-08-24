import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/capture/index.js'
import { CaptureStore, createAggregator, initConfig, sanitize } from '../src/capture/core.js'

test('initConfig 填充默认值并解析输出目录', () => {
  const config = initConfig({ dir: 'payloads' })
  assert.equal(config.enabled, true)
  assert.equal(config.redact, true)
  assert.equal(config.maxFiles, 2000)
  assert.ok(config.dir.endsWith('payloads'))
})

test('sanitize 丢弃 signal 与函数、掩码密钥字段', () => {
  const config = initConfig({})
  const out = sanitize(
    {
      model: 'm1',
      apiKey: 'sk-123',
      nested: { authorization: 'Bearer xyz', keep: 'ok' },
      signal: 'should-not-appear',
      callback: () => {},
    },
    config,
  )
  assert.equal(out.model, 'm1')
  assert.equal(out.apiKey, '***REDACTED***')
  assert.equal(out.nested.authorization, '***REDACTED***')
  assert.equal(out.nested.keep, 'ok')
  assert.equal(out.signal, undefined)
  assert.equal(out.callback, '[Function]')
})

test('sanitize 按配置保留密钥原文（redact=false）并支持截断', () => {
  const config = initConfig({ redact: false, maxStringLength: 5 })
  const out = sanitize({ apiKey: 'sk-1', long: 'abcdefghij' }, config)
  assert.equal(out.apiKey, 'sk-1')
  assert.ok(out.long.startsWith('abcde'))
  assert.ok(out.long.includes('+5 chars'))
})

test('sanitize 循环引用不抛出', () => {
  const config = initConfig({})
  const cyclic = { self: null }
  cyclic.self = cyclic
  const out = sanitize(cyclic, config)
  assert.ok(out.serializeError)
})

test('aggregator 聚合 StreamChunk 终态', () => {
  const aggregator = createAggregator()
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Hello' },
    { type: 'text-delta', index: 0, text: ' world' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello world' } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'bash', argumentsDelta: '{"command":"ls"}' },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-1', name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  for (const chunk of chunks) aggregator.push(chunk)
  const snapshot = aggregator.snapshot()
  assert.equal(snapshot.chunkCount, chunks.length)
  assert.equal(snapshot.blocks.length, 2)
  assert.equal(snapshot.blocks[0].text, 'Hello world')
  assert.equal(snapshot.blocks[1].name, 'bash')
  assert.deepEqual(snapshot.usage, { inputTokens: 100, outputTokens: 50 })
  assert.deepEqual(snapshot.finish, { kind: 'stop' })
})

test('CaptureStore 落盘单次捕获并写索引行', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const store = new CaptureStore(initConfig({ dir, pruneEvery: 1000 }))
    assert.equal(store.shouldCapture(['deepseek']), true)
    assert.equal(store.shouldCapture(['other']), true)

    const record = store.begin(['deepseek'], { model: 'v1', messages: [], apiKey: 'sk-x' })
    record.push({ type: 'block-end', index: 0, block: { type: 'text', text: 'hi' } })
    record.push({ type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } })
    record.push({ type: 'finish', reason: { kind: 'stop' } })
    const payload = await store.commit(record)

    assert.equal(payload.capture.ok, true)
    assert.equal(payload.capture.model, 'v1')
    assert.equal(payload.request.apiKey, '***REDACTED***')
    assert.equal(payload.response.blocks.length, 1)

    const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
    assert.equal(files.length, 1)
    const index = (await readFile(join(dir, 'index.jsonl'), 'utf8')).trim().split('\n')
    assert.equal(index.length, 1)
    assert.equal(JSON.parse(index[0]).file, files[0])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('CaptureStore 失败路径标记 ok=false，provider 过滤生效', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const store = new CaptureStore(initConfig({ dir, providers: ['deepseek'], pruneEvery: 1000 }))
    assert.equal(store.shouldCapture(['pi']), false)

    const record = store.begin(['deepseek'], { model: 'v1' })
    record.push({ type: 'finish', reason: { kind: 'error' } })
    const payload = await store.commit(record)
    assert.equal(payload.capture.ok, false)

    const thrown = store.begin(['deepseek'], { model: 'v1' })
    thrown.fail(Object.assign(new Error('boom'), { code: 'ECONNRESET' }))
    const payload2 = await store.commit(thrown)
    assert.equal(payload2.capture.ok, false)
    assert.equal(payload2.error.code, 'ECONNRESET')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('CaptureStore 按 maxFiles 轮转删除最旧捕获', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const store = new CaptureStore(initConfig({ dir, maxFiles: 2, pruneEvery: 1 }))
    for (let i = 0; i < 4; i++) {
      const record = store.begin(['deepseek'], { model: `m${i}` })
      record.push({ type: 'finish', reason: { kind: 'stop' } })
      await store.commit(record)
    }
    const remaining = (await readdir(dir)).filter((name) => name.endsWith('.json') && name !== 'index.jsonl')
    assert.equal(remaining.length, 2)
    const index = (await readFile(join(dir, 'index.jsonl'), 'utf8')).trim().split('\n')
    const survivors = new Set(store.written.map((item) => item.file))
    for (const line of index.slice(-2)) assert.ok(survivors.has(JSON.parse(line).file))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// —— apply 集成测试：wrapAdapter 必须同时覆盖两步协议（prepareCall→adapterCall.stream）
//    与单步 stream 协议。2026-08-24 真机复现：只包装 stream() 时，LlmRuntime 主路径
//    走 prepareCall()，捕获静默落空（web 会话 4k+ chunk 零落盘）。——

function fakeLlmContext(dir, config = {}) {
  const registered = []
  const llm = { registerAdapter: (providers, adapter) => registered.push({ providers, adapter }) }
  const ctx = { llm, on: () => {}, logger: () => ({ info() {}, warn() {} }) }
  apply(ctx, { dir, ...config })
  return { registered, llm }
}

function twoStepAdapter({ fail = false } = {}) {
  return {
    providerInfo: (p) => ({ id: p, name: p }),
    providerRetryPolicy: () => null,
    resolveModel: async (m) => m,
    listModels: async () => [],
    prepareCall(provider, model) {
      return Promise.resolve({
        model: { id: model, name: model },
        stream: async function* () {
          if (fail) throw new Error('boom')
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'hi' } }
          yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      })
    },
  }
}

const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
const captureFiles = async (dir) => (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'index.jsonl')

test('apply 包装 registerAdapter：两步协议（prepareCall→adapterCall.stream）调用落盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const { registered, llm } = fakeLlmContext(dir)
    const adapter = twoStepAdapter()
    llm.registerAdapter(['test'], adapter)
    const wrapped = registered[0].adapter
    assert.notEqual(wrapped, adapter, '两步协议适配器必须被包装')
    assert.equal(typeof wrapped.prepareCall, 'function')

    const call = await wrapped.prepareCall('test', 'm1')
    assert.equal(call.model.id, 'm1', 'Object.create 包装不破坏原 adapterCall.model')
    assert.equal(typeof call.stream, 'function')
    for await (const chunk of call.stream({ model: 'm1', messages: [] })) void chunk
    await settle()

    const files = await captureFiles(dir)
    assert.equal(files.length, 1, '两步协议调用应落盘 1 个捕获文件')
    const index = (await readFile(join(dir, 'index.jsonl'), 'utf8')).trim().split('\n')
    assert.equal(index.length, 1)
    assert.equal(JSON.parse(index[0]).file, files[0])
    const payload = JSON.parse(await readFile(join(dir, files[0]), 'utf8'))
    assert.equal(payload.capture.ok, true)
    assert.equal(payload.capture.model, 'm1')
    assert.equal(payload.response.blocks[0].text, 'hi')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('两步协议 stream 抛错：捕获流标记失败、重新抛出并落盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const { registered, llm } = fakeLlmContext(dir)
    const adapter = twoStepAdapter({ fail: true })
    llm.registerAdapter(['test'], adapter)
    const wrapped = registered[0].adapter
    const call = await wrapped.prepareCall('test', 'm1')
    await assert.rejects(
      async () => {
        for await (const chunk of call.stream({ model: 'm1' })) void chunk
      },
      /boom/,
    )
    await settle()

    const files = await captureFiles(dir)
    assert.equal(files.length, 1)
    const payload = JSON.parse(await readFile(join(dir, files[0]), 'utf8'))
    assert.equal(payload.capture.ok, false)
    assert.equal(payload.error.message, 'boom')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('apply 包装 registerAdapter：单步 stream 协议仍兼容（老适配器）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const { registered, llm } = fakeLlmContext(dir)
    const adapter = {
      providerInfo: (p) => ({ id: p, name: p }),
      providerRetryPolicy: () => null,
      resolveModel: async (m) => m,
      listModels: async () => [],
      async *stream() {
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'legacy' } }
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    llm.registerAdapter(['legacy'], adapter)
    const wrapped = registered[0].adapter
    assert.notEqual(wrapped, adapter)
    assert.equal(typeof wrapped.stream, 'function')
    for await (const chunk of wrapped.stream({ model: 'm1', messages: [] })) void chunk
    await settle()

    const files = await captureFiles(dir)
    assert.equal(files.length, 1)
    const payload = JSON.parse(await readFile(join(dir, files[0]), 'utf8'))
    assert.equal(payload.response.blocks[0].text, 'legacy')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('provider 过滤不命中时：适配器原样透传、不包装', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-capture-'))
  try {
    const { registered, llm } = fakeLlmContext(dir, { providers: ['deepseek'] })
    const adapter = twoStepAdapter()
    llm.registerAdapter(['pi'], adapter)
    assert.equal(registered[0].adapter, adapter, '不捕获的 provider 应原样透传')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

