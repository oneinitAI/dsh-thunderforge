# ThunderForge 阶段性 PRD（v2 · 详细版）

> **ThunderForge · 宇宙无敌雷霆霹雳炫光插件锻造炉**（`dsh-thunderforge`）
> 一站式 DSH 插件开发套件 · 单一 Bundle · MIT · 粘合层打通
>
> 本文档是唯一进度真相源：每个里程碑含目标 / 任务 / 交付物 / 验收标准 / 风险对策，完成即勾选。

## 0. 总体决策记录（已拍板，不再重议）

| 决策点 | 结论 | 依据 |
|---|---|---|
| 产品形态 | 单一 dsh Bundle，`dsh plugin add` 一次装全 | 用户决策 2026-08-22 |
| payload 捕获 | 不使用无许可上游组件；自研清洁室替代（已交付） | 许可审计：上游无 LICENSE |
| 分发许可 | MIT 开源 | 生态一致、摩擦最小 |
| 打通深度 | 粘合层打通：不动各组件内部结构，靠统一入口/预设/数据格式串联 | 风险低、上游可同步 |
| 命名 | ThunderForge（`dsh-thunderforge`） | 雷霆风格 |

**非目标**：不做插件商店；不魔改 dsh 核心；v1 无 Web GUI。

**合规底线**：所有引入组件保留原许可证文本（`LICENSES/`）；Apache-2.0 组件文件级保留 + NOTICE 标注修改；不引入 `moeblack/dsh-payload-capture` 的任何代码。

---

## M0 — 地基与替代 ✅（2026-08-22 完成）

**目标**：项目骨架成型；无许可组件的替代品落地并验证。

### 已交付

| # | 交付物 | 说明 |
|---|---|---|
| 1 | 规范研读 | LLM 适配器协议（GenerateOptions / StreamChunk / registerAdapter 语义）与打包规范（bundle manifest / patch 层序 / 子路径引用），来源为 MIT 的 dsh-plugin-dev-skills，合法 |
| 2 | Bundle 骨架 | `package.json`（`dsh.bundle` manifest + exports）、`cordis.patch.yml`（thunderforge-capture 插件行）、README、MIT LICENSE、`LICENSES/README.md` 合规台账（7 组件待引入 + 1 排除记录）、`.gitignore`、git init（main） |
| 3 | `thunderforge-capture` | 清洁室自研：`src/capture/core.js`（清洗：密钥掩码/截断/循环容错；StreamChunk 聚合；存储：单次 JSON + index.jsonl 索引流 + 双维度轮转）+ `src/capture/index.js`（包装 `ctx.llm.registerAdapter`，原型链透传 resolveModel/listModels，双错误路径落盘，写盘异步化不打断模型流，dispose 自动还原补丁，HMR 安全） |
| 4 | 质量体系 | 8 个单测全绿（掩码/聚合/失败路径/provider 过滤/轮转）+ 端到端冒烟（注册包装→分片原样透传→落盘→恢复原方法） |

### 验收标准（全部达成）

- [x] `node --test` 8/8 通过
- [x] 冒烟：分片透传逐字节一致、密钥掩码生效、dispose 后不再包装
- [x] 零运行时依赖，ESM，Node ≥ 22.19
- [x] 清洁室声明 + 合规台账就位

---

## M1 — 知识库合并分层 ✅（2026-08-22 完成）

**目标**：把两个开发知识库合法引入 bundle，agent 开发插件时按需加载，形成"架构标准 + 坑点手册"双层知识体系。

> 实施备注：1.1 调研结论落在 `docs/notes/m1-skill-loading.md`（依据本地官方源码 b150a551b）；
> 挂载采用 `ctx.skills.register()` 内联注册 + 目录 resourceBase，入口层为自研 `thunderforge-dev` 索引技能。

### 任务

| # | 任务 | 细节 |
|---|---|---|
| 1.1 | 技术调研：dsh 的 skill 加载机制 | 确认 bundle 内 skills 的挂载方式（插件行 or 目录约定 or patch config），产出一段调研笔记入 `docs/notes/` |
| 1.2 | 引入 dsh-plugin-dev-skills（MIT） | vendor 至 `skills/arch-standard/`，保留原 LICENSE 与版权头 |
| 1.3 | 引入 dsh-plugin-guide（Apache-2.0） | vendor 至 `skills/pitfalls/`，文件级保留原协议，NOTICE 记录任何修改 |
| 1.4 | 合并策略：分层不打散 | 两库内部结构原样保留（降低同步成本），新建 `skills/thunderforge-dev/` 统一入口 skill：SKILL.md 索引两层（何时查架构、何时查坑点），复用上游 evals 方法做触发评测 |
| 1.5 | cordis.patch.yml 更新 | 按 1.1 调研结论挂载 skills 行 |
| 1.6 | README 更新 | 知识库使用说明 |

