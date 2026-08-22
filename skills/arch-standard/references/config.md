# 插件配置

让插件接受用户在 cordis.yml 中传入的配置。

## 定义 Config 类型

导出 interface Config 与同名 Schemastery schema；默认值直接写在 schema 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)   // 用户值或 schema 默认值
}
```

在 cordis.yml 的行中加配置：

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

插件加载时 Cordis 通过导出的 schema 校验配置并填充默认值。**不要导出普通对象作为 Config**——它不满足 Cordis 要求的 Standard Schema 接口。

## Schema 校验

严格校验场景使用 Schemastery：

```ts
export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})
```

Schema 在插件加载时执行校验；配置不合法 → 插件加载失败并给出明确错误。

## 设计原则

### 无硬编码可调参数

Harness 约定：凡是不同部署可能需要采用不同值的参数，都必须定义为配置字段。

```ts
// 错误：硬编码超时
const TIMEOUT = 30000
// 正确：可配置
export interface Config { timeoutMs: number }  // 默认 30000 写在 schema
```

检验标准：能否在 cordis.yml 中改变这个值而不需要修改代码？

### 配置错误要响亮

在 schema 中表达自身完备的约束，使无效配置在插件加载时失败；对服务或已注册资源的引用需要依赖注入（见 references/services.md），而不是配置字符串。

## 配合 HMR

修改 cordis.yml 中某插件的 config 会触发插件热替换：卸载旧实例（自动清理注册）→ 加载新实例。热替换后不会保留旧实例的注册。
