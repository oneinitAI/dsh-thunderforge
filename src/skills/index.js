// ThunderForge skills 插件：把随包分发的三层知识库注册进 ctx.skills。
// 挂载方式依据 docs/notes/m1-skill-loading.md 的调研结论：
//   ctx.skills.register(SkillRegistration) 内联注册 + 目录 resourceBase
//   解析正文中的相对资源（references/、examples/、guide/）。
// 注册模式参考 dsh-plugin-guide（Apache-2.0，见 LICENSES 台账）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { skillsConfig } from '../engine-configs.js'

export const name = 'thunderforge-skills'
export const inject = ['skills']

// Web 设置面板配置声明（宿主无 schemastery 时为 undefined）
export const Config = skillsConfig()

// 层开关（entryLayer/archLayer/pitfallsLayer/buddyLayer，默认全开）经 config 传入；
// 树外插件零 harness 导入，不导出 Schemastery Config（避免 Symbol 双实例，见 CHANGELOG 0.1.5）

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const skillsRoot = join(packageRoot, 'skills')

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// 层顺序即注册顺序；enabled 可在 config 里关闭任一层
export const LAYERS = [
  { key: 'entry', dir: 'thunderforge-dev', enabledConfig: 'entryLayer' },
  { key: 'arch', dir: 'arch-standard', enabledConfig: 'archLayer' },
  { key: 'pitfalls', dir: 'pitfalls', enabledConfig: 'pitfallsLayer' },
  { key: 'buddy', dir: 'dsh-buddy', enabledConfig: 'buddyLayer' },
  { key: 'checklist', dir: 'plugin-checklist', enabledConfig: 'checklistLayer' },
]

/**
 * 拆出 YAML frontmatter 的 name/description 与正文。
 * 只认单行值（两个上游技能均为单行）；缺失或畸形时回退全文为正文。
 */
function splitFrontmatter(rawText) {
  const text = rawText.replaceAll('\r\n', '\n')
  if (!text.startsWith('---\n')) return { name: undefined, description: undefined, body: text }
  const end = text.indexOf('\n---', 4)
  if (end < 0) return { name: undefined, description: undefined, body: text }
  const meta = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\n+/, '')
  const name = /^name:\s*(.+)$/m.exec(meta)?.[1]?.trim()
  const description = /^description:\s*(.+)$/m.exec(meta)?.[1]?.trim()
  return { name, description, body }
}

export function loadSkillDir(dir) {
  const root = join(skillsRoot, dir)
  const { name, description, body } = splitFrontmatter(readFileSync(join(root, 'SKILL.md'), 'utf8'))
  return { root, name, description, body }
}

export function apply(ctx, config = {}) {
  let registered = 0
  for (const layer of LAYERS) {
    if (config[layer.enabledConfig] === false) continue
    let skill
    try {
      skill = loadSkillDir(layer.dir)
    } catch (err) {
      ctx?.logger?.(name)?.warn?.(`技能目录 ${layer.dir} 读取失败，跳过：${err.message}`)
      continue
    }
    if (!skill.name || !SKILL_NAME_RE.test(skill.name)) {
      ctx?.logger?.(name)?.warn?.(`技能目录 ${layer.dir} 的 name "${skill.name}" 不合法，跳过`)
      continue
    }
    registered += 1
    // 注册是 effect：dispose 插件 fiber 即注销该技能（HMR 安全）
    ctx.effect(() =>
      ctx.skills.register({
        name: skill.name,
        source: 'bundled',
        description: skill.description ?? `${skill.name} (ThunderForge ${layer.key} layer)`,
        content: skill.body,
        resourceBase: { kind: 'directory', path: skill.root },
      }),
    )
  }

  // R3 preset 盲区探测：agent preset 为 minimal（极简模式）时 dsh 不挂载 skill 工具，
  // `<available_skills>` 也不注入 system——技能注册成功但模型永远无法触发，且无任何报错。
  // 延迟探测（等 tool-skill 完成注册），不可达则显式警告，把静默盲区变成可排障信号。
  const probeDelayMs = Number(config.probeDelayMs ?? 8000)
  if (registered > 0 && probeDelayMs > 0) {
    const probe = setTimeout(() => {
      try {
        const reachable = typeof ctx?.tools?.get === 'function' ? ctx.tools.get('skill') : undefined
        if (!reachable) {
          ctx?.logger?.(name)?.warn?.(
            `${name}: 已注册 ${registered} 层知识库，但未探测到 \`skill\` 工具——`
            + '当前 agent preset 可能未包含 Skills 能力（如 minimal 极简模式），知识库不会被模型触发；'
            + '请切换标准模式或含 Skills 的 preset 后重启会话',
          )
        }
      } catch {
        /* 探测失败不影响运行 */
      }
    }, probeDelayMs)
    probe.unref?.()
    ctx?.on?.('dispose', () => clearTimeout(probe))
  }
}