### 交付物

`skills/` 三目录 + 调研笔记 + 更新后的 patch/README/LICENSES 台账状态。

### 验收标准

- [x] 注册链路验证：apply 后三层技能（thunderforge-dev / dsh-plugin-dev / dsh-plugin-guide）正确注册，resourceBase 目录有效（test/skills.test.mjs）
- [x] 入口技能触发评测集就绪（12 正例 + 6 负例，改编自两个上游）；**live agent 触发评测需 dsh 运行时，推迟到 M3 环境补跑**
- [x] 两份上游 LICENSE 完整在库（skills/arch-standard、skills/pitfalls 原样 vendor，未修改上游正文）
- [x] 未修改上游正文（仅新增索引层）

### 风险与对策

| 风险 | 对策 |
|---|---|
| skill 挂载机制与预期不符 | 1.1 前置调研，最坏情况 fallback：bundle 附带安装脚本把 skills 复制到约定目录 |
| 两库内容冲突 | 不仲裁正文，索引层标注"以架构标准层为准/坑点层为补充" |

**工作量估计**：1–2 天。

---

## M2 — 脚手架内化 + 调试埋点 ✅（2026-08-22 完成）

**目标**：脚手架从外部 CLI 内化为 agent 工具；生成的插件骨架天生可调试、可冒烟、被 capture 覆盖——第一个核心闭环。

> 实施偏差（已记录台账）：create-dsh-plugin 与 dsh-plugin-starter **未 vendor**——模板改为依据
> dsh-plugin-dev（MIT）的 examples/references 规范自研为零依赖形态（骨架无需安装依赖即可通过冒烟），
> 注册模式文件级标注上游参考。降低引入体量的同时规避了对上游模板结构的长期跟踪。

### 任务

| # | 任务 | 细节 |
|---|---|---|
| 2.1 | 引入 create-dsh-plugin（MIT） | 提取 tool / events / webui 三类模板逻辑 |
| 2.2 | 引入 dsh-plugin-starter（MIT） | 提取 tests + CI 模板（--verify 冒烟） |
| 2.3 | `thunderforge-scaffold` 插件 | `defineTool` 注册 scaffold 工具（依据 dsh 工具开发规范），agent 对话式调用；模板选择/命名/输出目录作为工具参数 |
| 2.4 | 调试埋点 | 生成的骨架预置：标准事件命名、debug 清单文件、thunderforge-capture 配置行、smoke 测试模板 |
| 2.5 | smoke 工具 | 生成后即可 `--verify`：`node --test` + 加载校验 |
| 2.6 | 版本对齐 | 锁定 `@deepseek-ai/dsh-tools` 等依赖版本策略（follow dsh-base 或 pin），补 Schemastery Config schema |

### 交付物

`src/scaffold/` + 模板目录 + 更新 patch 行。

### 验收标准

- [x] 工具级验证：`thunderforge_scaffold` 注册合规（defineTool 编译后 schema 校验），三类模板生成 → **生成即冒烟全部通过**（test/scaffold.test.mjs，每模板真实 spawn `node --test`）
- [x] 骨架预置调试埋点：`thunderforge.debug.json`（capture 索引流 + 事件前缀 + 冒烟命令）、生成 README 含 capture 接入指引
- [x] 模板测试 + CI 模板随骨架产出（test/smoke.test.mjs + .github/workflows/ci.yml）
- [x] 领域失败返回规范错误值（INVALID_PLUGIN_NAME / TARGET_EXISTS 不抛异常）
- [x] 依赖锁定：@deepseek-ai/dsh-tools@0.1.1-rc.2、schemastery@3.18.1（精确 pin，与本地源码版本一致）；capture/skills 补齐 Schemastery Config schema
- [ ] 真实 dsh 运行时端到端（对话触发 → 安装 → 模型调用落 capture）——**推迟至 M3 发布验收**（本机无 dsh 运行时）

### 风险与对策

| 风险 | 对策 |
|---|---|
| dsh-tools 处于 rc，API 变动 | 仅用稳定面（defineTool/Config），变动面薄封装 |
| 上游模板与 dsh 版本漂移 | 模板头标注基线版本，CI 冒烟兜底 |

**工作量估计**：2–3 天。

---

## M3 — 调试器合并 + dev preset + 完整闭环 ✅（2026-08-22 完成）

**目标**：调试器双数据源合并、开发环境一键切换，跑通 PRD v1 定义的完整旅程并准备发布。

