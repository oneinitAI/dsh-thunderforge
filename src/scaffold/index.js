// ThunderForge scaffold 插件：把插件脚手架内化为模型工具。
// 生成 → 落盘 → （默认）立即冒烟，一条 execute 完成 PRD M2 的核心闭环。
// 规范依据 dsh-plugin-dev 技能 references/tools.md（defineTool、规范 JSON 值、错误路径）。
import { spawn } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_NAME_RE, TEMPLATES, scaffoldFiles } from './templates.js'

// 树外插件零 harness 导入（生态惯例，见 dsh-plugin-guide）：直接用原始 JSON Schema
// 定义注册工具，避免把 @deepseek-ai/dsh-tools 装进 profile 树造成 Symbol 双实例
//（曾导致 ctx.tools[TOOL_RUNTIME_SCHEDULER] undefined 崩溃，详见 CHANGELOG 0.1.5）。

export const name = 'thunderforge-scaffold'
export const inject = ['tools']

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

async function pathExists(path) {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

async function writeAll(root, files) {
  for (const [relative, body] of files) {
    const target = join(root, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body, 'utf8')
  }
}

// 在骨架目录里跑 node --test（自动发现），作为生成即验证的冒烟链路。
// 不用位置参数形式（node --test test/）：该形式在 Windows 下会被当作模块入口解析。
async function runSmoke(root, signal) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ['--test'], {
      cwd: root,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    const collect = (stream) => stream.on('data', (chunk) => {
      out += chunk
      if (out.length > 20_000) out = out.slice(-10_000)
    })
    collect(child.stdout)
    collect(child.stderr)
    child.on('error', (err) => resolvePromise({ ran: true, passed: false, summary: `spawn failed: ${err.message}` }))
    child.on('close', (code) => {
      const tail = out.trim().split('\n').slice(-3).join(' | ')
      resolvePromise({ ran: true, passed: code === 0, summary: tail })
    })
  })
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'thunderforge_scaffold',
    description:
      '生成一个带调试埋点与冒烟测试的 DSH 插件骨架（模板 tool/events/webui），默认生成后立即运行冒烟验证。用于"帮我建/写/初始化一个 DSH 插件"。',
    parameters: {
      type: 'object',
      properties: {
        plugin_name: { type: 'string', description: 'kebab-case 插件名，如 my-first-plugin' },
        template: { type: 'string', enum: [...TEMPLATES], description: '骨架形态：tool=模型工具，events=钩子/门禁，webui=界面' },
        dir: { type: 'string', description: '输出基目录（绝对或相对当前工作区），默认 "."，骨架落在 <dir>/dsh-<plugin_name>' },
        verify: { type: 'boolean', description: '生成后立即在骨架内运行 node --test 冒烟，默认 true' },
      },
      required: ['plugin_name', 'template'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          path: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        additionalProperties: true,
      },
      render: (_args, value) => [
        {
          type: 'text',
          text:
            value.status === 'ok'
              ? `已锻造 ${value.path}（${value.files.length} 个文件）。冒烟：${value.verify?.ran ? (value.verify.passed ? '通过 ✅' : `未通过 ❌ ${value.verify.summary}`) : '未运行'}。下一步：cd 进目录改 index.js，npm test 随时复验。`
              : `生成失败：${value.reason}`,
        },
      ],
    },
    async execute(args, exec) {
        const pluginName = args.plugin_name
        if (!PLUGIN_NAME_RE.test(pluginName)) {
          return { status: 'error', reason: `INVALID_PLUGIN_NAME: ${pluginName} 必须是 kebab-case`, path: '', files: [], verify: { ran: false } }
        }
        const root = join(resolve(args.dir ?? '.'), `dsh-${pluginName}`)
        if (await pathExists(root)) {
          return { status: 'error', reason: `TARGET_EXISTS: ${root} 已存在，换名或先清理`, path: root, files: [], verify: { ran: false } }
        }
        const files = scaffoldFiles({ pluginName, template: args.template })
        await writeAll(root, files)

        let verify = { ran: false }
        if (args.verify !== false) {
          try {
            verify = await runSmoke(root, exec?.signal)
          } catch (err) {
            verify = { ran: true, passed: false, summary: `verify error: ${err.message}` }
          }
        }
        return {
          status: 'ok',
          path: root,
          files: files.map(([relative]) => relative),
          verify,
          forgedBy: `${name} @ ${packageRoot}`,
        }
      },
  })
}
