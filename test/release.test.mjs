// R5 发布门禁测试：好插件全绿；故意埋雷的插件逐项报红。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name as pluginName } from '../src/release/index.js'

function mockCtx() {
  const definitions = []
  apply({ tools: { register: (def) => definitions.push(def) } })
  assert.equal(pluginName, 'thunderforge-release')
  return definitions[0]
}

/** 生成一个合规的最小插件目录（工具合规、零 harness 依赖、CHANGELOG 记档）。 */
async function goodPlugin(root) {
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-good-plugin',
    version: '0.1.0',
    type: 'module',
    main: 'index.js',
  }), 'utf8')
  await writeFile(join(root, 'index.js'), `export const name = 'good'
export const inject = ['tools']
export function apply(ctx) {
  ctx.tools.register({
    name: 'good_tool',
    description: 'demo',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
    async execute() { return {} },
  })
}
`, 'utf8')
  await writeFile(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 0.1.0 (2026-08-24)\n\n- 首版\n', 'utf8')
}

test('thunderforge_release：合规插件全绿并给出手动步骤', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tf-rel-good-'))
  try {
    await goodPlugin(root)
    const tool = mockCtx()
    const out = await tool.execute({ dir: root })
    assert.equal(out.ok, true, JSON.stringify(out.checks, null, 1))
    assert.ok(out.checks.every((c) => c.passed))
    assert.ok(out.manualSteps.some((s) => s.includes('npm publish')), '手动步骤应包含 publish 提示')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('thunderforge_release：契约违规 + harness 依赖 + 版本未记档逐项报红', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tf-rel-bad-'))
  try {
    await goodPlugin(root)
    // 埋雷①：工具缺 output 且用 DSL required 残留
    await writeFile(join(root, 'index.js'), `export const name = 'bad'
export const inject = ['tools']
export function apply(ctx) {
  ctx.tools.register({
    name: 'bad_tool',
    description: 'demo',
    parameters: { type: 'object', properties: { q: { type: 'string', required: true } }, additionalProperties: false },
    async execute() { return {} },
  })
}
`, 'utf8')
    // 埋雷②：dependencies 引入 @deepseek-ai 包
    const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'))
    pkg.dependencies = { '@deepseek-ai/dsh-tools': '^0.1.0' }
    // 埋雷③：version 与 CHANGELOG 最新条目不一致
    pkg.version = '0.2.0'
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')

    const tool = mockCtx()
    const out = await tool.execute({ dir: root })
    assert.equal(out.ok, false)
    const byName = Object.fromEntries(out.checks.map((c) => [c.name, c]))
    assert.equal(byName['工具契约（1 个工具）'].passed, false, '缺 output 应报红')
    assert.ok((byName['工具契约（1 个工具）'].detail ?? '').includes('TypeError'))
    assert.ok((byName['工具契约（1 个工具）'].detail ?? '').includes('required'), 'DSL required 残留应被点名')
    assert.equal(byName['零 harness 依赖铁律'].passed, false)
    assert.ok(byName['零 harness 依赖铁律'].detail.includes('Symbol 双实例'), '违规提示应带血泪因果')
    assert.equal(byName['版本一致性（CHANGELOG 记档）'].passed, false)
    // 冒烟可能因测试文件不存在而 ran:false——不作为本测试断言项
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('thunderforge_release：目录不存在返回规范错误值', async () => {
  const tool = mockCtx()
  const out = await tool.execute({ dir: join(tmpdir(), 'no-such-dir-xyz') })
  assert.equal(out.error, 'DIR_NOT_FOUND')
})
