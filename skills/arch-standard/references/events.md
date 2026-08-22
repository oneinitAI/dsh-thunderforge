# 事件系统

事件是 Cordis 插件间通信的核心机制。Harness 大量使用事件来实现松耦合的扩展点。事件监听器也是效果：通过 ctx.on() 注册的监听器归当前 fiber 所有，在插件卸载时自动移除。

## 基本用法

```ts
ctx.on('event-name', (payload) => { /* 处理事件 */ })
ctx.emit('event-name', payload)
```

ctx.on(name, listener, options?) 返回一个用于移除监听器的 disposer；options 可为布尔值（prepend 简写）或 EventOptions：

```ts
interface EventOptions {
  prepend?: boolean   // 插到同事件既有监听器之前
  global?: boolean    // 无视上下文过滤器检查仍接收该事件
}
```

ctx.once(name, listener, options?) 与 on 相同，但监听器首次调用后自行注销。

## 五种分发模式

| 模式 | 语义 | 何时用 |
| --- | --- | --- |
| emit | 同步广播：同步运行所有监听器、不等待、返回值被忽略 | 通知型事件（状态变更、日志） |
| parallel | 并发执行所有监听器，Promise 在全部 settle 后兑现 | 无顺序要求的异步通知 |
| bail | 同步短路：按顺序调用，第一个非 null/false/undefined 的返回值成为结果 | 拦截检查（权限、校验） |
| serial | 顺序执行并依次等待异步监听器，直到一个提前终止（bail 值） | 有序初始化/阶段流程 |
| waterfall | 流水线：每个监听器包装下游返回值形成处理链；**必须调用 next()** | 转换、组装、可插拔策略 |

DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall'。事件声明及其分发模式由各子系统页面生成。

### emit / parallel — 广播

```ts
ctx.emit('my-plugin/ready', { id: 'worker-1' })        // 同步，不等待
await ctx.parallel('my-plugin/ready', { id: 'worker-1' })  // 并发并等待全部完成
ctx.on('my-plugin/ready', ({ id }) => console.log(id + ' is ready'))
```

### bail — 短路

```ts
const result = ctx.bail('some-check', input)
ctx.on('some-check', (input) => {
  if (shouldBlock(input)) return 'blocked'   // 非空返回 → 短路并成为结果
  // 返回 null / false / undefined → 继续下一个监听器
})
```

### serial — 顺序执行

```ts
await ctx.serial('setup-phase', context)
```

### waterfall — 流水线（关键规则）

```ts
const output = await ctx.waterfall('my-plugin/transform', input, async () => input)

ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()   // next() 是强制的
  return downstream.trim()
})
```

**waterfall 监听器必须调用 next()。** 不调用会否决整个下游——这是故意的设计，用于拦截/网关逻辑；否则必须调用并把结果返回。

## 类型安全的事件

用 TypeScript 声明合并给事件提供类型：

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}
// 之后 ctx.on / ctx.emit / ctx.parallel / ctx.serial / ctx.bail / ctx.waterfall 都能正确推导
```

## 事件命名

Harness 的 Cordis 事件遵循 namespace/action 命名，例如 agent/step、agent/request、agent/request-error、tools/result、session/event。完整签名与触发模式见子系统页面生成的 cordis-surface 区块（以生成为准）。

## Cordis 事件 vs 持久会话事件

- turn/*、step/*、tool/call、tool/result、compaction/* 是**持久化的会话事件**类型，不是同名 Cordis 事件。
- 需要观察它们时，监听 session/event 并检查 event.type，而不是 ctx.on('tool/result')。

```ts
ctx.on('session/event', (event) => {
  if (event.type === 'tool/result') { /* ... */ }
})
```

## 示例：日志插件

```ts
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log('[tool] ' + exec.name + ' ' + JSON.stringify(exec.arguments))
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log('[tool result] ' + text.slice(0, 100))
  })
}
```

## 框架继承事件

除 harness 自有事件外，每个插件还能看到框架层事件：internal/plugin、internal/status、internal/service、internal/update（waterfall，fiber 配置更新）、internal/get、internal/set、internal/listener、internal/dispatch、hmr/change、hmr/reload、exit、loader/config-update、loader/entry-init、loader/partial-dispose、loader/patch-context。完整清单与签名见 Inherited Cordis API 页。