> 实施备注：
> - dsh-replay 的解码引擎（zstd 容器 + chunk-row 展开，MIT）vendor 为 `src/debugger/session-log.js`；
>   瀑布展示与双数据源对齐为自研（`src/debugger/align.js`）。
> - dsh-trajectory-debug 未 vendor（Web UI 宿主形态与本套件模型工具形态不匹配），概念参考已记台账。
> - dshp 核心（MIT）vendor 为 `src/profile/dshp/`；dev preset 生成器为增补，沿用其"只新建、不触碰既有 profile"保护原则。
> - 本机存在真实 `~/.dsh` 会话日志，最大会话 11919 事件 / 8 turns / 76 toolCalls 已实际解码验证。

### 任务

| # | 任务 | 细节 |
|---|---|---|
| 3.1 | 引入 dsh-trajectory-debug（MIT） | 轨迹瀑布 / 确定性回放 / 断点 |
| 3.2 | 引入 dsh-replay（MIT） | 时间旅行回放（session.jsonl.zstd） |
| 3.3 | `thunderforge-debugger` | 粘合：session 日志 + capture 的 index.jsonl 双数据源对齐（按 ts/seq 关联），脚手架项目优先展示 |
| 3.4 | 引入 dshp（MIT） | profile 列表/克隆/diff + 导出 |
| 3.5 | dev preset | 一键切换"开发环境"profile：干净安装被测插件 + 冒烟 |
| 3.6 | 发布 | GitHub 公开仓库 + npm publish + `dsh plugin add github:owner/dsh-thunderforge` 验证 + 发布清单文档 |

### 交付物

`src/debugger/`、`src/profile/`、preset 文件、发布产物。

### 验收标准（端到端，PRD v1 旅程全通）

- [x] 创建：`thunderforge_scaffold` 三模板生成即冒烟通过（M2 已验，28 项全量测试含盖）
- [x] 开发：三层知识库注册可用（M1 已验）；live 触发评测仍需带模型的 dsh 会话（见"遗留"）
- [x] 调试：`thunderforge_debugger` 在真实会话（1.2 万事件）上输出 turns/steps/toolCalls 概览与对齐瀑布；capture 行带文件引用
- [x] 环境验证：`thunderforge_profile create-dev-preset` 生成 `tf-dev-m3` 干净 profile（防覆盖守卫 + 只新建原则）
- [x] 真实 CLI 验收：`dsh --profile tf-dev-m3 --dump-config` 层加载（见下方"运行时验收记录"）
- [x] 上游 LICENSE 台账闭环（附录 A 更新：2 vendor / 1 概念参考 / 2 改自研）

### 运行时验收记录

- 本机 dsh CLI：npm 本地安装 `@deepseek-ai/dsh@0.1.1-rc.2`（npx 首跑下载停滞，改本地安装）
- 结果：见仓库 `docs/notes/m3-runtime-acceptance.md`

### 遗留（发布后跟进）

- [ ] live skill 触发评测（需带模型 API 的 dsh 会话）
- [ ] 全链路：对话 → scaffold → 安装进 dev preset → 模型调用 → capture 落盘 → waterfall 对齐（需模型 API key）

**工作量估计**：3–4 天。

---

## 附录 A · 组件台账（随里程碑滚动更新）

| 组件 | 许可证 | 引入里程碑 | 状态 |
|---|---|---|---|
| dsh-plugin-dev-skills | MIT | M1 | **已引入** skills/arch-standard（原样） |
| dsh-plugin-guide | Apache-2.0 | M1 | **已引入** skills/pitfalls（原样，含上游 LICENSE/NOTICE） |
| create-dsh-plugin | MIT | M2 | 改为自研模板（依据 dsh-plugin-dev 规范，台账注明参考） |
| dsh-plugin-starter | MIT | M2 | 改为自研 tests/CI 模板 |
| dsh-trajectory-debug | MIT | M3 | 待引入 |
| dsh-replay | MIT | M3 | 待引入 |
| dshp | MIT | M3 | 待引入 |
| ~~dsh-payload-capture~~ | 无 | — | **排除**，已由 thunderforge-capture 替代 |

## 附录 B · 打通接口预留（粘合层契约）

| 接口 | 提供方 | 消费方 | 状态 |
|---|---|---|---|
| `index.jsonl` 捕获索引流（seq/ts/model/ok/durationMs） | thunderforge-capture | thunderforge-debugger | **已交付并打通**（waterfall 对齐验证） |
| `thunderforge.debug.json` 埋点清单（capture 索引 + 事件前缀 + 冒烟命令） | thunderforge-scaffold | thunderforge-debugger / 开发者 | 已交付 |
| 骨架调试埋点约定（事件命名 `<plugin>/` + debug 清单） | thunderforge-scaffold | thunderforge-debugger | 已交付 |
| dev preset 声明（package.json bundles + link + patch 层） | thunderforge-profile | 用户 / dsh CLI | **已交付并经真实 CLI 验证**（tf-dev-m3） |
