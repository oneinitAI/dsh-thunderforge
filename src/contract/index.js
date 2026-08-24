// ThunderForge 契约自检库：把 dsh ctx.tools.register 的真机校验规则固化为可复用的纯函数。
// 这些规则来自真实运行时报错（CHANGELOG 0.1.6 raw 注册契约、0.1.5 Symbol 双实例教训），
// mock 单测测不出 register 拒绝什么——用户插件在发布前用本库自检，不必等真机 boot 爆雷。
//
// 用法：
//   import { checkRawToolContract } from 'dsh-thunderforge/contract'
//   const { ok, violations } = checkRawToolContract(toolDefinition)
//   if (!ok) console.error(violations)
//
// 零依赖、纯函数、不 throw——违规以中文清单返回，每条带修法提示。
// 规则与 test/tool-contract.test.mjs 同源（该测试对本仓库自身工具吃自己的狗粮）。

/** 真机支持的 JSON Schema 类型集（'json' 是 defineTool 专用糖，raw 不支持）。 */
export const PRIMITIVE_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

/** 真机支持的关键字白名单（未知关键字会被 assertSupportedJsonSchema 拒绝）。 */
export const SUPPORTED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
  'description',
  'additionalProperties',
])

/**
 * 校验一个 raw 工具定义是否符合 ctx.tools.register 的真机契约。
 * @param tool - 传给 ctx.tools.register 的工具定义对象
 * @param source - 违规信息里的来源标注（默认 'tool'）
 * @returns {ok: boolean, violations: string[]} ok 为 true 时 violations 为空数组
 */
export function checkRawToolContract(tool, source = 'tool') {
  /** @type {string[]} */
  const violations = []
  const where = typeof source === 'string' && source ? source : 'tool'

  if (!tool || typeof tool !== 'object') {
    return { ok: false, violations: [`${where}: 工具定义必须是对象`] }
  }

  // ── register() 的硬性检查（缺失即真机 TypeError / 拒绝注册）──
  if (typeof tool.name !== 'string' || tool.name === '') {
    violations.push(`${where}: name 必须是非空字符串（真机按 name 注册与路由）`)
  }

  if (!tool.output || typeof tool.output !== 'object') {
    violations.push(`${where}: 必须声明 output { schema, render } —— 缺失会在真机直接 TypeError`)
  } else {
    if (!tool.output.schema || typeof tool.output.schema !== 'object') {
      violations.push(`${where}: output.schema 必须是对象（声明工具输出的 JSON Schema）`)
    } else {
      checkSchemaNode(tool.output.schema, `${where}: output.schema`, violations)
    }
    if (typeof tool.output.render !== 'function') {
      violations.push(`${where}: output.render 必须是函数（raw 注册无默认渲染）`)
    }
    if (tool.output.presentationMeta !== undefined && typeof tool.output.presentationMeta !== 'function') {
      violations.push(`${where}: output.presentationMeta 若存在必须是函数`)
    }
  }

  if (typeof tool.execute !== 'function') {
    violations.push(`${where}: execute 必须是函数`)
  }

  // ── parameters：建议完整 object schema（执行期校验安全）──
  const params = tool.parameters
  if (!params || typeof params !== 'object') {
    violations.push(`${where}: parameters 必须是完整的 object schema（真机按它校验模型入参）`)
  } else {
    if (params.type !== 'object') {
      violations.push(`${where}: parameters.type 必须是 "object"（顶层入参容器），实际 ${JSON.stringify(params.type)}`)
    }
    checkSchemaNode(params, `${where}: parameters`, violations)
    if (params.type === 'object' && !Array.isArray(params.required)) {
      violations.push(`${where}: parameters.required 必须是数组（必填字段放顶层 required: [...]，不要用 DSL 风格 required:true）`)
    }
  }

  return { ok: violations.length === 0, violations }
}

/** 递归校验 schema 节点：类型合法 + 关键字白名单 + 对象节点开放性 + 无 DSL 残留。 */
function checkSchemaNode(node, where, violations) {
  if (!node || typeof node !== 'object') {
    violations.push(`${where}: 节点必须是对象`)
    return
  }
  if (node.type !== undefined && !PRIMITIVE_TYPES.has(node.type)) {
    violations.push(`${where}: type "${node.type}" 不在支持集 ${[...PRIMITIVE_TYPES].join('/')} —— 'json' 是 defineTool 专用糖，raw 注册不支持，请改用具体类型或 "object"`)
  }
  for (const key of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      violations.push(`${where}: 不支持的关键字 "${key}"（会被真机 assertSupportedJsonSchema 拒绝）${key === 'required' ? '——必填约束请放顶层 required 数组' : ''}`)
    }
  }
  if (node.type === 'object') {
    if (typeof node.additionalProperties !== 'boolean') {
      violations.push(`${where}: 显式对象节点必须声明 additionalProperties 布尔值（真机强制要求开放性声明）`)
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      checkSchemaNode(child, `${where}.properties.${key}`, violations)
      if (child && typeof child === 'object' && 'required' in child) {
        violations.push(`${where}.properties.${key}: 属性内的 required:true 是 DSL 风格残留（不支持的关键字），必填字段请放进父节点顶层 required 数组`)
      }
    }
  }
  if (node.items) checkSchemaNode(node.items, `${where}.items`, violations)
}
