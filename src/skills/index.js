// ThunderForge skills 插件：把随包分发的三层知识库注册进 ctx.skills。
// 挂载方式依据 docs/notes/m1-skill-loading.md 的调研结论：
//   ctx.skills.register(SkillRegistration) 内联注册 + 目录 resourceBase
//   解析正文中的相对资源（references/、examples/、guide/）。
// 注册模式参考 dsh-plugin-guide（Apache-2.0，见 LICENSES 台账）。
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'thunderforge-skills'
export const inject = ['skills']

export const Config = Schema.object({
  entryLayer: Schema.boolean().default(true).description('入口索引层 thunderforge-dev'),
  archLayer: Schema.boolean().default(true).description('架构标准层 dsh-plugin-dev'),
  pitfallsLayer: Schema.boolean().default(true).description('坑点手册层 dsh-plugin-guide'),
  buddyLayer: Schema.boolean().default(true).description('人话模式层 thunderforge-buddy'),
})

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const skillsRoot = join(packageRoot, 'skills')

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// 层顺序即注册顺序；enabled 可在 config 里关闭任一层
export const LAYERS = [
  { key: 'entry', dir: 'thunderforge-dev', enabledConfig: 'entryLayer' },
  { key: 'arch', dir: 'arch-standard', enabledConfig: 'archLayer' },
  { key: 'pitfalls', dir: 'pitfalls', enabledConfig: 'pitfallsLayer' },
  { key: 'buddy', dir: 'dsh-buddy', enabledConfig: 'buddyLayer' },
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
}
