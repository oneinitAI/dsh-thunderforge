# 上下文 API、Fiber 与注册表

上下文是 Cordis 的核心对象：所有服务、事件和生命周期 API 都通过 ctx 访问。上下文是一个代理——普通属性读取通过服务解析器进行；extend()、isolate()、intercept() 创建有作用域的子上下文，且不修改父上下文。事件方法见 events.md；本页覆盖服务存储、作用域控制、Fiber 运行时实例与插件注册表。

## 派生子上下文

- **ctx.extend(meta?)** —— 在当前作用域之上创建子上下文：原型继承当前上下文全部属性；meta 自有属性（含 symbol 键）遮蔽继承的同名属性；父不被修改。
- **ctx.isolate(name, label?)** —— 使服务 name 拥有独立作用域：返回的上下文之下，对该服务的读写按新标签解析，可提供不同实现而不影响父作用域；同一 label 传给两次 isolate() 调用则加入同一作用域。
- **ctx.intercept(name, config)** —— 为在此上下文之下启动的插件添加服务专属拦截配置：其下加载的插件看到 config 已合并进该服务解析后的配置（祖先条目在前）；父不受影响。

## 环境句柄

| 成员 | 含义 |
| --- | --- |
| ctx.root | 应用根上下文（@experimental） |
| ctx.baseUrl | 解析相对插件/模块说明符的基础 URL（运行时设置时存在） |
| ctx.events | 事件总线（方法混入 ctx：ctx.on、ctx.emit 等） |
| ctx.logger | 日志服务；ctx.logger(name) 取具名 logger |
| ctx.reflect | 上下文代理的反射层（ctx.get、ctx.provide 等） |
| ctx.registry | 插件注册表（方法混入 ctx：ctx.plugin、ctx.inject） |
| ctx.fiber | 拥有此上下文的 fiber |
| ctx.scope | 当前作用域句柄 |

## 服务存储与混入

```ts
ctx.get(name, strict?)          // 读服务，无需注入要求；strict 默认 true（仅返回提供方 fiber 活跃的实现）；未提供返回 undefined
ctx.set(name, value)            // 覆盖已提供服务的值；只有提供该服务的 fiber 才能 set；未提供的名称抛异常
ctx.provide(name, value)        // 注册归当前 fiber 所有的服务实现；返回 disposer 取消注册（并唤醒依赖方）；已提供或已声明访问器则抛异常
ctx.accessor(name, options)     // 定义由 get/set 钩子支持的计算型上下文属性；fiber 卸载时移除；名称已声明抛异常
ctx.mixin(name, mixins)         // 把服务指定成员直接混入 ctx（如 ctx.on 转发到 ctx.events.on，方法绑定到服务）；fiber 卸载时移除
```

## 静态成员

- Context.effect / Context.filter / Context.isolate / Context.intercept —— symbol 键（诊断树、监听器过滤器、隔离映射、拦截映射）。
- **Context.is(value)** —— 判定 value 是否为 Cordis 上下文（跨 realm、跨多份 cordis 副本有效，品牌以全局 symbol 为键而非 instanceof）。

## Fiber 类（单次插件应用的运行时实例）

fiber 跟踪 ctx.plugin() 返回的插件上下文对应的依赖状态、经过校验的配置、生命周期作用与清理操作：

| 成员 | 含义 |
| --- | --- |
| fiber.uid | 注册表内唯一 id；根 fiber 为 0；dispose 后为 null |
| fiber.ctx | 此 fiber 插件运行的上下文（扩展自父上下文） |
| fiber.config | 经过校验的插件配置（由 update() 更新） |
| fiber.state | 当前生命周期状态；转换发出 internal/status |
| fiber.store | 加载期间必需服务实现的快照；否则 undefined |
| fiber.inertia | 进行中的加载/卸载转换；否则 undefined |
| fiber.name | 插件显示名，继承最近具名祖先，否则 'root' |
| fiber.assertActive() | 已 dispose 则抛 CordisError('INACTIVE_EFFECT') |
| fiber.effect(execute, label?) | 在 fiber 上注册支持清理的作用（ctx.effect 的委托目标） |
| fiber.getEffects() | 每个带标签的活动作用返回一棵 EffectMeta 树 |
| fiber.await() | 等待当前生命周期工作完成并重抛启动错误 |
| fiber.restart() | dispose 并立即用当前配置重新加载 |
| fiber.update(config, noSave?) | 先跑 internal/update waterfall（更新钩子与 HMR 可否决/取代重启），校验后重启插件 |

## Effect 形状

ctx.effect(execute, label?)：execute 立即运行；产生的清理函数被收集，并在调用返回的 disposer 或 fiber 卸载时**按相反顺序**运行（以先发生者为准）；重复调用 disposer 为 no-op；fiber 已 dispose 抛 CordisError('INACTIVE_EFFECT')。

```ts
type Effect<T = any> =
  | () => T                          // 单个清理函数
  | Promise<() => T>                 // 兑现为清理函数的 promise
  | Iterable<() => T> | AsyncIterable<() => T>  // 生成多个清理函数；生成器作用逐个注册
```

相关类型：Disposable（清理函数，可异步，卸载会等待）、EffectMeta（label + children 诊断树）、CordisError（带稳定机器可读 code 的框架错误）、ValidationError（插件配置未通过 standard-schema 校验）。

## 注册表（插件加载与依赖注入）

```ts
ctx.plugin(plugin, ...args)   // 函数/类/{ apply } 对象；args 按 Config schema 校验
                              // 返回 Fiber & PromiseLike：await 到加载完成，配置/启动错误 reject
ctx.inject(deps, callback)    // ctx.plugin({ inject, apply: callback }) 的简写
                              // 必需服务变化时卸载并重跑；deps 为数组或 名称→拦截配置 映射
```

Plugin 入口元数据（Base）：name（显示名）、Config（standard-schema 校验器，插件启动前应用）、inject（必需服务）、provide（提供的服务名，由 Service 与 loader 读取）、intercept（声明消费其拦截配置的服务名）。

## 继承的框架 ctx 成员与事件（Inherited Cordis API）

每个插件除了 harness 层，还能看到框架层：

- ctx 成员：on/once/emit/parallel/serial/bail/waterfall、plugin/inject、effect、get/set/provide/accessor/mixin、extend/isolate/intercept、root/scope/fiber/registry/reflect/events/logger。
- **ctx.timer 及助手**：interval / timeout / throttle / debounce。timer 键由运行时提供，四个助手直接混入 ctx；使用前以当前组合的生成参考为准（动态 cordis 环境要求 declare inject: ['timer']）。
- ctx.loader（启动应用的配置加载器）、ctx.hmr（HMR watcher）。
- 继承事件：internal/plugin、internal/status、internal/service、internal/update（waterfall：fiber 配置更新）、internal/get、internal/set、internal/listener、internal/dispatch、hmr/change、hmr/reload、exit、loader/config-update、loader/entry-init、loader/partial-dispose、loader/patch-context。完整签名见 Inherited Cordis API 页。
