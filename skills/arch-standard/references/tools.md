# 工具开发

面向模型的工具必须满足的约定，均以本文为准。按步骤构建第一个工具见 SKILL.md 场景 B；packages/shell/tool-bash 是生产级三包示例。

## 两种注册方式

- **defineTool（第一方推荐）**：类型化辅助函数——根据 parameters 推导并校验 args、根据 output.schema 推导返回类型，并为输出投影器提供类型约束。
- **原始 JSON Schema ToolDefinition（直接注册）**：ctx.tools.register() 也直接接受原始 JSON Schema 定义——MCP 来源的工具就是这样到达的。此类工具自行负责输入校验（见下「已强制执行的原始 JSON Schema 子集」）。

## 最小形态

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',        // 模型看到的描述
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                  // 缺省即可选
    },
    output: {
      schema: { type: 'string' },                 // 规范输出值 schema
      render: (_args, value) => [{ type: 'text', text: value }],  // 模型可见内容
    },
    async execute(args, exec) {
      // args 由 schema 推导并校验：{ path: string; limit?: number }
      // exec 携带不可变身份 + token；signal 是操作字段
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

注册基于副作用：dispose 插件 fiber 即注销该工具。schema 自动流入系统提示词组装。

## execute() 约定的规则

1. **参数已为你校验。** defineTool 在 execute 运行前按 ParameterSchemaSpec 校验模型生成的 arguments（类型、必填键、字面量约束、oneOf 恰中一分支、嵌套值）。显式对象节点必须声明 additionalProperties: true | false；隐式参数根对象保持开放。schema DSL 无法表达的约束（非空字符串、正数、跨字段规则）仍需手动检查。直接注册原始 JSON Schema 的工具自行负责输入校验。
2. **注册借用你的只读定义。** 同进程贡献不是序列化边界；注册后不要修改 schema 或替换回调。热替换工具 = dispose 其所属 effect 并注册替代品；回调闭包内的可变状态是普通插件状态。
3. **执行身份受保护。** arguments 会被物化为无损 JSON 并在策略前冻结；exec.token 是不透明标识。callId、name、arguments、agent、token、signal、parent 全程不可变。把 args 视为只读输入。只有 around-dispatch 包装器能替换（不能移除）exec.signal 施加截止时间。
4. **声明并返回一个规范 JSON 值。** output.schema 用 ValueSchemaSpec，根可以是对象、数组、标量或 null。execute 只返回推导值；注册表快照为无损 JSON、校验冻结后交给 output.render(args, value)。**不要返回内容块**，不要让调用方从自然语言里解析 id 和字段。
5. **抛出异常或返回无效值意味着 isError。** 注册表捕获异常，并在观察者运行前收敛 schema、渲染器、元数据投影与无损 JSON 失败。基础设施故障抛异常；成功的领域结果（即使表示不理想状态，如进程非零退出）应写入规范值，由渲染器解释。
6. **遵守 exec.signal。** 信号触发时取消进行中的工作。
7. **presentationMeta 投影持久卡片数据（可选）。** output.presentationMeta(args, value) 从同一规范值派生可回放 JSON，核心持久化在 tool/result 上并传给 presentResult。
8. **用 exec.agent 发送异步通知。** agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } }) 追加持久上下文供下一次模型请求可见——这不是唤醒。对已 dispose 的 agent 要 try/catch。
9. **声明并发安全性。** 可选 isConcurrencySafe(args) 返回该次调用能否加入并行组。执行模式由注册表按可见定义分类（executionMode）：只有精确返回 true 才得到 parallel（可与兄弟调用重叠）；未知、隐藏、未声明、无效或抛错的分类器一律 fail-closed 为 exclusive（独占执行并形成顺序屏障）。

## 统一的 JSON 值 schema DSL

