// 真机契约测试：固化 dsh ctx.tools.register 的实际校验规则。
// 这些规则来自真实运行时报错（见 CHANGELOG 0.1.6），mock 单测测不出，必须显式断言。
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply as applyScaffold } from '../src/scaffold/index.js'
import { apply as applyDebugger } from '../src/debugger/index.js'
import { apply as applyProfile } from '../src/profile/index.js'
import { scaffoldFiles } from '../src/scaffold/templates.js'

const PRIMITIVE_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const SUPPORTED_KEYWORDS = new Set(['type', 'properties', 'required', 'items', 'enum', 'const', 'description', 'additionalProperties'])

/** 递归校验 schema 节点：类型合法 + 无 DSL 残留 + 对象节点声明开放性。 */
function assertSchemaNode(node, where) {
  assert.ok(node && typeof node === 'object', `${where}: 节点必须是对象`)
  if (node.type !== undefined) {
    assert.ok(PRIMITIVE_TYPES.has(node.type), `${where}: type "${node.type}" 不在支持集（'json' 是 defineTool 专用糖，raw 不支持）`)
  }
  for (const key of Object.keys(node)) {
    assert.ok(SUPPORTED_KEYWORDS.has(key), `${where}: 不支持的关键字 "${key}"（会被 assertSupportedJsonSchema 拒绝）`)
  }
  if (node.type === 'object') {
    assert.ok(typeof node.additionalProperties === 'boolean', `${where}: 显式对象节点必须声明 additionalProperties 布尔值`)
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      assertSchemaNode(child, `${where}.properties.${key}`)
      assert.ok(!('required' in child), `${where}.properties.${key}: DSL 风格 required:true 是不支持的关键字，用顶层 required 数组`)
    }
  }
  if (node.items) assertSchemaNode(node.items, `${where}.items`)
}

function assertToolContract(tool, source) {
  // register() 的硬性检查（真机源码 dsh-tools lib/index.js register）
  assert.equal(typeof tool.name, 'string', `${source}: name`)
  assert.ok(tool.output && typeof tool.output === 'object', `${source}: 必须声明 output`)
  assert.equal(typeof tool.output.render, 'function', `${source}: output.render 必须是函数`)
  if (tool.output.presentationMeta !== undefined) {
    assert.equal(typeof tool.output.presentationMeta, 'function', `${source}: output.presentationMeta 若存在必须是函数`)
  }
  assertSchemaNode(tool.output.schema, `${source}: output.schema`)
  assert.equal(typeof tool.execute, 'function', `${source}: execute`)
  // 参数为完整 object schema（执行期校验安全）
  assert.equal(tool.parameters?.type, 'object', `${source}: parameters.type`)
  assert.equal(typeof tool.parameters.additionalProperties, 'boolean', `${source}: parameters.additionalProperties`)
  assert.ok(Array.isArray(tool.parameters.required), `${source}: parameters.required 数组`)
}

function collect(apply, name) {
  const defs = []
  apply({ tools: { register: (d) => defs.push(d) } })
  assert.equal(defs.length, 1, `${name} 应注册恰好 1 个工具`)
  return defs[0]
}

test('真机契约：scaffold/debugger/profile 三个工具全部合规', () => {
  assertToolContract(collect(applyScaffold, 'scaffold'), 'thunderforge_scaffold')
  assertToolContract(collect(applyDebugger, 'debugger'), 'thunderforge_debugger')
  assertToolContract(collect(applyProfile, 'profile'), 'thunderforge_profile')
})

test('真机契约：tool 模板生成的工具合规（写入临时目录校验）', async () => {
  const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'tf-contract-'))
  try {
    for (const [path, body] of scaffoldFiles({ pluginName: 'contract-probe', template: 'tool' })) {
      await mkdir(join(dir, path, '..'), { recursive: true })
      await writeFile(join(dir, path), body, 'utf8')
    }
    const mod = await import(`file://${join(dir, 'index.js').replaceAll('\\', '/')}`)
    const defs = []
    mod.apply({ tools: { register: (d) => defs.push(d) } })
    assertToolContract(defs[0], '模板工具')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
