// ThunderForge capture 插件入口：包装 llm.registerAdapter，
// 对每个注册进来的 LlmAdapter 透明套一层捕获代理。
// 协议要点（来自 DSH LLM 适配器规范）：
//   - 每个提供方路由仅对应一个适配器，重复注册抛异常 → 我们不重复注册，
//     只在注册时把原适配器包一层；resolveModel/listModels 经原型链透传。
//   - stream() 是 AsyncIterable<StreamChunk>，错误路径有两条（抛出 / finish error），
//     两条路径都要落盘且不得改变原语义。
//   - 真实 LlmRuntime（dsh 0.1.1-rc.2）主调用路径是两步协议：
//     adapter.prepareCall(provider, model, signal) → adapterCall.stream(options)，
//     而不是直接调 adapter.stream()。因此包装必须同时覆盖两种形态——
//     只包 stream() 会让 prepareCall 协议下的调用（官方 deepseek/pi-ai 适配器）
//     完全绕过捕获（2026-08-24 真机复现：web 会话 4k+ chunk 零落盘）。
import { CaptureStore, initConfig } from './core.js'

export const name = 'thunderforge-capture'
export const inject = ['llm']

// 配置键与默认值见 core.js DEFAULTS；树外插件零 harness 导入（生态惯例），
// 不再导出 Schemastery Config，避免把 @deepseek-ai 包拖进 profile 树造成 Symbol 双实例

function toArray(value) {
  return [value].flat().filter((item) => item !== undefined && item !== null).map(String)
}

/** 生成捕获流：对一次模型调用的 chunk 流套上捕获生命周期。 */
function makeCaptureStream(stream, providers, store) {
  return async function* captureStream(options) {
    const record = store.begin(providers, options)
    try {
      for await (const chunk of stream(options)) {
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
}

function wrapAdapter(adapter, providers, store) {
  if (!adapter || (typeof adapter.stream !== 'function' && typeof adapter.prepareCall !== 'function')) {
    return adapter
  }
  const wrapped = Object.create(adapter)
  // 协议一：适配器直接暴露 stream()（单步调用；保留以兼容旧适配器/直接调用路径）
  if (typeof adapter.stream === 'function') {
    wrapped.stream = makeCaptureStream(
      (options) => adapter.stream.call(adapter, options),
      providers,
      store,
    )
  }
  // 协议二：prepareCall() → adapterCall.stream()（LlmRuntime 主路径）。
  // LlmRuntime.adapterStream 只读 adapterCall.model 与 adapterCall.stream；
  // 用 Object.create 包一层并只重写 stream，不改动原 adapterCall（避免破坏冻结/身份）。
  if (typeof adapter.prepareCall === 'function') {
    wrapped.prepareCall = async function (provider, model, signal) {
      const call = await adapter.prepareCall.call(adapter, provider, model, signal)
      if (!call || typeof call.stream !== 'function') return call
      const wrappedCall = Object.create(call)
      wrappedCall.stream = makeCaptureStream((options) => call.stream(options), providers, store)
      return wrappedCall
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
    logger.warn?.(`${name}: llm 服务未注入，捕获未启用`)
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
  // 提示已错过的注册：llm 服务公开 API 无法枚举已注册适配器（私有 Map），
  // 若本插件应用晚于适配器注册（如整个 bundle 位于 dsh-base 之后），包装会落空。
  // 已知对策：把 dsh-thunderforge 移到 profile 的 dsh.profile.bundles 数组最前。
  logger.info?.(`${name}: 已挂载注册包装（对后续注册生效）`)

  // HMR/卸载时恢复原方法，避免补丁跨 fiber 泄漏
  ctx?.on?.('dispose', () => {
    if (llm.registerAdapter === patched) llm.registerAdapter = original
  })
}
