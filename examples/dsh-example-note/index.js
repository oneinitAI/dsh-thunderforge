// 由 ThunderForge scaffold 生成的最小工具插件骨架（零依赖）。
// 注册基于副作用：dispose 插件 fiber 即注销工具。
export const name = 'example-note'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'example_note_greet',
    description: 'Greet someone by name. Replace with your own tool.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name to greet' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    // raw 注册必须声明 output（schema + render）；'json' 是 defineTool 专用糖，raw 不支持
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    // 原始 JSON Schema 注册需自行校验输入
    async execute(args) {
      if (typeof args?.name !== 'string' || !args.name) {
        throw new Error('name must be a non-empty string')
      }
      return { greeting: 'Hello, ' + args.name + '!' }
    },
  })
}
