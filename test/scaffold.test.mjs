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

test('插件注册 thunderforge_scaffold 工具且 schema 合规', () => {
  const definitions = mockCtx()
  assert.equal(pluginName, 'thunderforge-scaffold')
  assert.equal(definitions.length, 1)
  const tool = definitions[0]
  assert.equal(tool.name, 'thunderforge_scaffold')
  assert.ok(tool.parameters.properties.plugin_name)
  assert.deepEqual([...tool.parameters.required].sort(), ['plugin_name', 'template'])
  assert.deepEqual(tool.parameters.properties.template.enum, [...TEMPLATES])
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.additionalProperties, true)
  assert.ok(Array.isArray(tool.output.render?.(null, { status: 'ok', path: '/x', files: [], verify: { ran: false } })))
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
