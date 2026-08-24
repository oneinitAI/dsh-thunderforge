---
name: thunderforge-dev
description: Use when developing, reviewing, debugging, packaging, or answering questions about DeepSeek Harness (DSH) plugins — or when the user wants to build or extend an agent capability inside dsh without naming "plugin" (add a tool, let the agent read files, connect a new LLM provider, wire a cordis.yml/bundle/profile layer, forge a plugin with ThunderForge's thunderforge_scaffold / thunderforge-capture / thunderforge-debugger / thunderforge_profile). This skill is the entry index over the two-layer knowledge base (dsh-plugin-dev architecture standard, dsh-plugin-guide pitfalls handbook) plus the ThunderForge forge workflow. Not for: general coding outside dsh, or end-user usage questions — route those to the knowledge layers above.
metadata:
  author: ThunderForge Contributors
  version: "0.3.0"
  sources: agentskills.io/specification · agentskills.io/skill-creation/optimizing-descriptions
---

# 插件锻造入口（thunderforge-dev）

本技能是 **ThunderForge 知识体系的统一入口**，不承载事实细节——细节永远在两层知识库里，按需加载、引用原文。触发后先走下面的决策，再决定加载哪一层。

## 第一决策：该查哪一层

| 你要做的事 | 先查 | 补充查 |
|---|---|---|
| 写/改/审插件代码（生命周期、服务、事件、工具 DSL、适配器、三种角色） | `dsh-plugin-dev`（架构标准层） | `dsh-plugin-guide`（核对官方约束） |
| 打包、安装、cordis.yml 组合、bundle/profile 层序 | `dsh-plugin-dev` → packaging | `dsh-plugin-guide` → 官方文档副本 |
| 排查"为什么不生效/报错/被拒" | `dsh-plugin-guide`（坑点手册层） | `dsh-plugin-dev`（机制原理） |
| 从零创建新插件 | 本页 §锻造流程 + `thunderforge_scaffold` 工具 | 生成后按骨架内 README 走 |

两层随 ThunderForge bundle 安装（同名目录可独立加载）。冲突时**架构标准层的机制描述为准，坑点手册层的官方引用为准**。

## 锻造流程（从零到可调试）

1. **创建**：调用 `thunderforge_scaffold`（参数：插件名、模板 `tool`/`events`/`webui`、输出目录）。骨架自带：调试埋点 `thunderforge.debug.json`、冒烟测试、CI 模板、capture 接入说明。
2. **开发**：按 `dsh-plugin-dev` 的硬规则写实现；拿不准 API 时读其 `references/` 对应篇目。
3. **验证**：骨架的 `npm test` 即冒烟（加载校验 + `node --test`）。
4. **观测**（可选）：宿主 profile 启用 `thunderforge-capture` 后，每次模型调用的请求/响应都会落盘，`index.jsonl` 为索引流。

## ThunderForge 工具速查

| 能力 | 形态 | 说明 |
|---|---|---|
| `thunderforge_scaffold` | 模型工具 | 生成带埋点的插件骨架（tool/events/webui） |
| `thunderforge_debugger` | 模型工具 | 会话轨迹瀑布/概览，与 capture 索引对齐 |
| `thunderforge_profile` | 模型工具 | profile 列出/导出/dev preset/启动验证 |
| thunderforge-capture | 插件 | LLM 载荷捕获（密钥掩码、轮转、index.jsonl） |
| dsh-buddy | 技能 | 用户画像自适应表达（详见其自身技能） |

**capture 层序**：thunderforge 需在 profile 的 `dsh.profile.bundles` 里排在 `@deepseek-ai/dsh-base` **之前**，capture 才能包装 base 内 LLM 适配器的注册（llm 服务无法枚举已注册适配器，晚到即落空）。

**技能不生效？** 先确认 agent preset 含 Skills 能力——minimal（极简模式）会裁掉 `skill` 工具，知识库注册了也不会被模型触发；切换标准模式后重启会话。

## 硬规则（与 dsh-plugin-dev 一致，违反必翻车）

1. 插件入口导出 `name` + `apply(ctx, config)`；副作用经 `ctx.effect()` 注册以获得自动清理
2. 依赖服务写进 `inject`；不要 import 具体实现包来拿服务
3. 工具注册必须带 `output { schema, render }`（raw JSON Schema，`'json'` 是 defineTool 糖不认）
4. 每个提供方路由仅一个 LLM 适配器；重复注册会抛异常
5. patch 行按 id 覆盖时必须重述整行所有键（层胜出是整行替换，不深度合并）