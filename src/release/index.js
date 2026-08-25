// ThunderForge release 插件：把项目付过学费的真机教训变成用户插件的发布前自动门禁。
// 检查项（R5）：冒烟测试 → 工具契约 → 零依赖铁律 → 版本一致性 → 手动步骤清单。
// 只检查不代做 publish——npm OTP 等敏感操作永远留给维护者本人。
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRawToolContract } from '../contract/index.js'
import { runSmoke } from '../scaffold/index.js'
import { releaseConfig } from '../engine-configs.js'

export const name = 'thunderforge-release'
export const inject = ['tools']

// Web 设置面板配置声明
export const Config = releaseConfig()

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** 动态加载插件入口，mock ctx 收集其注册的工具定义。 */
async function collectToolDefs(entryPath) {
  const mod = await import(entryPath)
  if (typeof mod.apply !== 'function') throw new Error(`入口 ${entryPath} 未导出 apply(ctx, config)`)
  const defs = []
  const ctx = {
    tools: { register: (d) => defs.push(d) },
    on: () => {},
    effect: (fn) => (typeof fn === 'function' ? fn() : fn?.[Symbol.iterator]?.()?.next()),
    logger: () => ({ info() {}, warn() {} }),
  }
  await mod.apply(ctx, {})
  return defs
}

/** 零依赖铁律：dependencies 出现 @deepseek-ai 包即红（Symbol 双实例事故），源码文本扫描 harness 导入。 */
async function checkZeroHarnessDeps(root) {
  const violations = []
  let pkg = {}
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  } catch (err) {
    return { violations: [`package.json 读取失败：${err.message}`] }
  }
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith('@deepseek-ai/') || dep.startsWith('@deepseek-ai/')) {
      violations.push(`dependencies 含 "${dep}"——装进 profile 会产生第二份模块实例（Symbol 双实例崩溃，见 CHANGELOG 0.1.5）；应改为 optional peerDependencies 或移除`)
    }
  }
  // 源码文本扫描：import ... from '@deepseek-ai/...'
  async function walk(dir, depth) {
    if (depth > 6) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path, depth + 1)
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        let text = ''
        try {
          text = await readFile(path, 'utf8')
        } catch {
          continue
        }
        if (/from\s+['"]@deepseek-ai\//.test(text) || /import\s+['"]@deepseek-ai\//.test(text)) {
          violations.push(`${path} 存在 @deepseek-ai 运行时导入——违反零 harness 导入铁律（DEVELOPMENT §2.2）`)
        }
      }
    }
  }
  await walk(root, 0)
  return { violations }
}

/** 版本一致性：package.json version 应出现在 CHANGELOG 最新条目标题里。 */
async function checkChangelogVersion(root) {
  let pkg
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  } catch {
    return { violations: [] } // package.json 缺失已由依赖检查报过，这里不重复
  }
  const violations = []
  try {
    const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8')
    const head = changelog.split('\n').find((line) => line.startsWith('## ')) ?? ''
    if (!head.includes(pkg.version)) {
      violations.push(`package.json version ${pkg.version} 未出现在 CHANGELOG 最新条目「${head.trim()}」——每个版本都应记档（含真 bug 因果）`)
    }
  } catch {
    violations.push('未找到 CHANGELOG.md——发布前应建立版本记录')
  }
  return { violations }
}

export function apply(ctx, config = {}) {
  if (config.disabled === true) return
  ctx.tools.register({
    name: 'thunderforge_release',
    description:
      'DSH 插件发布前门禁：对指定插件目录执行冒烟测试、真机工具契约自检、零 harness 依赖铁律、版本一致性检查，输出结构化报告与剩余手动步骤（npm publish/OTP 不代做）。用于"帮我检查这个插件能不能发/发布前把关"。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dir: { type: 'string', description: '插件目录（绝对或相对当前工作区），默认 "."；目录内应有 package.json 与 index.js' },
        skip_smoke: { type: 'boolean', description: '跳过 node --test 冒烟（默认 false）' },
      },
      required: ['dir'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{
        type: 'text',
        text: typeof value === 'string'
          ? value
          : `${value.ok ? '✅ 门禁通过' : `❌ ${value.checks.filter((c) => !c.passed).length} 项未过`}\n${value.checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.name}${c.detail ? `：${c.detail}` : ''}`).join('\n')}`,
      }],
    },
    async execute(args, exec) {
      const root = resolve(args.dir ?? '.')
      let rootStat
      try {
        rootStat = await stat(root)
      } catch {
        return { ok: false, error: 'DIR_NOT_FOUND', dir: root, hint: '目录不存在，检查路径' }
      }
      if (!rootStat.isDirectory()) {
        return { ok: false, error: 'NOT_A_DIRECTORY', dir: root }
      }

      const checks = []

      // ① 冒烟
      if (args.skip_smoke !== true) {
        const smoke = await runSmoke(root, exec?.signal)
        checks.push({ name: '冒烟测试（node --test）', passed: smoke.passed, detail: smoke.passed ? smoke.summary || '通过' : smoke.summary })
      }

      // ② 工具契约（动态加载 + mock ctx）
      try {
        const defs = await collectToolDefs(`file://${join(root, 'index.js').replaceAll('\\', '/')}`)
        if (defs.length === 0) {
          checks.push({ name: '工具契约', passed: true, detail: '入口未注册模型工具（非工具类插件，跳过）' })
        } else {
          const allViolations = []
          for (const def of defs) {
            const { ok, violations } = checkRawToolContract(def, def.name ?? 'unnamed_tool')
            if (!ok) allViolations.push(...violations)
          }
          checks.push({
            name: `工具契约（${defs.length} 个工具）`,
            passed: allViolations.length === 0,
            detail: allViolations.length === 0 ? '全部符合 raw 注册真机契约' : allViolations.join('；'),
          })
        }
      } catch (err) {
        checks.push({ name: '工具契约', passed: false, detail: `入口加载失败：${err.message}` })
      }

      // ③ 零依赖铁律
      const deps = await checkZeroHarnessDeps(root)
      checks.push({
        name: '零 harness 依赖铁律',
        passed: deps.violations.length === 0,
        detail: deps.violations.length === 0 ? '无 @deepseek-ai 运行时依赖/导入' : deps.violations.join('；'),
      })

      // ④ 版本一致性
      const ver = await checkChangelogVersion(root)
      checks.push({
        name: '版本一致性（CHANGELOG 记档）',
        passed: ver.violations.length === 0,
        detail: ver.violations.length === 0 ? '一致' : ver.violations.join('；'),
      })

      const ok = checks.every((c) => c.passed)
      const manualSteps = [
        'dsh --profile <验证用profile> --dump-config   # 层加载无报错（可先用 thunderforge_profile create-dev-preset 建干净环境）',
        'npm login 后 npm publish（OTP 自理）；发布后在 CHANGELOG 补记并打 tag',
      ]
      return { ok, dir: root, checks, manualSteps: ok ? manualSteps : ['先修复以上未过项再发布'] , forgedBy: `thunderforge-release @ ${packageRoot}` }
    },
  })
}
