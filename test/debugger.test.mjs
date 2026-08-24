import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { apply, findSessions, name as pluginName } from '../src/debugger/index.js'
import { decodeSession } from '../src/debugger/session-log.js'

// 合成会话（纯 JSONL——decodeSession 原生支持非 zstd 明文）
const T0 = Date.parse('2026-08-22T10:00:00Z')
const SESSION_JSONL = [
  JSON.stringify({ type: 'session', version: 1, id: 'sess-fixture', createdAt: '2026-08-22T10:00:00Z', cwd: '/w' }),
  JSON.stringify({ type: 'turn/start', seq: 1, time: T0, data: { turn: 1 } }),
  JSON.stringify({ type: 'user/message', seq: 2, time: T0 + 10, data: { content: [{ type: 'text', text: '帮我问候' }], source: { kind: 'user' } } }),
  JSON.stringify({ type: 'step/start', seq: 3, time: T0 + 20, data: { turn: 1, step: 1 } }),
  JSON.stringify({
    type: 'assistant/message', seq: 4, time: T0 + 30, data: { turn: 1, step: 1,
    message: { content: [
      { type: 'text', text: '调用工具' },
      { type: 'tool-call', callId: 'c1', name: 'greet', arguments: '{"name":"Thor"}' },
    ] } },
  }),
  JSON.stringify({ type: 'tool/call', seq: 5, time: T0 + 40, data: { turn: 1, step: 1, callId: 'c1', name: 'greet' } }),
  JSON.stringify({ type: 'tool/result', seq: 6, time: T0 + 60, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'c1' } } } }),
  JSON.stringify({ type: 'assistant/message', seq: 7, time: T0 + 80, data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: '完成' }] } } }),
  JSON.stringify({ type: 'turn/start', seq: 8, time: T0 + 100, data: { turn: 2 } }),
].join('\n')

const CAPTURE_INDEX = [
  JSON.stringify({ seq: 1, ts: '2026-08-22T10:00:00.025Z', file: '000001-x.json', provider: 'deepseek', model: 'v1', ok: true, durationMs: 35 }),
  JSON.stringify({ seq: 2, ts: '2026-08-22T10:00:00.075Z', file: '000002-x.json', provider: 'deepseek', model: 'v1', ok: false, durationMs: 12 }),
].join('\n')

// 带 torn write 的索引：一行被截断成非法 JSON——loadCaptureIndex 必须跳过并计数
const CAPTURE_INDEX_TORN = CAPTURE_INDEX + '\n{"seq":3,"ts":"2026-08-22T10:00:00.1'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tf-debug-'))
  const sessionsRoot = join(root, 'sessions')
  await mkdir(join(sessionsRoot, 'ws', 'session-fixture'), { recursive: true })
  await writeFile(join(sessionsRoot, 'ws', 'session-fixture', 'session.jsonl.zstd'), SESSION_JSONL, 'utf8')
  const captureDir = join(root, 'captures')
  await mkdir(captureDir, { recursive: true })
  await writeFile(join(captureDir, 'index.jsonl'), CAPTURE_INDEX, 'utf8')
  return { root, sessionsRoot, captureDir }
}

function mockCtx() {
  const definitions = []
  apply({ tools: { register: (def) => definitions.push(def) } })
  return definitions
}

test('findSessions 扫描并按新→旧排序', async () => {
  const { root, sessionsRoot } = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    const sessions = await findSessions()
    assert.equal(sessions.length, 1)
    assert.ok(sessions[0].file.includes('session-fixture'))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('summary 汇总会话与 capture 统计', async () => {
  const { root, captureDir } = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    const [tool] = mockCtx()
    assert.equal(pluginName, 'thunderforge-debugger')
    const out = await tool.execute({ op: 'summary', capture_dir: captureDir })
    assert.equal(out.session.id, 'sess-fixture')
    assert.equal(out.session.turns, 2)
    assert.equal(out.session.toolCalls, 1)
    assert.deepEqual({ calls: out.capture.calls, ok: out.capture.ok, failed: out.capture.failed }, { calls: 2, ok: 1, failed: 1 })
    assert.equal(out.capture.indexCorruptLines, 0)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('capture 索引损坏行被跳过并在 summary 中计数（torn write 可见）', async () => {
  const { root } = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    // 覆盖 index 为带损坏行的版本
    const captureDir = join(root, 'captures')
    await writeFile(join(captureDir, 'index.jsonl'), CAPTURE_INDEX_TORN, 'utf8')
    const [tool] = mockCtx()
    const out = await tool.execute({ op: 'summary', capture_dir: captureDir })
    assert.equal(out.capture.calls, 2, '损坏行不计入 rows')
    assert.equal(out.capture.indexCorruptLines, 1, '损坏行必须计数上报')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('waterfall 双数据源按时间对齐且 capture 行带文件引用', async () => {
  const { root, captureDir } = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    const [tool] = mockCtx()
    const out = await tool.execute({ op: 'waterfall', capture_dir: captureDir })
    assert.ok(out.text.includes('session'))
    assert.ok(out.text.includes('capture'))
    assert.ok(out.text.includes('000001-x.json'))
    assert.ok(out.text.includes('FAIL'), '失败调用应在瀑布中可见')
    // capture 两行都应出现在时间线里
    assert.ok(out.text.includes('000002-x.json'))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('sessions 与找不到会话时的错误值', async () => {
  const { root } = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    const [tool] = mockCtx()
    const list = await tool.execute({ op: 'sessions' })
    assert.equal(list.sessions.length, 1)
    const missing = await tool.execute({ op: 'summary', session: 'no-such-id' })
    assert.equal(missing.error, 'SESSION_NOT_FOUND')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('decodeSession 解码多帧 zstd 容器（真实会话形态）', () => {
  // dsh 会话日志是逐帧追加的 zstd 拼接容器；两帧各含部分行，解码后必须完整合并
  const linesA = [SESSION_JSONL.split('\n').slice(0, 4).join('\n'), '']
  const linesB = SESSION_JSONL.split('\n').slice(4).join('\n')
  const container = Buffer.concat([
    zstdCompressSync(Buffer.from(linesA.join('\n'), 'utf8')),
    zstdCompressSync(Buffer.from(linesB, 'utf8')),
  ])
  const { header, events } = decodeSession(container)
  assert.equal(header.id, 'sess-fixture')
  // 明文 fixture 共 9 行（1 header + 8 事件），chunk 行不在此列
  assert.equal(events.length, 8)
})

test('decodeSession 容忍 torn tail（写入中断的截断字节）', () => {
  // 真实场景：进程在追加下一帧时被杀，文件尾部留下半个 zstd 帧。
  // 已完成帧的数据必须可用，残尾静默忽略且不抛错。
  const complete = zstdCompressSync(Buffer.from(SESSION_JSONL, 'utf8'))
  const torn = zstdCompressSync(Buffer.from('{"type":"turn/end",', 'utf8')).subarray(0, 18)
  const { events } = decodeSession(Buffer.concat([complete, torn]))
  assert.equal(events.length, 8)
})
