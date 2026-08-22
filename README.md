# ⚡ ThunderForge · 宇宙无敌雷霆霹雳炫光插件锻造炉

> **dsh-thunderforge** — 一站式 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 插件开发套件，单一 Bundle 形态：`dsh plugin add` 一次，锻造炉全开。

**创建 → 开发 → 调试 → 环境验证**，一个包装下全套，agent 用同一套工具与知识为你锻造插件。

## 当前能力（v0.1 · M0–M3）

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

### 🔍 thunderforge-debugger — 双数据源轨迹瀑布（M3）

模型工具 `thunderforge_debugger`：把**会话日志事件**（session.jsonl.zstd 解码，vendored 自 dsh-replay/MIT）与 **capture 索引流**（index.jsonl）按毫秒时间戳对齐成统一瀑布。

```
op: sessions=列出会话 · summary=概览(turns/steps/toolCalls/capture统计) · waterfall=对齐时间线
```

- zstd 容器 + chunk-row 解压解码（node:zlib 内建，零依赖）；已在真实 1.2 万事件会话上验证
- 每行 capture 记录带文件引用，瀑布里可直接定位失败调用的完整载荷

### 🧰 thunderforge-profile — profile 管理 + dev preset（M3）

模型工具 `thunderforge_profile`（核心 vendored 自 dshp/MIT）：

- `list` / `export`：列出本机 profile、导出可移植配置文本（论坛可贴、机器可还原）
- `create-dev-preset`：一键生成 `tf-dev-*` 干净 profile（预装 dsh-thunderforge link + capture 预设层），**只新建、绝不触碰既有 profile**
- `verify`：跑 `dsh --profile <名> --dump-config` 验证层加载（无 dsh CLI 时给出 npx 替代提示）

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
- [x] **M3** 调试器（双数据源瀑布）+ profile/dev preset + 运行时验收

## 合规声明

- 本项目以 **MIT** 分发，整体保留全部上游组件的版权声明与许可证文本（见 [`LICENSES/`](./LICENSES)）
- `thunderforge-capture` 为**清洁室实现**：仅依据 DSH 公开的适配器协议文档编写，未使用、未参考任何无许可证上游组件的代码
- 引入的 Apache-2.0 组件按文件级保留原协议并在 NOTICE 标注修改

## License

[MIT](./LICENSE) © 2026 ThunderForge Contributors
