// ThunderForge profile 插件：profile 管理模型工具 + dev preset 生成器。
// list/export 复用 vendored dshp（asdf17128/dshp，MIT）的实现；
// create-dev-preset 为 ThunderForge 增补（仅新建 tf-dev-* 目录，绝不触碰既有 profile，
// 遵循 dshp "写操作保护既有环境" 的设计原则）。
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exists, listProfiles, profileDir, profileSize, readProfile, writeProfile } from './dshp/profile.js'
import { serialize } from './dshp/portable.js'
import { profileConfig } from '../engine-configs.js'
import { readUserSettingsSync } from '../user-settings.js'

export const name = 'thunderforge-profile'
export const inject = ['tools']

// Web 设置面板配置声明
export const Config = profileConfig()

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const PRESET_PREFIX = 'tf-dev-'
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const PRESET_PATCH = `# ThunderForge dev preset 用户层（在所有 bundle 层之后应用）。
# 注意：本文件必须是顶层 YAML 数组——全注释文件解析为 null 会被 boot 拒绝。
# thunderforge-capture 默认输出到 DSH_HOME/thunderforge-capture。
# 需要覆盖时在下层数组里补行并重述整行配置（层覆盖是整行替换，不深度合并）：
# - id: thunderforge-capture
#   config:
#     enabled: true
#     dir: /absolute/path/to/captures
[]
`

function spawnText(command, args, cwd) {
  // Windows 下不用 shell:true（DEP0190 弃用警告：shell + args 数组），
  // 改经 cmd /d /s /c 显式解析，保持 PATH 上 .cmd 的可发现性
  const isWin = process.platform === 'win32'
  return new Promise((resolvePromise) => {
    const child = isWin
      ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const collect = (stream) => stream.on('data', (chunk) => {
      out += chunk
      if (out.length > 40_000) out = out.slice(-20_000)
    })
    collect(child.stdout)
    collect(child.stderr)
    child.on('error', (err) => resolvePromise({ ok: false, code: null, error: err.code ?? err.message, out }))
    child.on('close', (code) => resolvePromise({ ok: code === 0, code, error: null, out }))
  })
}

export function apply(ctx, userConfig = {}) {
  // 三级合并：patch 行 config > 用户级 settings > 内置默认
  const config = { ...readUserSettingsSync().profile, ...userConfig }
  if (config.disabled === true) return
  ctx.tools.register({
      name: 'thunderforge_profile',
      description:
        '管理 DSH profile：列出本机 profile（含 bundle/插件/补丁）、导出可移植配置文本、生成 ThunderForge 开发 preset（干净 profile，预装 dsh-thunderforge）、验证 profile 可启动。用于"帮我建个干净环境测插件/看看我有哪些配置/导出这套设置"。',
      parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        op: {
          type: 'string',
          enum: ['list', 'export', 'create-dev-preset', 'verify'],
          description: 'list=列出，export=导出便携文本，create-dev-preset=生成开发 preset，verify=dump-config 验证',
        },
        name: { type: 'string', description: 'profile 相关 op 的目标名（preset 只给短名，如 demo）' },
        plugin_path: { type: 'string', description: 'create-dev-preset 可选：被测插件路径，写入 preset 指南' },
        },
        required: ['op'],
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        if (args.op === 'list') {
          const names = listProfiles()
          return {
            profiles: names.map((profileName) => {
              const profile = readProfile(profileName)
              return {
                name: profileName,
                bundles: profile.bundles,
                plugins: Object.keys(profile.plugins),
                hasPatch: profile.patch.trim() !== '',
                sizeBytes: profileSize(profileName),
              }
            }),
          }
        }

        if (args.op === 'export') {
          if (!args.name || !exists(args.name)) return { error: 'PROFILE_NOT_FOUND', name: args.name }
          return { name: args.name, portable: serialize(readProfile(args.name)) }
        }

        if (args.op === 'create-dev-preset') {
          const short = args.name ?? 'default'
          if (!NAME_RE.test(short)) {
            return { error: 'INVALID_NAME', hint: '短名必须是 kebab-case，如 demo、my-plugin' }
          }
          const profileName = PRESET_PREFIX + short
          if (exists(profileName)) {
            return { error: 'PRESET_EXISTS', profile: profileName, hint: '换个短名或先 dsh plugin --profile 移除' }
          }
          writeProfile({
            name: profileName,
            // thunderforge 放最前：capture 需先于 base 内的 LLM 适配器行应用才能包装注册
            //（cordis 响应式注入会在 llm 服务就绪后立即 patch，赶在适配器行之前）
            bundles: ['dsh-thunderforge', '@deepseek-ai/dsh-base'],
            plugins: { 'dsh-thunderforge': `link:${packageRoot}` },
            patch: PRESET_PATCH,
          })
          const dir = profileDir(profileName)
          return {
            profile: profileName,
            dir,
            installed: { 'dsh-thunderforge': `link:${packageRoot}` },
            nextSteps: [
              `dsh --profile ${profileName} --dump-config   # 验证层加载（应出现 # == dsh-thunderforge）`,
              args.plugin_path
                ? `dsh plugin --profile ${profileName} add ${resolve(args.plugin_path)}   # 干净安装被测插件`
                : `dsh plugin --profile ${profileName} add <被测插件路径>   # 干净安装被测插件`,
              `dsh --profile ${profileName}   # 启动开发环境`,
            ],
          }
        }

        // verify
        const target = args.name
        if (!target || !exists(target)) return { error: 'PROFILE_NOT_FOUND', name: target }
        const result = await spawnText('dsh', ['--profile', target, '--dump-config'])
        if (result.error) {
          return {
            profile: target,
            available: false,
            hint: 'dsh CLI 不在 PATH；可用 npx -y @deepseek-ai/dsh@0.1.1-rc.2 --profile ... 代替',
          }
        }
        const hasLayer = /#\s*==\s*dsh-thunderforge/.test(result.out) || /dsh-thunderforge/.test(result.out)
        return {
          profile: target,
          available: true,
          exitCode: result.code,
          hasThunderforgeLayer: hasLayer,
          tail: result.out.trim().split('\n').slice(-8).join('\n'),
        }
      },
  })
}
