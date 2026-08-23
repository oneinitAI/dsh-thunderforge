<div align="center">

# ⚡ ThunderForge

### 宇宙无敌雷霆霹雳炫光 · DSH 插件锻造炉

**一站式 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 插件开发套件 · 单一 Bundle**

**中文** · [English](./README.en.md)

[![CI](https://github.com/oneinitAI/dsh-thunderforge/actions/workflows/ci.yml/badge.svg)](https://github.com/oneinitAI/dsh-thunderforge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-4D6BFE.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.19-339933.svg)](./package.json)
[![dsh](https://img.shields.io/badge/DSH-0.1.1--rc.2-7C3AED.svg)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![npm](https://img.shields.io/npm/v/dsh-thunderforge.svg)](https://www.npmjs.com/package/dsh-thunderforge)

**创建 → 开发 → 调试 → 环境验证 → 发布**，`dsh plugin add` 一次，锻造炉全开 ⚡

<sub>梦想还是要有的，万一雷霆劈中你了呢</sub>

**0 元以内最 nb 的 DSH 插件**

<sub>注*：「0 元以内最 nb 的 DSH 插件」为产品目标，非质量承诺；解释权归雷电所有</sub>

</div>

---

## 🔥 五大锻造引擎

| 引擎 | 形态 | 一句话 |
|---|---|---|
| ⚡ **thunderforge-capture** | 插件 | LLM 载荷捕获：透明代理 + 密钥掩码 + 轮转 + `index.jsonl` 索引流（清洁室自研） |
| 🧠 **thunderforge-skills** | 技能 ×4 | 四层知识库：入口索引 + 架构标准 + 坑点手册 + **画像自适应表达**（实时评估用户水平，动态匹配回答深度） |

> 🗣️ **dsh-buddy 画像自适应表达**（独立项目 [oneinitAI/dsh-buddy](https://github.com/oneinitAI/dsh-buddy)）：agent 从对话中被动观察，实时构建用户画像——熟练度、偏好、**领域差异**（十年后端也可能是 DSH 一年级）、当前状态——并按画像现场生成合适深度的回答；画像每轮更新，用户开始说术语就立刻升级表达。没有预设话术、没有术语对照表；拿不准时宁可略高估。轻梗每会话至多一句（first day to vibecoding: who is JSON?）。
| 🔨 **thunderforge-scaffold** | 模型工具 | 对话式脚手架：三类零依赖模板，**生成即冒烟** |
| 🔍 **thunderforge-debugger** | 模型工具 | 双数据源轨迹瀑布：会话日志 × capture 载荷按毫秒对齐 |
| 🧰 **thunderforge-profile** | 模型工具 | profile 管理 + 一键 dev preset（只新建、绝不碰既有环境） |

## 🚀 安装

```bash
# 从 npm（推荐）
dsh plugin --profile <profile名> add dsh-thunderforge
# 或从 GitHub
dsh plugin --profile <profile名> add github:oneinitAI/dsh-thunderforge
# 或本地目录（开发者）
dsh plugin --profile <profile名> add /path/to/dsh-thunderforge
```

装完**重启对应应用**（profile 在启动时组合；web 即重启 `dsh web`），然后验证：

```bash
dsh --profile <profile名> --dump-config    # 应出现 "# == dsh-thunderforge" 层
```

移除随时可逆：`dsh plugin --profile <profile名> remove dsh-thunderforge`

> ⚠️ **层序提示（capture 生效的关键）**：装进**已有** profile 后，请把 `dsh-thunderforge` 挪到该 profile `package.json` 的 `dsh.profile.bundles` 数组**最前**（先于 `@deepseek-ai/dsh-base`）——capture 靠包装适配器注册工作，晚于 base 内适配器行应用就会静默落空。经 `thunderforge_profile` 生成的 dev preset 已自动排好。

装好之后，对你的 agent 说：

> 帮我建一个带 webui 的 DSH 插件 —— 它会调用 `thunderforge_scaffold`，骨架自带调试埋点与冒烟测试，生成即验证。

一键干净开发环境（被测插件装进隔离 profile）：

```
你: 帮我生成一个 dev preset，短名 demo
AI: (thunderforge_profile) → tf-dev-demo 已就绪
    dsh plugin --profile tf-dev-demo add <被测插件> && dsh --profile tf-dev-demo
```

## 🛠️ 锻造之旅

```
  创建 ────► 开发 ────► 调试 ───────► 环境验证 ────► 发布
 scaffold   skills     capture +      dev preset      CI 模板随
  生成即     三层知识    debugger       干净 profile    骨架产出
  冒烟 ✅    按需加载    双源瀑布 ⚡    只新建不动旧 ✅
```

- 每步产物是下一步的输入：骨架的 `thunderforge.debug.json` 埋点声明 capture 索引流与事件前缀，debugger 直接消费
- 真机验收：dsh `0.1.1-rc.2` CLI `plugin add` + `--dump-config` 五行全部加载 ✅（含一个被真机抓住并修复的 patch 格式 bug）

## 📦 状态

- ✅ M0–M3 全部完成，`node --test` 28/28（含三模板生成即冒烟）
- ✅ `npm pack` 433 文件验证：源码/知识库/许可证全在，dev 文件全排除
- 🙋 live 端到端（对话 → 工具调用 → capture 落盘 → 瀑布对齐）欢迎你亲手试：`dsh --profile <你的profile> "调用 thunderforge_scaffold ..."`

## 🙏 致谢与上游协议（必读）

ThunderForge 站在社区巨人的肩膀上，**尊重并严格遵守每一个上游仓库的开源协议**：

| 上游项目 | 协议 | 在 ThunderForge 中的角色 |
|---|---|---|
| [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | MIT | 运行底座与官方规范依据 |
| [dsh-plugin-dev-skills](https://github.com/zimodzh/dsh-plugin-dev-skills) | MIT | **原样 vendor** → `skills/arch-standard/`（含其协议原文） |
| [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | Apache-2.0 | **原样 vendor** → `skills/pitfalls/`（协议与 NOTICE 原文保留） |
| [dsh-replay](https://github.com/zoahdev/dsh-replay) | MIT | **原样 vendor** → `src/debugger/session-log.js`（文件头标注来源） |
| [dshp](https://github.com/asdf17128/dshp) | MIT | **原样 vendor** → `src/profile/dshp/`（文件头标注来源） |
| [dsh-trajectory-debug](https://github.com/devmom/dsh-trajectory-debug) | MIT | 概念参考（未 vendor 代码），台账已记 |

- 全部 vendor 文件**未修改实现**，仅前置来源声明头；各上游许可证原文随包分发（见 [`LICENSES/`](./LICENSES)）
- Apache-2.0 组件按其协议要求文件级保留原协议与 NOTICE
- 生态中存在一个**无许可证**的同类捕获组件，ThunderForge 明确不予引入，其功能为清洁室自研——未使用、未参考其任何代码

## 📄 许可证

[MIT](./LICENSE) © 2026 ThunderForge Contributors

本项目按"原样"提供；对上游组件的权利主张始终以各上游协议原文为准。完整台账见 [`LICENSES/README.md`](./LICENSES/README.md)。
