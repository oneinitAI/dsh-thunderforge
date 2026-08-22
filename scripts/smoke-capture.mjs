// 端到端冒烟：模拟 cordis 上下文，验证注册包装、流透传、落盘、dispose 恢复全链路。
// 用法：node scripts/smoke-capture.mjs
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name } from '../src/capture/index.js'

const dir = await mkdtemp(join(tmpdir(), 'tf-smoke-'))
const registered = []
const llm = {
  registerAdapter(providers, adapter) {
    registered.push({ providers, adapter })
  },
}
const disposeHandlers = []
const ctx = { llm, on: (event, handler) => disposeHandlers.push([event, handler]), logger: undefined }

apply(ctx, { dir, pruneEvery: 1000 })
console.log(`插件: ${name} | inject: ${inject.join(', ')}`)

// 通过被包装的 registerAdapter 注册一个假适配器
const originalChunks = [
  { type: 'block-end', index: 0, block: { type: 'text', text: 'thunder!' } },
  { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } },
  { type: 'finish', reason: { kind: 'stop' } },
]
const fakeAdapter = {
  async *stream() {
    yield* originalChunks
  },
}
llm.registerAdapter(['deepseek'], fakeAdapter)
if (registered.length !== 1) throw new Error('注册未被透传')
const wrapped = registered[0].adapter
if (wrapped === fakeAdapter) throw new Error('适配器未被包装')

// 流透传：分片必须逐个原样通过
const received = []
for await (const chunk of wrapped.stream({ model: 'smoke-v1', apiKey: 'sk-secret' })) {
  received.push(chunk)
}
if (JSON.stringify(received) !== JSON.stringify(originalChunks)) throw new Error('分片透传被篡改')
await new Promise((resolve) => setTimeout(resolve, 150)) // 等异步落盘

const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
if (files.length !== 1) throw new Error(`期望 1 个捕获文件，实际 ${files.length}`)
const payload = JSON.parse(await readFile(join(dir, files[0]), 'utf8'))
if (payload.capture.ok !== true) throw new Error('ok 标记错误')
if (payload.capture.model !== 'smoke-v1') throw new Error('model 未记录')
if (payload.request.apiKey !== '***REDACTED***') throw new Error('密钥未掩码')
if (payload.response.blocks[0].text !== 'thunder!') throw new Error('块聚合错误')

// dispose 恢复原方法
for (const [event, handler] of disposeHandlers) if (event === 'dispose') handler()
llm.registerAdapter(['x'], fakeAdapter)
if (registered[1].adapter === fakeAdapter) console.log('dispose 后恢复原注册：透传不再包装 ✓')

console.log('冒烟全部通过 ⚡')
await rm(dir, { recursive: true, force: true })
