import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name as pluginName } from '../src/profile/index.js'

function mockCtx() {
  const definitions = []
  apply({ tools: { register: (def) => definitions.push(def) } })
  return definitions
}

async function withHome(t, fn) {
  const root = await mkdtemp(join(tmpdir(), 'tf-profile-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    return await fn(root)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
}

test('注册工具并 list 现有 profile', async () => {
  await withHome(test, async (root) => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'profiles', 'web'), { recursive: true })
    await writeFile(
      join(root, 'profiles', 'web', 'package.json'),
      JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: { demo: '1.0.0' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }),
      'utf8',
    )
    const [tool] = mockCtx()
    assert.equal(pluginName, 'thunderforge-profile')
    const out = await tool.execute({ op: 'list' })
    assert.equal(out.profiles.length, 1)
    assert.equal(out.profiles[0].name, 'web')
    assert.deepEqual(out.profiles[0].bundles, ['@deepseek-ai/dsh-base'])
  })
})

test('export 生成可移植文本', async () => {
  await withHome(test, async (root) => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'profiles', 'web'), { recursive: true })
    await writeFile(
      join(root, 'profiles', 'web', 'package.json'),
      JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }),
      'utf8',
    )
    const [tool] = mockCtx()
    const out = await tool.execute({ op: 'export', name: 'web' })
    assert.match(out.portable, /dshp: 1/)
    assert.match(out.portable, /@deepseek-ai\/dsh-base/)
    const missing = await tool.execute({ op: 'export', name: 'ghost' })
    assert.equal(missing.error, 'PROFILE_NOT_FOUND')
  })
})

test('create-dev-preset 生成完整 profile 且防覆盖', async () => {
  await withHome(test, async (root) => {
    const [tool] = mockCtx()
    const out = await tool.execute({ op: 'create-dev-preset', name: 'demo', plugin_path: 'F:/x/under-test' })
    assert.equal(out.profile, 'tf-dev-demo')
    await access(join(out.dir, 'package.json'))
    await access(join(out.dir, 'cordis.patch.yml'))
    const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(out.dir, 'package.json'), 'utf8'))
    assert.deepEqual(pkg.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'dsh-thunderforge'])
    assert.ok(pkg.dependencies['dsh-thunderforge'].startsWith('link:'))
    assert.ok(out.nextSteps.join('\n').includes('--dump-config'))
    assert.ok(out.nextSteps.join('\n').includes('F:/x/under-test') || out.nextSteps.join('\n').includes('F:\\x\\under-test'))

    // 用户层 patch 必须是顶层 YAML 数组：全注释文件解析为 null 会被 dsh boot 拒绝（真实运行时踩过的坑）
    const { readFile } = await import('node:fs/promises')
    const patch = await readFile(join(out.dir, 'cordis.patch.yml'), 'utf8')
    const uncommented = patch.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    assert.deepEqual(uncommented, ['[]'])

    const dup = await tool.execute({ op: 'create-dev-preset', name: 'demo' })
    assert.equal(dup.error, 'PRESET_EXISTS')
    const bad = await tool.execute({ op: 'create-dev-preset', name: 'Bad_Name' })
    assert.equal(bad.error, 'INVALID_NAME')
  })
})

test('verify 在无 dsh CLI 时优雅降级', async (t) => {
  await withHome(t, async (root) => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'profiles', 'tf-dev-demo'), { recursive: true })
    await writeFile(join(root, 'profiles', 'tf-dev-demo', 'package.json'), '{}', 'utf8')
    const [tool] = mockCtx()
    const out = await tool.execute({ op: 'verify', name: 'tf-dev-demo' })
    assert.ok(out.available === true || out.available === false)
    if (out.available === false) assert.ok(out.hint.includes('npx'))
  })
})
