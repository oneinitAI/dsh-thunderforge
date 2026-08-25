import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { apply, findSessions, name as pluginName, Config } from '../src/debugger/index.js'
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

test('apply 接收 config：默认 limit 与禁用开关', async () => {
  // S-config：debugger 配置入口（ponytail 后补的正式化——之前 limit 硬编码 80）
  const defs = []
  apply({ tools: { register: (d) => defs.push(d) } }, { waterfallLimit: 5 })
  const tool = defs[0]
  assert.equal(typeof tool.execute, 'function')
  // disabled: true 时工具不注册
  const defs2 = []
  apply({ tools: { register: (d) => defs2.push(d) } }, { disabled: true })
  assert.equal(defs2.length, 0, 'disabled:true 应跳过注册')
})

test('settings 域集成：面板值覆盖 patch base，无 settings 服务时回退', () => {
  // S-settings：三级优先（settings 用户分节 > patch base > 默认）。
  // 注意：宿主无 schemastery 时 Config 为 undefined（零依赖回退），此时跳过注册直接用 patch+默认。
  const hasSchema = Config !== undefined

  const defs = []
  const registrations = []
  const stored = { 'thunderforge-debugger': { waterfallLimit: 7 } }
  const ctx = {
    tools: { register: (d) => defs.push(d) },
    ...(hasSchema
      ? {
          settings: {
            register: (ns, schema, options) => {
              registrations.push({ ns, schema, options })
              return { get: () => ({ ...(options?.base ?? {}), ...(stored[ns] ?? {}) }) }
            },
          },
        }
      : {}),
  }
  apply(ctx, { waterfallLimit: 99 })
  if (hasSchema) {
    assert.equal(registrations.length, 1, '有 schemastery 时应注册 settings namespace')
    assert.equal(registrations[0].ns, 'thunderforge-debugger')
    assert.equal(registrations[0].options.base.waterfallLimit, 99, 'patch 行 config 应作为 base')
  } else {
    assert.equal(defs.length, 1, '零依赖回退：工具仍应注册')
    assert.equal(typeof defs[0].execute, 'function')
  }

  // 无 settings 服务的环境：回退到 patch + 默认
  const defs2 = []
  apply({ tools: { register: (d) => defs2.push(d) } }, {})
  assert.equal(defs2.length, 1)
})

test('watch 增量快照：since_ts 之后的事件可见，未来窗口为空并带 next_since_ts', async () => {
  const { root, captureDir } = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    const [tool] = mockCtx()
    // fixture 事件在 T0 与 T0+100 之间；取 T0+50 为窗口起点 → 只见后半段
    const out = await tool.execute({ op: 'watch', capture_dir: captureDir, since_ts: T0 + 50 })
    assert.ok(out.newRows > 0)
    assert.equal(typeof out.next_since_ts, 'number')
    assert.ok(out.text.includes('session'))
    // 未来窗口：无新事件但有轮询锚点
    const idle = await tool.execute({ op: 'watch', capture_dir: captureDir, since_ts: Date.now() + 5_000 })
    assert.equal(idle.newRows, 0)
    assert.match(idle.hint, /无新事件/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('browse 表格化列出 capture 记录且支持 ok 过滤', async () => {
  // RED→GREEN：S-browse。fixture 索引有 ok:true 与 ok:false 各一条。
  const { root, captureDir } = await fixture()
  try {
    const [tool] = mockCtx()
    const all = await tool.execute({ op: 'browse', capture_dir: captureDir })
    assert.equal(all.total, 2)
    assert.equal(all.rows.length, 2)
    assert.deepEqual(
      { seq: all.rows[0].seq, provider: all.rows[0].provider, model: all.rows[0].model, ok: all.rows[0].ok },
      { seq: 1, provider: 'deepseek', model: 'v1', ok: true },
    )
    assert.equal(typeof all.rows[0].file, 'string')
    const onlyOk = await tool.execute({ op: 'browse', capture_dir: captureDir, filter: { ok: true } })
    assert.equal(onlyOk.total, 1)
    assert.equal(onlyOk.rows[0].ok, true)
    const limited = await tool.execute({ op: 'browse', capture_dir: captureDir, limit: 1 })
    assert.equal(limited.rows.length, 1)
    assert.equal(limited.total, 2, 'total 不受 limit 影响')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('diff 对比两个 capture 载荷并输出结构差异', async () => {
  // RED→GREEN：S-diff。写两个载荷文件：同模型不同 usage/finish。
  const { root, captureDir } = await fixture()
  try {
    await writeFile(join(captureDir, '000001-x.json'), JSON.stringify({
      capture: { seq: 1, ts: '2026-08-22T10:00:00.000Z', providers: ['deepseek'], model: 'v1', ok: true, durationMs: 100 },
      request: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
      response: { blocks: [], usage: { inputTokens: 10, outputTokens: 5 }, finish: { kind: 'stop' } },
    }), 'utf8')
    await writeFile(join(captureDir, '000002-x.json'), JSON.stringify({
      capture: { seq: 2, ts: '2026-08-22T10:00:01.000Z', providers: ['deepseek'], model: 'v1', ok: false, durationMs: 250 },
      request: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'more' }] }] },
      response: { blocks: [], usage: { inputTokens: 20, outputTokens: 9 }, finish: { kind: 'error' } },
    }), 'utf8')
    const [tool] = mockCtx()
    const out = await tool.execute({ op: 'diff', capture_dir: captureDir, a: '000001-x.json', b: '000002-x.json' })
    assert.equal(out.a, '000001-x.json')
    assert.equal(out.b, '000002-x.json')
    assert.ok(out.differences.length >= 3, `至少应报 durationMs/usage/finish 差异：${JSON.stringify(out.differences)}`)
    assert.ok(out.differences.some((d) => d.path.includes('durationMs')))
    assert.ok(out.differences.some((d) => d.path.includes('outputTokens')))
    assert.ok(out.similarities.length >= 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summary 聚合 token 用量；提供 priceTable 时输出估算金额', async () => {
  // RED→GREEN：S-cost。给两个载荷文件各带 usage，断言聚合与金额公式。
  const { root, captureDir } = await fixture()
  try {
    await writeFile(join(captureDir, '000001-x.json'), JSON.stringify({
      capture: { seq: 1, ts: 'x', providers: ['deepseek'], model: 'v1', ok: true, durationMs: 1 },
      request: {},
      response: { blocks: [], usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }, finish: {} },
    }), 'utf8')
    const [tool] = mockCtx()
    const bare = await tool.execute({ op: 'summary', capture_dir: captureDir })
    assert.deepEqual(bare.capture.usage, { inputTokens: 1_000_000, outputTokens: 1_000_000 })
    assert.equal(bare.capture.estimatedCostUsd, undefined, '无单价表时不编造金额')
    const priced = await tool.execute({
      op: 'summary',
      capture_dir: captureDir,
      price_usd_per_m: { input: 0.27, output: 1.1 },
    })
    // 1M input × $0.27 + 1M output × $1.1 = 0.27 + 1.1
    assert.ok(Math.abs(priced.capture.estimatedCostUsd - 1.37) < 1e-9, JSON.stringify(priced.capture))
    assert.equal(priced.capture.scannedFiles, 1)
  } finally {
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
