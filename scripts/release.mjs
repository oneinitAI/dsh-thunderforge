// release — 一键发布：工作区检查 → 全量测试 → 版本 bump → npm publish → 推送（抗网络）→ registry 验证
//
// 用法: node scripts/release.mjs [patch|minor|major] [--dry-run] [--skip-publish]
//   patch/minor/major  版本增量，默认 patch
//   --dry-run          只打印计划，不改任何状态
//   --skip-publish     跳过 npm publish（例如只想走流程演练）
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipPublish = args.includes('--skip-publish')
const bumpKind = ['patch', 'minor', 'major'].find((kind) => args.includes(kind)) ?? 'patch'
const out = (line) => console.log(line)

const run = (cmd, cmdArgs, opts = {}) => {
  const result = spawnSync(cmd, cmdArgs, { stdio: opts.inherit ? 'inherit' : 'pipe', encoding: 'utf8', ...opts })
  if (result.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} 失败（exit ${result.status}）`)
  return result.stdout?.toString().trim() ?? ''
}

function bump(version) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (bumpKind === 'major') return `${major + 1}.0.0`
  if (bumpKind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

async function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const nextVersion = bump(pkg.version)
  const currentVersion = pkg.version

  out(`发布计划: ${pkg.name} ${currentVersion} → ${nextVersion}（${bumpKind}）${dryRun ? ' [dry-run]' : ''}`)
  if (dryRun) return

  // 1. 工作区必须干净
  const dirty = run('git', ['status', '--porcelain'])
  if (dirty) throw new Error(`工作区不干净：\n${dirty}\n先提交再发布`)

  // 2. 全量测试
  out('▶ node --test …')
  run('node', ['--test'], { inherit: true })
  out('✓ 测试通过')

  // 3. bump + 提交
  pkg.version = nextVersion
  writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  run('git', ['add', 'package.json'])
  run('git', ['commit', '-m', `chore(release): v${nextVersion}`])
  out(`✓ 版本已提交：v${nextVersion}`)

  // 4. npm publish（未登录则明确告知剩余步骤）
  if (skipPublish) {
    out('ℹ --skip-publish：跳过 npm 发布')
  } else {
    const whoami = spawnSync('npm', ['whoami'], { encoding: 'utf8' })
    if (whoami.status !== 0) {
      out('⚠ npm 未登录。已完成：版本提交。剩余手动步骤：')
      out('  npm login && npm publish')
    } else {
      out(`▶ npm publish（账号 ${whoami.stdout.trim()}）…`)
      run('npm', ['publish'], { inherit: true })
    }
  }

  // 5. 推送（抗网络：git 直连失败自动降级 API）
  out('▶ 推送 GitHub …')
  run('node', ['scripts/github-push.mjs', '--message', `chore(release): v${nextVersion}`], { inherit: true })

  // 6. registry 验证（最多等 60s 生效）
  if (!skipPublish) {
    out('▶ 验证 npm registry …')
    for (let i = 0; i < 12; i++) {
      const tags = JSON.parse(execFileSync('npm', ['view', pkg.name, 'dist-tags', '--json'], { encoding: 'utf8' }))
      if (tags.latest === nextVersion) {
        out(`✓ registry 已生效：${pkg.name}@${nextVersion}`)
        out(`用户更新：dsh plugin --profile <名> update ${pkg.name} && 重启对应应用`)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    out(`⚠ registry 尚未显示 ${nextVersion}（可能延迟），稍后自查：npm view ${pkg.name} dist-tags`)
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
