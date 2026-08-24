// ThunderForge debugger 插件：轨迹瀑布模型工具。
// 会话日志解码 vendored 自 dsh-replay（MIT）；瀑布展示与双数据源对齐为 ThunderForge 自研，
// 概念参考 dsh-trajectory-debug（MIT，未 vendor 其 Web UI 实现，见 LICENSES 台账）。
import { readdir, stat } from 'node:fs/promises'
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
          enum: ['sessions', 'summary', 'waterfall'],
          description: 'sessions=列出可用会话，summary=单会话概览，waterfall=对齐时间线',
        },
        session: { type: 'string', description: '会话日志路径或 id 片段；默认最新会话' },
        capture_dir: { type: 'string', description: 'capture 输出目录，默认 thunderforge-capture 配置值' },
        limit: { type: 'number', description: 'waterfall 显示行数，默认 80' },
        offset: { type: 'number', description: 'waterfall 起始偏移，默认 0' },
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
          return { file: target.file, ...summarize(header, events, turns, { rows: indexRows, corrupt }) }
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
