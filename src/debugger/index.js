// ThunderForge debugger 插件：轨迹瀑布模型工具。
// 会话日志解码 vendored 自 dsh-replay（MIT）；瀑布展示与双数据源对齐为 ThunderForge 自研，
// 概念参考 dsh-trajectory-debug（MIT，未 vendor 其 Web UI 实现，见 LICENSES 台账）。
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { dshHome } from '../profile/dshp/profile.js'
import { initConfig } from '../capture/core.js'
import { buildTimeline, captureRows, loadCaptureIndex, renderTimeline, summarize } from './align.js'
import { decodeSession, reconstruct } from './session-log.js'

export const name = 'thunderforge-debugger'
export const inject = ['tools']

const SESSION_FILE = 'session.jsonl.zstd'

/** 扫描 $DSH_HOME/sessions 下全部会话日志，按 mtime 新→旧排序。 */
export async function findSessions(sessionsRoot) {
  const root = sessionsRoot ?? join(dshHome(), 'sessions')
  const found = []
  try {
    for (const workspace of await readdir(root, { withFileTypes: true })) {
      if (!workspace.isDirectory()) continue
      const workspaceDir = join(root, workspace.name)
      for (const session of await readdir(workspaceDir, { withFileTypes: true })) {
        if (!session.isDirectory() || !session.name.startsWith('session-')) continue
        const file = join(workspaceDir, session.name, SESSION_FILE)
        try {
          const info = await stat(file)
          found.push({ file, mtimeMs: info.mtimeMs, workspace: workspace.name, session: session.name })
        } catch {
          // 无日志文件的会话目录，跳过
        }
      }
    }
  } catch {
    // sessions 根不存在：无会话可列
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function resolveSession(sessionArg, sessions) {
  if (!sessionArg || sessionArg === 'latest') {
    return sessions[0] ?? null
  }
  const needle = sessionArg.replaceAll('\\', '/')
  return sessions.find((entry) => entry.file.replaceAll('\\', '/').includes(needle)) ?? null
}

/** 读单个 capture 载荷 JSON；损坏返回 null（由调用方决定报错形态）。 */
async function readCapturePayload(captureDir, file) {
  try {
    return JSON.parse(await readFile(join(captureDir, file), 'utf8'))
  } catch {
    return null
  }
}

/** 浅层递归 diff：收集叶子值不同的路径（数组按索引、对象按键）。 */
function diffLeaves(a, b, path = '', out = []) {
  const bothObjects = (x) => x !== null && typeof x === 'object'
  if (!bothObjects(a) || !bothObjects(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: path || '(root)', a, b })
    return out
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    diffLeaves(a?.[key], b?.[key], `${path}.${key}`, out)
  }
  return out
}

/** 聚合 capture 载荷里的 usage tokens；price 提供时输出估算金额。 */
async function aggregateUsage(captureDir, rows, price) {
  let inputTokens = 0
  let outputTokens = 0
  let scannedFiles = 0
  for (const row of rows.slice(0, 500)) { // 上限保护：避免超大目录全量扫盘
    const payload = await readCapturePayload(captureDir, row.file)
    const usage = payload?.response?.usage
    if (usage && typeof usage === 'object') {
      inputTokens += usage.inputTokens ?? 0
      outputTokens += usage.outputTokens ?? 0
      scannedFiles += 1
    }
  }
  const result = { usage: { inputTokens, outputTokens }, scannedFiles }
  if (price && typeof price.input === 'number' && typeof price.output === 'number') {
    result.estimatedCostUsd = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output
  }
  return result
}

export function apply(ctx) {
  ctx.tools.register({
      name: 'thunderforge_debugger',
      description:
        '检查/回放 DSH 会话轨迹：列出会话、输出概览（turns/steps/工具调用/capture 统计）或渲染双数据源对齐的轨迹瀑布（会话事件 × thunderforge-capture 载荷记录）。用于"我的插件跑的时候发生了什么/为什么慢/哪次模型调用出错了"。',
      parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        op: {
          type: 'string',
          enum: ['sessions', 'summary', 'waterfall', 'watch', 'browse', 'diff'],
          description: 'sessions=列出可用会话，summary=单会话概览（含 token 聚合），waterfall=对齐时间线，watch=增量快照，browse=表格化浏览 capture 记录，diff=对比两个 capture 载荷',
        },
        session: { type: 'string', description: '会话日志路径或 id 片段；默认最新会话' },
        capture_dir: { type: 'string', description: 'capture 输出目录，默认 thunderforge-capture 配置值' },
        limit: { type: 'number', description: 'waterfall/watch 显示行数、browse 每页行数，默认 80' },
        offset: { type: 'number', description: 'waterfall 起始偏移，默认 0' },
        since_ts: { type: 'number', description: 'watch 专用：只看该毫秒时间戳之后的事件；返回值带 next_since_ts 供下次轮询传入' },
        filter: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'browse 专用：按 ok 过滤' },
            provider: { type: 'string', description: 'browse 专用：按 provider 过滤（精确匹配）' },
          },
        },
        a: { type: 'string', description: 'diff 专用：载荷文件名 A（capture 目录内）' },
        b: { type: 'string', description: 'diff 专用：载荷文件名 B' },
        price_usd_per_m: {
          type: 'object',
          additionalProperties: false,
          properties: {
            input: { type: 'number', description: '每百万输入 token 单价（USD）' },
            output: { type: 'number', description: '每百万输出 token 单价（USD）' },
          },
          description: 'summary 专用：提供时按聚合 token 估算成本；不提供则只报 token 数',
        },
        },
        required: ['op'],
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        const sessions = await findSessions()
        if (args.op === 'sessions') {
          if (!sessions.length) return { sessions: [], note: '未找到会话日志（检查 DSH_HOME）' }
          return {
            sessions: sessions.slice(0, 20).map((entry) => ({
              session: entry.session,
              workspace: entry.workspace,
              mtime: new Date(entry.mtimeMs).toISOString(),
              file: entry.file,
            })),
          }
        }

        const target = await resolveSession(args.session, sessions)
        if (!target) {
          return { error: 'SESSION_NOT_FOUND', hint: '先用 op=sessions 列出可用会话' }
        }
        const { header, events } = decodeSession(target.file)
        const turns = reconstruct(events)
        const captureDir = args.capture_dir ?? initConfig({}).dir
        const { rows: indexRows, corrupt } = await loadCaptureIndex(captureDir)

        if (args.op === 'summary') {
          const summary = summarize(header, events, turns, { rows: indexRows, corrupt })
          // 成本仪表：聚合载荷 usage；price_usd_per_m 提供时才估算金额（不内置会过时的单价）
          summary.capture.usage = { inputTokens: 0, outputTokens: 0 }
          summary.capture.scannedFiles = 0
          const price = args.price_usd_per_m
          const agg = await aggregateUsage(captureDir, indexRows, price)
          Object.assign(summary.capture, agg)
          return { file: target.file, ...summary }
        }

        // 表格化浏览 capture 记录（结构化 rows 而非纯文本，便于二次处理）
        if (args.op === 'browse') {
          let rows = indexRows
          if (args.filter?.ok !== undefined) rows = rows.filter((row) => row.ok === args.filter.ok)
          if (args.filter?.provider) rows = rows.filter((row) => row.provider === args.filter.provider)
          const total = rows.length
          const limit = args.limit ?? 80
          const offset = args.offset ?? 0
          return {
            capture_dir: captureDir,
            total,
            offset,
            rows: rows.slice(offset, offset + limit).map((row) => ({
              seq: row.seq,
              ts: row.ts,
              provider: row.provider,
              model: row.model,
              ok: row.ok,
              durationMs: row.durationMs,
              file: row.file,
            })),
          }
        }

        // 对比两个 capture 载荷：叶子级差异 + 相同顶层键（回归排查"升级后行为变了"）
        if (args.op === 'diff') {
          if (!args.a || !args.b) {
            return { error: 'MISSING_FILES', hint: 'diff 需要提供 a 与 b 两个载荷文件名（capture 目录内）' }
          }
          const payloadA = await readCapturePayload(captureDir, args.a)
          const payloadB = await readCapturePayload(captureDir, args.b)
          if (!payloadA || !payloadB) {
            return { error: 'PAYLOAD_NOT_FOUND', a: payloadA ? args.a : args.a, missing: payloadA ? args.b : args.a }
          }
          const differences = diffLeaves(payloadA, payloadB).slice(0, 200)
          const topA = new Set(Object.keys(payloadA))
          const similarities = [...Object.keys(payloadB)].filter((key) => topA.has(key))
          return { a: args.a, b: args.b, differences, differenceCount: diffLeaves(payloadA, payloadB).length, similarities }
        }

        // R10 增量快照：自 since_ts 以来的会话里程碑 + capture 调用（长任务轮询观察，
        // 不必等会话结束再拉全量 waterfall）。返回 next_since_ts 供下次轮询传入。
        if (args.op === 'watch') {
          const since = Number.isFinite(args.since_ts) ? args.since_ts : Date.now() - 60_000
          const recentEvents = events.filter((e) => typeof e.time === 'number' && e.time >= since)
          const recentCaptures = indexRows.filter((row) => row.timeMs >= since)
          const timeline = buildTimeline(recentEvents, recentCaptures)
          const now = Date.now()
          return {
            file: target.file,
            text: renderTimeline(timeline, { limit: args.limit ?? 40 }),
            newRows: timeline.length,
            captureNew: recentCaptures.length,
            next_since_ts: now,
            hint: timeline.length === 0 ? '窗口内无新事件——稍后用同一 next_since_ts 再轮询' : undefined,
          }
        }

        const timeline = buildTimeline(events, indexRows)
        return {
          file: target.file,
          text: renderTimeline(timeline, { limit: args.limit ?? 80, offset: args.offset ?? 0 }),
          totalRows: timeline.length,
        }
      },
  })
}
