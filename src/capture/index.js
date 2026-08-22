// ThunderForge capture 插件入口：包装 llm.registerAdapter，
// 对每个注册进来的 LlmAdapter 透明套一层捕获代理。
// 协议要点（来自 DSH LLM 适配器规范）：
//   - 每个提供方路由仅对应一个适配器，重复注册抛异常 → 我们不重复注册，
//     只在注册时把原适配器包一层；resolveModel/listModels 经原型链透传。
//   - stream() 是 AsyncIterable<StreamChunk>，错误路径有两条（抛出 / finish error），
//     两条路径都要落盘且不得改变原语义。
import Schema from '@deepseek-ai/schemastery'
import { CaptureStore, initConfig } from './core.js'

export const name = 'thunderforge-capture'
export const inject = ['llm']

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('总开关'),
  dir: Schema.string().default('').description('输出目录，默认 DSH_HOME/thunderforge-capture'),
  providers: Schema.array(Schema.string()).default([]).description('仅捕获这些 provider，留空捕获全部'),
  redact: Schema.boolean().default(true).description('掩码疑似密钥字段'),
  captureDeltas: Schema.boolean().default(false).description('记录原始 StreamChunk 分片'),
  maxStringLength: Schema.number().default(0).description('单字符串保留长度，0 不限'),
  maxFiles: Schema.number().default(2000).description('保留捕获文件数，0 不限'),
  maxTotalBytes: Schema.number().default(0).description('目录总字节上限，0 不限'),
  pruneEvery: Schema.number().default(50).description('每 N 次写入清理一次'),
})

function toArray(value) {
  return [value].flat().filter((item) => item !== undefined && item !== null).map(String)
}

function wrapAdapter(adapter, providers, store) {
  if (!adapter || typeof adapter.stream !== 'function') return adapter
  const wrapped = Object.create(adapter)
  wrapped.stream = async function* captureStream(options) {
    const record = store.begin(providers, options)
    try {
      for await (const chunk of adapter.stream.call(adapter, options)) {
        record.push(chunk)
        yield chunk
      }
    } catch (err) {
      record.fail(err)
      throw err
    } finally {
      // 落盘异步化：捕获失败绝不阻塞或打断模型流
      void record.finalize()
    }
  }
  return wrapped
}

export function apply(ctx, userConfig = {}) {
  const config = initConfig(userConfig)
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : console
  const store = new CaptureStore(config, (err) => logger.warn?.('capture write failed:', err?.message ?? err))

  const llm = ctx?.llm
  if (!llm || typeof llm.registerAdapter !== 'function') {
    logger.warn?.(`${name}: llm 服务未注入，捕获未启用（请检查层序：本行需先于 LLM 适配器所在层应用）`)
    return
  }

  const original = llm.registerAdapter
  const patched = function registerAdapterCaptured(providerArg, adapter) {
    const providers = toArray(providerArg)
    if (!store.shouldCapture(providers)) {
      return original.apply(this, arguments)
    }
    return original.call(this, providerArg, wrapAdapter(adapter, providers, store))
  }
  llm.registerAdapter = patched

  // HMR/卸载时恢复原方法，避免补丁跨 fiber 泄漏
  ctx?.on?.('dispose', () => {
    if (llm.registerAdapter === patched) llm.registerAdapter = original
  })
}