ValueSchemaSpec 支持：string、number、integer、boolean、null、array、object、仅作者侧可用的 json、以及要求恰好命中一个分支的 oneOf；标量 enum 和 const 必须与节点类型匹配。**显式对象节点始终声明 additionalProperties: true | false。** 参数定义是隐式的开放对象属性映射，每属性用 required: true 标注。

```ts
type ValueSchemaSpec =
  | StringValueSchemaSpec | NumberValueSchemaSpec | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec | NullValueSchemaSpec | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec | JsonValueSchemaSpec | OneOfValueSchemaSpec

type ParameterSchemaSpec = { [key: string]: ValueSchemaSpec & { required?: true } }
```

- { type: 'json' } 推导为 JsonValue，编译成仅含注解、不施加约束的原始 schema。
- InferValue<S> 在 16 层容器内保留字面量约束与对象开放性，之后回退为 JsonValue；运行时校验仍遍历完整 schema。
- 参数不匹配抛 ToolArgsError（INVALID_ARGS）；函数体或后置策略产生无效值抛 ToolOutputError（INVALID_TOOL_OUTPUT）。两者走常规工具错误路径。
- 原始 JSON Schema 默认保持开放；不支持的关键字被拒绝，不会在未强制执行的情况下获准进入。

## ToolRestriction — 作用域实时过滤器

作用于该作用域继承来的工具（部署全局层 + 祖先作用域链）。多个限制取交集；作用域自身的注册不受约束。allow 列表排除未列出的继承工具，deny 只移除列出的：

```ts
interface ToolRestriction {
  allow?: readonly string[]   // 保留白名单，其余移除
  deny?: readonly string[]    // 移除黑名单
}
```

需要在展示、查找和执行之间保持对齐的工具过滤，优先使用 ctx.tools.restrict()（注册表让三者使用同一可见性解析器）。

## 执行流水线

ctx.tools.execute() 将调用依次经过：tools/pre-execute（可重排的 allow/deny/ask waterfall）→ 已注册的单调 guard → tools/execute（环绕分派包装层）→ tools/post-execute（检查/替换/阻止结果）→ 定义自有的 finalizeContent → tools/result（冻结的不可变权威结果）。

