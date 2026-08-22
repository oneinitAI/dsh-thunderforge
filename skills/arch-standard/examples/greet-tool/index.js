// 最小模型工具示例：注册 greet 工具，供模型调用。
// 参考：dsh-plugin-dev 技能 references/tools.md。
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      // args 由 parameters 推导并校验：{ name: string }
      return 'Hello, ' + args.name + '!'
    },
  }))
}
