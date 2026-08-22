# LLM 适配器

为 Harness 接入新的模型提供方。LLM 适配器是继承 LlmAdapter 并实现 stream() 的类：把 Harness 的提供方无关请求转换为具体提供方的 API 调用，再把响应转换回 Harness 分片。

先读 packages/llm/llm/src/types.ts 中的 StreamChunk 文档——它记录了两个已交付适配器（llm-deepseek、llm-pi-ai）都经过验证的协议约定。

## 最小实现

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string
  constructor(apiKey: string) { super(); this.apiKey = apiKey }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. 把 options.messages 转成提供方格式
    // 2. 调用流式 API
    // 3. 把响应转换为 StreamChunk 序列
  }
}

export interface Config { apiKey: string; providers: string[] }
export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']
export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(config.providers, new MyAdapter(config.apiKey))
}
```

（实操手册示例使用 z 定义 Config；本示例用 Schemastery 与 plugins 配置约定一致——两者都满足 standard-schema 校验接口，以所依赖包的导出为准。）

## 注册语义

- 注册基于副作用，可安全支持 HMR；dispose 插件 fiber 即注销适配器。
- **每个提供方路由仅对应一个适配器**：重复注册会抛出异常；多路由注册要么全部成功、要么全部失败。
- options.provider 选择适配器，options.model 是提供方模型 ID——动态模型目录适配器无需重新配置生命周期即可提供新模型。
- **密钥用 Cordis 原生方式管理**：schemastery Config 带环境变量回退，经 cordis.yml 的 !!js process.env.MY_KEY 注入。切勿在代码中读取自行约定的密钥文件。

## StreamChunk 协议

stream() 必须按以下协议生成分片：

```ts
import { CallId, type StreamChunk } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. 每个内容块以 block-start 开始
  yield { type: 'block-start', index: 0, blockType: 'text' }
  // 2. 文本经 text-delta 流式输出
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }
  // 3. 每个内容块以 block-end 结束，携带完整块
  yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello world' } }
  // 4. 工具调用块
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 1, id: CallId('call-123'), name: 'bash', argumentsDelta: '{"command":"ls"}' }
  yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: CallId('call-123'), name: 'bash', arguments: '{"command":"ls"}' } }
  // 5. token 用量（必须在 finish 之前）
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }
  // 6. 结束原因（必须是最后一个分片）
  yield { type: 'finish', reason: { kind: 'stop' } }
  // 或 { kind: 'tool-calls' } 请求执行工具
}
```

关键规则：

- 每个 block-start 必须有对应的 block-end。
- **按首次出现的流顺序分配块 index**；同一个块的每次 delta 复用该 index。
- tool-call-delta 的 argumentsDelta 是原始 JSON 文本增量，可一次或分多次生成。**工具调用的 arguments 全程是原始 JSON 字符串**——提供方返回已解析对象时，在 block-end 时重新 stringify。
- finish 必须是最后一个分片；usage 必须在 finish 之前。

## 协议义务（两个实现共同验证的约定）

1. **usage 先于 finish；finish 之后不再发出任何内容。** 稳健做法：缓冲 finish/usage 直到提供方流结束标记，再统一 flush（可处理提供方在末尾发送仅含 usage 分片的情况）。
2. **错误有且仅有两条合法路径**：从 stream() 抛出（传输与协议故障——使用带稳定 code 的 LlmError），或以 finish { kind: 'error' | 'aborted' } 结束流（提供方带内故障）。消费方两者都处理；按故障类别选择路径并加以文档化。
3. **遵守 options.signal**（传给 fetch 或你的 SDK）。
4. **不支持的字段不得静默丢弃**：若 GenerateOptions 中某字段你的提供方无法支持（例如提供方不支持 stop sequences），抛 LlmError(..., 'UNSUPPORTED')。
5. **replayState（可选）**：如果提供方在后续调用中需要响应 ID、签名或其他原生元数据，将其最小无损 JSON 投影作为 finish.replayState 发出。重建历史时验证该状态；只有历史提供方路由与目标提供方路由当前由完全相同的适配器实例拥有时，LlmRuntime 才会传递该状态；由适配器决定同模型、跨模型或跨提供方恢复是否合法。状态缺失时，切勿仅根据提供方/模型名称推断原生回放。

## GenerateOptions

stream() 接收 GenerateOptions：模型、适配器拥有的推理强度 ID、对话历史、系统提示词、工具 schema、生成参数、停止序列与中止 signal。完整字段以 @deepseek-ai/dsh-llm 导出的 TypeScript 类型为准。适配器必须把支持的字段映射到具体 API；无法支持的字段按协议义务第 4 条处理。

## resolveModel 与 listModels

- 覆写 resolveModel(provider, model, signal?)，在一次查询中返回确切的提供方/模型身份以及可选的 context 与 reasoning 元数据。异步查询必须响应该 signal，使取消与资源释放完全停稳。服务会校验聚合结果，并在调用 stream() 前拒绝显式指定但不受支持的推理强度。
- **reasoning（推理强度）是适配器映射到提供方请求的有序不透明 ID**：仅当存在配置指定的默认值时才声明 defaultEffort；保留适配器给出的权威可选列表（包括适配器支持时定义的 off）；不暴露最终协议值的具体拼写，不自动调整不支持的值；ID 无需与其协议表示相同。
- 适配器能向选择器公布模型选项时，覆写 listModels()。

## 实现结构

让各职责分文件独立承担：协议格式（wire format）类型、请求序列化、传输解析、分片转换、适配器类。llm-deepseek（直接 HTTP，SSE 由 eventsource-parser 分帧）是参考布局；llm-pi-ai 展示封装 LLM 库的另一形态。

## 在 cordis.yml 中使用

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

## 错误处理

- 适配器通过带稳定 code 的 LlmError 抛出传输与协议故障；agent loop 保留错误及其 code 用于诊断与策略处理。**不要依赖普通 Error 被自动转换。**
- 每个提供方 HTTP 请求必须合并 attributionHeaders()，并传递 options.signal。

```ts
import { attributionHeaders, LlmAdapter, LlmError, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) { super() }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...attributionHeaders() },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError('Provider API error: ' + response.status, 'PROVIDER_HTTP_ERROR')
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
```

## 验证

遵循仓库测试策略——该策略负责适配器覆盖、真实提供方检查与已发布入口要求。两个完整参考实现：

- packages/llm/llm-deepseek/ —— DeepSeek API 适配器（OpenAI 兼容格式，直接 HTTP + SSE）
- packages/llm/llm-pi-ai/ —— Pi AI 适配器（封装 LLM 库的不同 API 格式）

对比这两个已交付适配器，可以看到同一套 harness 契约如何在不同提供方 SDK 之上实现。