```ts
// 前置决策
type PreToolDecision = { kind: 'allow' } | { kind: 'deny'; reason: string } | { kind: 'ask'; reason?: string }
// 后置决策：替换内容或值（不能同时），阻止则转 isError 并附纠正反馈
type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
// 单调 guard：返回 reason 即拒绝，undefined 放行；没有 allow 结果，拒绝不可被撤销
type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

要点：

- waterfall 监听器调用 next() 取默认决策，或直接返回决策短路。前置策略可 deny 或 ask；只有 allowed-once 才继续执行。
- **参数不可被改写**——历史记录、审计、UI 和执行必须一致。
- 替换内容保留规范值与元数据；替换值会重新校验并重算内容/元数据；阻止会移除值并转为 isError。**内容替换是展示策略而非保密策略**——要隐藏程序化值必须阻止或替换 value。
- tools/result 观察者拿到冻结结果，无法变换，失败被隔离。未知工具与抛异常工具都变为结构化错误（UNKNOWN_TOOL），调用失败但不终止当前轮次。

## 已强制执行的原始 JSON Schema 子集

外部（subagent/工作流/MCP/动态注册）提供的原始 schema 用同一子集表达：

```ts
interface JsonSchemaNode {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  oneOf?: JsonSchemaNode[]                    // 至少两个分支，恰好匹配其一
  properties?: Record<string, JsonSchemaNode> // 仅 type: 'object'
  required?: string[]
  additionalProperties?: boolean              // 显式对象节点必须声明
  items?: JsonSchemaNode                      // 仅 type: 'array'
  enum?: JsonSchemaScalar[]
  const?: JsonSchemaScalar
  description?: string; title?: string        // 注解，忽略
  default?: JsonValue; examples?: JsonValue   // 注解，须为无损 JSON
}
```

assertSupportedJsonSchema() 拒绝无效组合；validateJsonSchemaValue() 强制执行；JsonSchemaError 报告每条不受支持的路径。仅含注解的空节点表示不受约束的无损 JSON。

## 长时间运行的工作

通过 producer 配置控制 run_in_background，用 ctx.jobs.start({ kind, label, owner: exec.agent, run }) 注册任务：

- 预先中止的调用在进入 producer 主体前被判为失败（此时没有任务，其 id 无法满足成功输出 schema）。
- 成功后台分支返回类型化规范句柄，如 { kind: 'background', jobId }。渲染器可保留人类可读文本，但 Code Mode 绝不能靠解析文本取得 id。
- ctx.jobs.start() 发布 id 之后，用任务自有的取消信号而非 exec.signal：此后取消外层调用只停止等待，不终止已发布的工作；其生命周期归 job_kill、owner dispose 与服务 teardown 所有。前台工作仍与 exec.signal 耦合。

## 执行策略与观测（不要内建策略）

选择规则（完整示例见 references/plugin-forms.md 的钩子插件一节）：

- tools/pre-execute —— 可扩展的允许/拒绝/询问策略（钩子插件、权限门禁）
- ctx.tools.guard() —— 最终单调拒绝（后续监听器无法撤销）
- tools/execute —— 截止时间、重试、指标收集（仅 exec.signal 可替换）
- tools/post-execute —— 替换展示内容或返回值、阻止结果、附加模型可见上下文
- tools/result —— 观测不可变归一化结果而不改变它

## Code Mode 自动触达你的工具

在 Code Mode 中，每个可见的已注册工具都可通过 await tools.<name>(args) 调用，无需额外集成。ToolArgsMap/ToolOutputMap 按同一组 schema 派生精确类型，调用重新进入正常执行流水线。成功解析为策略处理后的最终规范 JSON 值（不是渲染后的内容）；失败以真正的 ToolCallError reject（程序只能检查 name、toolName、message）。

把 output.schema 设计成实用的程序化 API：直接返回句柄与字段；面向人类的解释放 output.render。中间值只存在于执行期间，不被持久化、不按提示词上限截断。

## 工具在 UI 中的渲染方式

output.render 返回模型可见内容；UI 卡片是独立关注点，经纯展示投影 + 可选 presentCall/presentResult 声明。

- presentCall(args) → ToolCallView：{ card: 'generic', title, kind?, rawInput?, content?, locations? }（默认卡片，kind 选图标，locations 标注涉及文件）、{ card: 'terminal', title, description?, cwd? }（shell 命令）、{ card: 'diff', title, diffs, locations? }（diffs: [{ path, oldText, newText }]，新文件 oldText: null）。
- presentResult(args, { content, isError, meta? }) → ToolResultView：generic / terminal（输出+退出元数据）/ diff（已应用 hunk，通常由 presentationMeta 持久化）/ search（shape: 'matches' | 'paths' + truncated/total，不携带结果文本）/ read（行号窗口）/ web（kind: 'search' | 'fetch'）。完成视图替换 pending 视图；变更类工具保留 diff 结果。

硬性规则：

- **纯函数。** 实时流式输出与会话日志回放都会运行它们——不做 I/O、不读会话状态、不用时钟/随机数。想在 presentCall 里读文件旧内容或工作目录 = 放错层：那是持久结果元数据或 UI 适配器的职责。
- **UI 格式不进模型结果。** 围栏、diff、相对化路径都不得仅为服务 UI 进入规范值或 Native 内容。
- **defineTool 对展示路径软校验。** 格式错误或旧日志的参数使包装器返回 undefined（通用回退）而非抛异常——展示绝不能导致回放崩溃。

## 验证

遵循仓库测试策略与所属包测试文档；已交付且面向模型或 UI 的变更必须提供其中规定的组装覆盖。
