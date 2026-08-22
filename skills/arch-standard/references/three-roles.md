# 能力的三种角色设计

当一项能力足够通用、需要支持可替换的提供方时（例如 Bash 执行），harness 区分三种角色：**Service Definition**、**Service Provider**、**Consumer**。角色需要独立演进或替换时放入不同包；否则一个包可以承担多个角色。完整能力构成其 **seam**，任何单一角色都不是 seam。

## 以 Bash 为例

- Service Definition（dsh-shell）：定义 Cordis 服务以及 Bash 请求和结果类型
- Service Provider（dsh-bash-local）：在本地计算机上执行命令
- Consumer（dsh-tool-bash）：把能力公开为模型可调用的工具

```
┌─────────────┐   ┌──────────────────┐   ┌──────────────┐
│ dsh-shell   │──▶│ dsh-bash-local   │   │ dsh-tool-bash│
│ (definition)│   │ (provider)       │   │(consumer/tool)│
└─────────────┘   └──────────────────┘   └──────────────┘
        ▲                                    │
        └────────────────────────────────────┘
              inject: ['shell']
```

## 拆分的好处

- **提供方可替换**：同一 Definition 可以有多个 Provider，换提供方时 Definition 和工具都保持不变。
- **独立演进**：Definition 很少改动；Provider 独立优化性能与安全；Consumer 独立调整向模型呈现的方式。
- **依赖解耦**：Provider 依赖 Definition；Consumer 依赖 Definition；Provider 与 Consumer 互不依赖。

## 教程：三步开发一种能力

### 第一步：Service Definition

```ts
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { myCap: MyCapService }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) { super(ctx, 'myCap') }
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest { input: string }
export interface MyCapResult { output: string }
```

### 第二步：Service Provider

```ts
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'
export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### 第三步：Consumer

```ts
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### 在 cordis.yml 中组合

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## 设计要点

- **不要预防性拆分**：只有角色需要独立演进时才用不同包；简单工具插件无需拆分。
- **Service Definition 拥有 Request/Result 类型**：Provider 和 Consumer 只依赖 Definition 包。
- **显式优于隐式**：实现应通过显式的 resolve(request): Spec 步骤处理默认值，而不是在 run() 里隐藏 ?? default。
- **命名与包拓扑**：包名描述当前稳定职责；实现包加机制/协议/环境/厂商限定词；Controller/Store/Registry/Runtime 等角色词的适用条件与 ctx key 单复数规则见 references/workspace-package.md。
