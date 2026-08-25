// ThunderForge scaffold 插件：把插件脚手架内化为模型工具。
// 生成 → 落盘 → （默认）立即冒烟，一条 execute 完成 PRD M2 的核心闭环；
// thunderforge_upgrade 对存量骨架做结构对比，输出迁移建议（R7）。
import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_NAME_RE, TEMPLATES, scaffoldFiles } from './templates.js'
import { checkRawToolContract } from '../contract/index.js'
import { scaffoldConfig } from '../engine-configs.js'

// 树外插件零 harness 导入（生态惯例，见 dsh-plugin-guide）：直接用原始 JSON Schema
// 定义注册工具，避免把 @deepseek-ai/dsh-tools 装进 profile 树造成 Symbol 双实例
//（曾导致 ctx.tools[TOOL_RUNTIME_SCHEDULER] undefined 崩溃，详见 CHANGELOG 0.1.5）。

export const name = 'thunderforge-scaffold'
export const inject = ['tools']

// Web 设置面板配置声明
export const Config = scaffoldConfig()

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
// 导出供 release 引擎复用（ponytail 阶梯②：库内已有就不重写）。
export async function runSmoke(root, signal) {
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

export function apply(ctx, config = {}) {
  if (config.disabled === true) return
  const defaultVerify = config.verify !== false
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
        if (args.verify ?? defaultVerify) {
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

  // R7 骨架 upgrade 器：对比存量骨架与最新模板的结构差异，输出迁移建议清单。
  // 只建议不代改——用户代码是用户的地盘，动它之前永远先问。
  ctx.tools.register({
    name: 'thunderforge_upgrade',
    description:
      '检查 ThunderForge 生成的插件骨架是否落后于最新模板：对比文件清单、调试埋点声明（thunderforge.debug.json）与工具契约，输出迁移建议清单。只建议不代改。用于"我的骨架是老版本生成的/升级 thunderforge 后要跟进什么"。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dir: { type: 'string', description: '骨架目录（含 package.json 与 index.js），绝对或相对当前工作区' },
        template: { type: 'string', enum: [...TEMPLATES, 'llm-adapter'], description: '骨架形态；缺省时从 thunderforge.debug.json 读取' },
      },
      required: ['dir'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{
        type: 'text',
        text: typeof value === 'string'
          ? value
          : `${value.ok ? '✅ 与最新模板一致' : `⚠️ ${value.suggestions.length} 条迁移建议`}\n${(value.suggestions ?? []).map((s) => `- [${s.kind}] ${s.detail}`).join('\n')}`,
      }],
    },
    async execute(args) {
      const root = resolve(args.dir ?? '.')
      let rootStat
      try {
        rootStat = await stat(root)
        if (!rootStat.isDirectory()) return { ok: false, error: 'NOT_A_DIRECTORY', dir: root }
      } catch {
        return { ok: false, error: 'DIR_NOT_FOUND', dir: root, hint: '目录不存在，检查路径' }
      }

      // 读埋点清单拿 template 与 pluginName
      let template = args.template
      let pluginName
      try {
        const manifest = JSON.parse(await readFile(join(root, 'thunderforge.debug.json'), 'utf8'))
        template = template ?? manifest.template
        if (manifest.instrumentation?.events?.prefix) {
          pluginName = String(manifest.instrumentation.events.prefix).replace(/\/$/, '')
        }
      } catch {
        /* 无 debug 清单——继续用参数与 package.json 推导 */
      }
      if (!TEMPLATES.includes(template) && template !== 'llm-adapter') {
        return { ok: false, error: 'TEMPLATE_UNKNOWN', hint: `无法确定模板形态，请用 template 参数显式指定（${[...TEMPLATES, 'llm-adapter'].join('/')}）`, dir: root }
      }
      if (!pluginName) {
        try {
          const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
          pluginName = String(pkg.name ?? '').replace(/^dsh-/, '')
        } catch {
          /* 保持 undefined */
        }
      }
      if (!pluginName || !PLUGIN_NAME_RE.test(pluginName)) pluginName = 'upgraded-skeleton'

      /** 最新模板产物（作为对比基准）。 */
      const latest = new Map(scaffoldFiles({ pluginName, template }))
      /** @type {{kind: string, detail: string}[]} 建议清单 */
      const suggestions = []

      // ① 文件清单差异：最新模板有而本地缺失的文件
      for (const [relative] of latest) {
        try {
          await stat(join(root, relative))
        } catch {
          suggestions.push({ kind: 'missing-file', detail: `缺少 ${relative}——新模板包含它（如 CI/测试/埋点清单），建议从新骨架补入并适配你的实现` })
        }
      }

      // ② 调试埋点声明对比：instrumentation 键结构是否落后
      try {
        const manifest = JSON.parse(await readFile(join(root, 'thunderforge.debug.json'), 'utf8'))
        const latestManifest = JSON.parse(latest.get('thunderforge.debug.json'))
        const flatKeys = (obj, prefix = '') => Object.entries(obj ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
        const localKeys = new Set(flatKeys(manifest))
        for (const key of flatKeys(latestManifest)) {
          if (!localKeys.has(key)) {
            suggestions.push({ kind: 'stale-manifest', detail: `thunderforge.debug.json 缺少埋点声明 "${key.replace(/\.$/, '')}"——对照最新模板补齐，debugger/capture 的对齐依赖它` })
            break // 同类提示一条足够
          }
        }
        if (!String(manifest.scaffoldedBy ?? '').includes('thunderforge-scaffold')) {
          suggestions.push({ kind: 'not-forge-born', detail: '该目录没有 thunderforge-scaffold 的生成标记（scaffoldedBy），可能不是本工具生成的骨架——建议仅供参考' })
        }
      } catch {
        suggestions.push({ kind: 'missing-manifest', detail: '缺少 thunderforge.debug.json——调试埋点声明缺失，capture 索引流与事件前缀的对齐依赖它' })
      }

      // ③ 工具契约自检：入口可加载则顺带校验（非工具类骨架会自然跳过）
      try {
        const mod = await import(`file://${join(root, 'index.js').replaceAll('\\', '/')}`)
        if (typeof mod.apply === 'function') {
          const defs = []
          await mod.apply({
            tools: { register: (d) => defs.push(d) },
            on: () => {},
            effect: (fn) => (typeof fn === 'function' ? fn() : undefined),
            logger: () => ({ info() {}, warn() {} }),
          }, {})
          for (const def of defs) {
            const { ok, violations } = checkRawToolContract(def, def.name ?? 'unnamed_tool')
            if (!ok) suggestions.push({ kind: 'contract', detail: violations.join('；') })
          }
        }
      } catch {
        suggestions.push({ kind: 'entry-load', detail: 'index.js 无法在当前环境加载（可能依赖宿主服务）——契约自检跳过，可在宿主 profile 里用 dsh-thunderforge/contract 复核' })
      }

      return { ok: suggestions.length === 0, dir: root, template, suggestions, checkedAgainst: `thunderforge-scaffold 最新模板（${template}）` }
    },
  })
}
