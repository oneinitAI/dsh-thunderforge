# 插件形态与生命周期

## 插件是什么

DSH 中插件是一个导出 apply 函数的 TypeScript 模块。框架加载时调用 apply(ctx)，插件经 ctx 注册自己贡献的一切。不存在需要打补丁的特权内核：扩展 DSH 的方式是把插件挂载到其他插件旁边，各项注册都是副作用，随插件卸载撤销。

## 三种形态

```ts
import type { Context } from '@deepseek-ai/cordis'

// 1. 函数形态（最常见）
export const name = 'my-plugin'
export const inject = ['tools']
export function apply(ctx: Context) { /* ... */ }

// 2. 对象形态
export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) { /* ... */ },
}

// 3. 类形态：Service 子类，向其他插件提供服务时使用（见 services.md）
import { Service } from '@deepseek-ai/cordis'
export default class MyService extends Service {
  static inject = ['tools']
  constructor(ctx: Context) { super(ctx, 'myService') }
}
```

name 导出是可选的显示元数据。需要公开服务之前一直用函数形态。

## Fiber 状态机

每个被加载的插件拥有一个 Fiber 作用域：

```
PENDING → LOADING → ACTIVE
              ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| 状态 | 含义 |
| --- | --- |
| PENDING | 已声明，但所需依赖未就绪 |
| LOADING | 依赖就绪，正在执行 apply |
| ACTIVE | 插件运行中 |
| FAILED | apply 抛出异常 |
| UNLOADING | 正在卸载并释放资源 |
| DISPOSED | 已完全卸载 |

## 依赖驱动的加载

声明了 inject 的插件会等待所有必需服务就绪才执行 apply。若依赖的服务消失（例如提供方被替换），插件自动卸载（ACTIVE → DISPOSED）；服务恢复后自动重新加载。

## 自动清理机制

通过 ctx 做的任何注册，在插件卸载时都会自动撤销：

```ts
export function apply(ctx: Context) {
  ctx.on('some-event', handler)          // 事件监听：卸载时自动移除
  ctx.tools.register(tool)               // 工具注册：卸载时自动注销
  ctx.llm.registerAdapter(names, adapter) // 适配器注册：同样自动撤销
  ctx.effect(() => {                     // 自定义资源：返回的 disposer 在卸载时执行
    const connection = createConnection()
    return () => connection.close()
  })
}
```

处置器按注册顺序的**逆序**开始调用；多个异步处置器并发执行、不保证逐个完成。存在顺序依赖的清理步骤必须放进同一个 ctx.effect() 返回的处置器中，由它负责串行等待。

## 嵌套上下文

ctx.plugin(childPlugin) 创建子 Fiber：继承父上下文、拥有独立生命周期，随父插件卸载。

```ts
const fiber = ctx.plugin(myPlugin)   // 子 Fiber
await fiber.dispose()                // 手动提前终止
```

dispose 保证：该插件拥有的所有注册被移除；其子插件被递归卸载；返回的 Promise 在所有异步清理完成后兑现。

## 失败行为

- apply 抛出异常 → 进程因该错误终止。插件加载失败会明确报错，不会仅跳过该配置项。
- 配置项的模块无法解析（路径或包名拼写错误）→ Cordis 通过 logger 服务报告错误，进程不崩溃；启动早期这条报告可能丢失。新增配置项似乎没有效果时，先检查拼写。

## HMR（热模块替换）

通过 cordis.yml 加载 @deepseek-ai/cordis-plugin-hmr 后，修改插件源文件会触发：卸载旧插件（清理所有注册）→ 重新加载新代码 → 执行新的 apply。修改 cordis.yml 中某插件的 config 同样触发热替换。因为注册都被自动清理，热替换后不会保留旧实例的注册。
