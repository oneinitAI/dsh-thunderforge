import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name as pluginName } from '../src/scaffold/index.js'
import { PLUGIN_NAME_RE, TEMPLATES, scaffoldFiles } from '../src/scaffold/templates.js'

function mockCtx() {
  const definitions = []
  apply({ tools: { register: (def) => definitions.push(def) } })
  return definitions
}

test('插件注册 thunderforge_scaffold 与 thunderforge_upgrade 工具且 schema 合规', () => {
  const definitions = mockCtx()
  assert.equal(pluginName, 'thunderforge-scaffold')
  assert.equal(definitions.length, 2)
  const tool = definitions.find((d) => d.name === 'thunderforge_scaffold')
  assert.ok(tool, 'thunderforge_scaffold 应注册')
  assert.equal(tool.parameters.type, 'object')
  assert.ok(tool.parameters.properties.plugin_name)
  assert.deepEqual([...tool.parameters.required].sort(), ['plugin_name', 'template'])
  assert.deepEqual(tool.parameters.properties.template.enum, [...TEMPLATES])
  assert.equal(tool.parameters.additionalProperties, false)
  assert.equal(typeof tool.execute, 'function')
  // 真机教训（0.1.6）：raw 注册必须带 output，且 schema.type 不接受 'json'
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(typeof tool.output.render, 'function')
  assert.ok(Array.isArray(tool.output.render(null, { status: 'ok', path: '/x', files: [], verify: { ran: false } })))
})

test('非法插件名返回规范错误值而非抛异常', async () => {
  const [tool] = mockCtx()
  const out = await tool.execute({ plugin_name: 'Bad_Name', template: 'tool' }, {})
  assert.equal(out.status, 'error')
  assert.match(out.reason, /INVALID_PLUGIN_NAME/)
})

for (const template of TEMPLATES) {
  test(`模板 ${template} 生成完整骨架且冒烟通过`, async () => {
  const [tool] = mockCtx()
  const dir = await mkdtemp(join(tmpdir(), 'tf-scaffold-'))
  try {
    const out = await tool.execute({ plugin_name: `demo-${template}`, template, dir }, {})
    assert.equal(out.status, 'ok', JSON.stringify(out))
    assert.ok(out.verify.ran)
    assert.equal(out.verify.passed, true, out.verify.summary)
    assert.ok(out.files.includes('thunderforge.debug.json'))
    assert.ok(out.files.includes('test/smoke.test.mjs'))
    assert.ok(out.files.includes('.github/workflows/ci.yml'))
    await access(join(out.path, 'package.json'))
    await access(join(out.path, 'index.js'))
    await access(join(out.path, 'cordis.patch.yml'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  })
}

test('目标目录已存在时返回 TARGET_EXISTS', async () => {
  const [tool] = mockCtx()
  const dir = await mkdtemp(join(tmpdir(), 'tf-scaffold-'))
  try {
    const first = await tool.execute({ plugin_name: 'occupied', template: 'tool', dir }, {})
    assert.equal(first.status, 'ok')
    const second = await tool.execute({ plugin_name: 'occupied', template: 'tool', dir }, {})
    assert.equal(second.status, 'error')
    assert.match(second.reason, /TARGET_EXISTS/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('调试埋点清单声明 capture 索引流与事件前缀', () => {
  const files = scaffoldFiles({ pluginName: 'probe-plugin', template: 'tool' })
  const manifest = JSON.parse(files.find(([path]) => path === 'thunderforge.debug.json')[1])
  assert.equal(manifest.instrumentation.capture.indexStream, 'index.jsonl')
  assert.equal(manifest.instrumentation.events.prefix, 'probe-plugin/')
  assert.ok(PLUGIN_NAME_RE.test('probe-plugin'))
})

test('thunderforge_upgrade：新骨架零建议，缺文件/缺埋点/契约违规逐项报', async () => {
  const [scaffoldTool, upgradeTool] = mockCtx()
  assert.equal(upgradeTool.name, 'thunderforge_upgrade')
  const dir = await mkdtemp(join(tmpdir(), 'tf-upgrade-'))
  try {
    // 先生成一个合规骨架 → 升级检查应零建议
    const forged = await scaffoldTool.execute({ plugin_name: 'fresh-skel', template: 'tool', dir }, {})
    assert.equal(forged.status, 'ok')
    const fresh = await upgradeTool.execute({ dir: forged.path })
    assert.equal(fresh.ok, true, JSON.stringify(fresh.suggestions))

    // 再造一个残缺骨架：删 ci.yml、埋点清单去掉 instrumentation、工具缺 output
    const fsPromises = await import('node:fs/promises')
    const broken = join(dir, 'broken')
    await fsPromises.mkdir(broken, { recursive: true })
    const files = scaffoldFiles({ pluginName: 'broken-skel', template: 'tool' })
    for (const [relative, body] of files) {
      if (relative === '.github/workflows/ci.yml') continue // 缺文件
      if (relative === 'thunderforge.debug.json') {
        await fsPromises.writeFile(join(broken, relative), JSON.stringify({ version: 1 }), 'utf8')
        continue
      }
      await fsPromises.mkdir(join(broken, relative, '..'), { recursive: true })
      await fsPromises.writeFile(join(broken, relative), body, 'utf8')
    }
    // 埋雷：入口工具缺 output
    await fsPromises.writeFile(
      join(broken, 'index.js'),
      `export const name = 'broken_skel'\nexport const inject = ['tools']\nexport function apply(ctx) { ctx.tools.register({ name: 'x_tool', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }, async execute() { return {} } }) }\n`,
      'utf8',
    )
    const out = await upgradeTool.execute({ dir: broken, template: 'tool' })
    assert.equal(out.ok, false)
    const kinds = new Set(out.suggestions.map((s) => s.kind))
    assert.ok(kinds.has('missing-file'), '应报缺失文件')
    assert.ok(kinds.has('stale-manifest'), '应报埋点声明落后')
    assert.ok(kinds.has('contract'), '应报契约违规')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
