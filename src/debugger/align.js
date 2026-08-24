// ThunderForge debugger 粘合层：把两条独立的数据流对齐成一条时间线。
//   数据源 A：会话日志事件（session-log.js 解码，事件带 time 毫秒时间戳）
//   数据源 B：thunderforge-capture 的 index.jsonl 索引流（每行 ts ISO + 文件引用）
// 对齐规则：按毫秒时间戳归并排序，同刻事件保持稳定序（session 先于 capture）。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 读取 capture 索引流；目录或文件不存在返回空（capture 未启用是正常态）。
 * 返回 { rows, corrupt }——corrupt 为解析失败行数（append 中断的 torn write），
 * 供 summary 上报，静默丢行至少可见。 */
export async function loadCaptureIndex(captureDir) {
  try {
    const text = await readFile(join(captureDir, 'index.jsonl'), 'utf8')
    let corrupt = 0
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          corrupt += 1
          return null
        }
      })
      .filter(Boolean)
      .map((row) => ({ ...row, timeMs: Date.parse(row.ts) }))
    return { rows, corrupt }
  } catch {
    return { rows: [], corrupt: 0 }
  }
}

/** 会话事件 → 时间线行（只保留有定位意义的里程碑，delta 类不进瀑布）。 */
const SESSION_MILESTONES = new Set([
  'turn/start',
  'step/start',
  'user/message',
  'assistant/message',
  'tool/call',
  'tool/result',
  'session/end-seed',
])

export function sessionRows(events) {
  return events
    .filter((event) => SESSION_MILESTONES.has(event.type))
    .map((event) => ({
      source: 'session',
      timeMs: event.time ?? 0,
      kind: event.type,
      label: labelFor(event),
    }))
}

function labelFor(event) {
  const data = event.data ?? {}
  switch (event.type) {
    case 'turn/start':
      return `turn ${data.turn}`
    case 'step/start':
      return `turn ${data.turn} · step ${data.step}`
    case 'user/message':
      return 'user message'
    case 'assistant/message':
      return 'assistant message'
    case 'tool/call':
      return `tool→ ${data.name ?? data.callId ?? '?'}`
    case 'tool/result':
      return `tool← ${data.name ?? data.callId ?? data.message?.source?.callId ?? '?'}`
    default:
      return event.type
  }
}

export function captureRows(indexRows) {
  return indexRows.map((row) => ({
    source: 'capture',
    timeMs: row.timeMs,
    kind: 'llm/call',
    label: `${row.provider}/${row.model} ${row.ok ? 'ok' : 'FAIL'} ${row.durationMs}ms`,
    captureFile: row.file,
    seq: row.seq,
  }))
}

/** 归并排序为统一瀑布；同刻保持稳定序（session 先，capture 后）。 */
export function buildTimeline(events, indexRows) {
  return [...sessionRows(events), ...captureRows(indexRows)].sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs
    if (a.source !== b.source) return a.source === 'session' ? -1 : 1
    return 0
  })
}

/** 会话概览 + capture 统计。indexRows 为 loadCaptureIndex 的 { rows, corrupt } 结果。 */
export function summarize(header, events, turns, indexRows) {
  const rows = Array.isArray(indexRows) ? indexRows : indexRows?.rows ?? []
  const corrupt = Array.isArray(indexRows) ? 0 : indexRows?.corrupt ?? 0
  const typeCounts = {}
  for (const event of events) typeCounts[event.type] = (typeCounts[event.type] ?? 0) + 1
  const steps = turns.reduce((sum, turn) => sum + turn.steps.length, 0)
  const toolCalls = turns.reduce(
    (sum, turn) => sum + turn.steps.reduce((inner, step) => inner + step.toolCalls.length, 0),
    0,
  )
  const times = events.map((event) => event.time).filter((t) => typeof t === 'number')
  const captureOk = rows.filter((row) => row.ok).length
  return {
    session: {
      id: header?.id ?? null,
      createdAt: header?.createdAt ?? null,
      cwd: header?.cwd ?? null,
      events: events.length,
      turns: turns.length,
      steps,
      toolCalls,
      startMs: times.length ? Math.min(...times) : null,
      endMs: times.length ? Math.max(...times) : null,
      typeCounts,
    },
    capture: {
      calls: rows.length,
      ok: captureOk,
      failed: rows.length - captureOk,
      totalDurationMs: rows.reduce((sum, row) => sum + (row.durationMs ?? 0), 0),
      indexCorruptLines: corrupt,
    },
  }
}

/** 瀑布渲染为模型友好的文本行。 */
export function renderTimeline(rows, { limit = 80, offset = 0 } = {}) {
  const slice = rows.slice(offset, offset + limit)
  const lines = slice.map((row) => {
    const clock = row.timeMs ? new Date(row.timeMs).toISOString().slice(11, 23) : '--:--:--.---'
    const ref = row.captureFile ? ` → ${row.captureFile}` : ''
    return `[${clock}] ${row.source.padEnd(7)} ${row.kind.padEnd(18)} ${row.label}${ref}`
  })
  return [`timeline: ${rows.length} 行（显示 ${slice.length}，offset ${offset}）`, ...lines].join('\n')
}
