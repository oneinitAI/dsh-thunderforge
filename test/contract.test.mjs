// R6 契约自检库测试：每条真机契约规则都要有正例（通过）与反例（命中违规提示）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRawToolContract, PRIMITIVE_TYPES, SUPPORTED_KEYWORDS } from '../src/contract/index.js'

/** 一个完全合规的工具定义（作为正例基线）。 */
function compliantTool(overrides = {}) {
  return {
    name: 'my_tool',
    description: 'demo',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '名字' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return { ok: true }
    },
    ...overrides,
  }
}

test('合规工具：checkRawToolContract 全绿', () => {
  const { ok, violations } = checkRawToolContract(compliantTool())
  assert.equal(ok, true, `不应有违规：${JSON.stringify(violations)}`)
  assert.deepEqual(violations, [])
})

test('规则① 缺 output：真机直接 TypeError 的硬伤必须报', () => {
  const def = compliantTool()
  delete def.output
  const { ok, violations } = checkRawToolContract(def)
  assert.equal(ok, false)
  assert.ok(violations.some((v) => v.includes('output') && v.includes('TypeError')), violations.join('\n'))
})

test("规则② schema.type 'json' 是 defineTool 糖：raw 不支持必须报并给修法", () => {
  const def = compliantTool({
    output: { schema: { type: 'json' }, render: () => [] },
  })
  const { violations } = checkRawToolContract(def)
  assert.ok(violations.some((v) => v.includes("'json'") && v.includes('defineTool')), violations.join('\n'))
})

test('规则③ 显式对象节点缺 additionalProperties 布尔声明必须报（含嵌套）', () => {
  const def = compliantTool({
    parameters: {
      type: 'object',
      properties: { nested: { type: 'object', properties: {} } },
      required: [],
      additionalProperties: false,
    },
  })
  const { violations } = checkRawToolContract(def)
  assert.ok(violations.some((v) => v.includes('properties.nested') && v.includes('additionalProperties')), violations.join('\n'))
})

test('规则④ DSL 风格 required:true 属性残留必须报并指引顶层 required 数组', () => {
  const def = compliantTool()
  def.parameters.properties.name.required = true
  const { violations } = checkRawToolContract(def)
  assert.ok(
    violations.some((v) => v.includes('properties.name') && v.includes('required') && v.includes('顶层')),
    violations.join('\n'),
  )
})

test('规则⑤ 不支持的关键字（如 default/minLength）必须报', () => {
  const def = compliantTool()
  def.parameters.properties.name.default = 'x'
  const { violations } = checkRawToolContract(def)
  assert.ok(violations.some((v) => v.includes('"default"') && v.includes('assertSupportedJsonSchema')), violations.join('\n'))
})

test('规则⑥ parameters 非完整 object schema 必须报（type 错误 / required 非数组）', () => {
  const badType = checkRawToolContract(compliantTool({ parameters: { type: 'string' } }))
  assert.ok(badType.violations.some((v) => v.includes('parameters.type') && v.includes('"object"')))
  const noRequired = compliantTool()
  delete noRequired.parameters.required
  const badRequired = checkRawToolContract(noRequired)
  assert.ok(badRequired.violations.some((v) => v.includes('parameters.required') && v.includes('数组')))
})

test('规则⑦ 结构残缺：非对象定义 / 缺 name / 缺 execute / render 非函数逐项报', () => {
  assert.ok(checkRawToolContract(null).violations.length > 0)
  const noName = compliantTool()
  delete noName.name
  assert.ok(checkRawToolContract(noName).violations.some((v) => v.includes('name')))
  const noExecute = compliantTool()
  delete noExecute.execute
  assert.ok(checkRawToolContract(noExecute).violations.some((v) => v.includes('execute')))
  const badRender = compliantTool({ output: { schema: { type: 'object', additionalProperties: true }, render: 'nope' } })
  assert.ok(checkRawToolContract(badRender).violations.some((v) => v.includes('render') && v.includes('函数')))
})

test('类型与关键字白名单与 DEVELOPMENT §2.2 文档一致', () => {
  assert.deepEqual([...PRIMITIVE_TYPES].sort(), ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'])
  for (const kw of ['type', 'properties', 'required', 'items', 'enum', 'const', 'description', 'additionalProperties']) {
    assert.ok(SUPPORTED_KEYWORDS.has(kw))
  }
})
