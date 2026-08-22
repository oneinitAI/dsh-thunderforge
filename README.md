# ⚡ ThunderForge · 宇宙无敌雷霆霹雳炫光插件锻造炉

> **dsh-thunderforge** — 一站式 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 插件开发套件，单一 Bundle 形态：`dsh plugin add` 一次，锻造炉全开。

**创建 → 开发 → 调试 → 环境验证**，一个包装下全套，agent 用同一套工具与知识为你锻造插件。

## 当前能力（v0.1 · M0–M2）

### ⚡ thunderforge-capture — LLM 载荷捕获（清洁室自研）

替代生态中无许可证的同类组件，从零实现，并做了增强：

- **透明代理**：包装 `ctx.llm.registerAdapter`，对每个注册的 LLM 适配器套一层捕获代理，`resolveModel` / `listModels` 经原型链原样透传，不重复注册、不破坏"每路由一个适配器"的协议约束
- **双错误路径落盘**：`stream()` 抛出与 `finish { kind: 'error' }` 都完整记录，且**绝不打断模型流**（写盘异步化）
- **密钥掩码**：`apiKey` / `token` / `authorization` 等字段默认 `***REDACTED***`，可关闭
- **轮转清理**：按文件数 / 总字节数保留最新的捕获，自动删旧
- **索引流**：每次捕获在 `index.jsonl` 追加一行摘要，供调试器（M3 轨迹瀑布）直接消费
- Schemastery Config schema，零额外依赖（复用 dsh 官方包），ESM，Node ≥ 22.19

### 🧠 thunderforge-skills — 三层知识库（M1）

安装即得三份开发知识，agent 写插件时按需加载：

| 技能 | 层 | 来源 |
|---|---|---|
| `thunderforge-dev` | 入口索引层（ThunderForge 自研） | 决策表：何时查架构、何时查坑点 + 锻造流程 |
| `dsh-plugin-dev` | 架构标准层 | [dsh-plugin-dev-skills](https://github.com/zimodzh/dsh-plugin-dev-skills)（MIT，原样引入） |
| `dsh-plugin-guide` | 坑点手册层 | [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)（Apache-2.0，原样引入） |

挂载方式：`ctx.skills.register()` 内联注册 + 目录 `resourceBase`（references/examples 相对可解析，调研笔记见 `docs/notes/m1-skill-loading.md`）。

### 🔨 thunderforge-scaffold — 对话式脚手架（M2）

模型工具 `thunderforge_scaffold`：一条调用完成 **生成 → 落盘 → 冒烟** 闭环。

```
参数: plugin_name (kebab-case) · template (tool/events/webui) · dir? · verify?
```

- 三类零依赖模板：**tool**（模型工具）/ **events**（tools/pre-execute 门禁钩子）/ **webui**（session/event 界面）
- 每套骨架自带：`thunderforge.debug.json` 调试埋点清单（capture 索引流 + 事件前缀）、`test/smoke.test.mjs` 加载校验冒烟、GitHub Actions CI
- 默认生成后立即在骨架内跑 `node --test`，冒烟结果直接回到模型
- 领域失败（非法名/目录已存在）返回规范错误值而非抛异常

### 安装

```bash
dsh plugin add github:<你的用户名>/dsh-thunderforge
```

本地开发验证：

```bash
dsh plugin --profile demo add ./F:/dsh-p
dsh --profile demo --dump-config   # 应显示 "# == dsh-thunderforge" 层
```

### 配置（cordis.patch.yml 中本行的 config 键）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `dir` | `DSH_HOME/thunderforge-capture` | 捕获输出目录 |
| `providers` | `[]`（全部） | 仅捕获这些 provider |
| `redact` | `true` | 掩码疑似密钥字段 |
| `captureDeltas` | `false` | 额外记录原始 StreamChunk 分片序列 |
| `maxStringLength` | `0`（不限） | 单字符串保留长度 |
| `maxFiles` | `2000` | 保留捕获文件数上限 |
| `maxTotalBytes` | `0`（不限） | 捕获目录总字节上限 |
| `pruneEvery` | `50` | 每 N 次写入执行一次清理 |

### 捕获数据格式

每次生成一个 JSON 文件 + `index.jsonl` 一行摘要：

```jsonc
{
  "capture": { "tool": "thunderforge-capture@0.1.0", "seq": 1, "ts": "...", "providers": ["deepseek"], "model": "...", "ok": true, "durationMs": 1234, "chunkCount": 42 },
  "request": { "...GenerateOptions 清洗后快照（signal/函数已剔除，密钥已掩码）": "" },
  "response": { "blocks": ["...block-end 聚合的完整块"], "usage": { "inputTokens": 0, "outputTokens": 0 }, "finish": { "kind": "stop" } },
  "error": null
}
```

## 路线图

- [x] **M0** Bundle 骨架 + thunderforge-capture（替代无许可组件）
- [x] **M1** 知识库合并分层（入口索引 + 架构标准 + 坑点手册）
- [x] **M2** 脚手架内化为 agent 工具 + 调试埋点 + 生成即冒烟
- [ ] **M3** 调试器合并（轨迹瀑布 + 时间旅行回放）+ dev preset + 冒烟链路 + 发布

## 合规声明

- 本项目以 **MIT** 分发，整体保留全部上游组件的版权声明与许可证文本（见 [`LICENSES/`](./LICENSES)）
- `thunderforge-capture` 为**清洁室实现**：仅依据 DSH 公开的适配器协议文档编写，未使用、未参考任何无许可证上游组件的代码
- 引入的 Apache-2.0 组件按文件级保留原协议并在 NOTICE 标注修改

## License

[MIT](./LICENSE) © 2026 ThunderForge Contributors
