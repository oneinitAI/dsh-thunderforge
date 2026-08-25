# ThunderForge 开发路线图（Roadmap）

> 改进与拓展候选的台账。每项写清**为什么值得做、做什么、验收标准**，动手前先读 [`DEVELOPMENT.md`](./DEVELOPMENT.md) §2 的架构约束（零 harness 导入 / 原始 JSON Schema / 层序 / 清洁室）。
>
> 来源标注：🔴 = 真机踩到的坑（2026-08-24 接手会话实证）；🔵 = 产品闭环缺口；🟢 = 拓展方向。
> 状态：`候选` → `进行中` → `完成`（完成后移入 CHANGELOG 并在此标记）。

## 优先级总览

| 批次 | 项 | 一句话 | 状态 |
|---|---|---|---|
| P0 | R1 capture 协议失效告警 + 真机形状 fixture | 静默失效是 capture 最大的敌人，这次差点又漏过去 | ✅ 完成（v0.1.8） |
| P0 | R2 capture 默认目录改 `~/.dsh` 下 | 维护者自己都找半天落盘位置，用户更会懵 | ✅ 完成（v0.1.8） |
| P0 | R3 skill 触发的 preset 盲区警告 | minimal preset 裁掉 skill 工具，用户不知道技能为何"不生效" | ✅ 完成（v0.1.8） |
| P0 | R4 工程债三件套 | DEP0190 / debugger 零测试覆盖 / capture index 损坏行 | ✅ 完成（v0.1.8） |
| P1 | R5 thunderforge_release 发布门禁 | "发布"环节目前是闭环里最空的一环 | ✅ 完成（v0.1.9） |
| P1 | R6 契约自测库导出 | 把 tool-contract 的血泪教训变成用户插件的一行断言 | ✅ 完成（v0.1.9） |
| P2 | R7 骨架 upgrade 器 | dsh 协议升级时用户插件怎么跟进 | ✅ 完成（v0.1.10） |
| P2 | R8 llm-adapter 模板 | evals 里出现过的真实查询场景，prepareCall 知识可直接沉淀 | ✅ 完成（v0.1.10） |
| P2 | R9 MCP 双端暴露 | 非 dsh 宿主也能用 scaffold/debugger | ✅ 完成（v0.1.10） |
| P2 | R10 debugger live watch | 调试长任务不必等会话结束 | ✅ 完成（v0.1.10） |
| P2 | R11 dsh-buddy 渐进式披露 | 主文件聚焦，案例库按需加载 | ✅ 完成（v0.1.10/v0.4.x） |
| 增补 | checklist 技能（工具+技能双形态闭环） | release 门禁技能化，触发式引导 | ✅ 完成（v0.2.0） |
| 增补 | debugger browse / diff / token 成本 | capture 数据的呈现与对比层 | ✅ 完成（v0.2.0） |
| 增补 | 自定义模板目录发现 | 社区/私有骨架可插拔（目录约定，拒 git 直拉） | ✅ 完成（v0.2.0） |
| 增补 | buddy 画像 opt-in 持久化 | 沉默≠同意的显式持久化条款 | ✅ 完成（buddy v0.4.2） |

---

## P0 —— 真机踩到的坑（2026-08-24 会话实证）

### R1 capture 协议失效告警 + 真机形状 fixture 🔴

**为什么**：v0.1.6 及之前的 capture 只包装单步 `adapter.stream()`，而 dsh `LlmRuntime` 的主调用路径是两步协议 `adapter.prepareCall() → adapterCall.stream()`——捕获静默落空，web 会话上万 chunk 零落盘。v0.1.7 已修复并做了能力探测（有 prepareCall 用新协议、stream 兜底），但**下次 dsh 再改协议时同样会静默断裂**，且 mock 测试测不出来（假 adapter 也是按旧协议写的）。静默失效是这个组件最大的敌人。

**做什么**：
1. **运行时零捕获告警**：capture 记录"已包装的注册数"与"实际捕获次数"；当存在已包装适配器且宿主发生 LLM 流量但捕获计数为零时（可通过 dispose/周期检查），输出显式警告：`capture: 包装了 N 个适配器但从未捕获到载荷——LLM 适配器协议可能已变更，请核对本插件与 dsh 版本的兼容性`。判定"宿主发生 LLM 流量"不引入新依赖的前提下可近似：由 debugger 或后续版本提供交叉信号，先做"包装数 > 0 且整个进程生命周期捕获数为 0 且进程运行超过阈值"的保守告警。
2. **真机形状 fixture**：从 `@deepseek-ai/dsh-llm-pi-ai` 的真实适配器形状固化测试 fixture（两步协议：`prepareCall(provider, model, signal) → { model, stream }`），替代自造的单步假 adapter；协议再变时测试先红。

**验收**：人为把 wrapAdapter 改回只包 stream，测试能在 CI 里红（而不是等真机抓）；正常路径下告警不误报。

### R2 capture 默认目录改到 `~/.dsh/thunderforge-capture` 🔴

**为什么**：DSH_HOME 未设置时默认落盘 `cwd/.thunderforge-capture`——2026-08-24 会话里维护者排查"为什么没落盘"花了大量轮次，最后发现数据一直躺在 web 进程 cwd（`C:\Users\zzz\.thunderforge-capture`）。用户心智里 DSH 数据都在 `~/.dsh`（sessions、profiles、credentials 都在那），capture 是唯一例外。

**做什么**：`core.js DEFAULTS.dir` 的 fallback 从 `process.cwd()/.thunderforge-capture` 改为 `dshHome()/thunderforge-capture`（复用 `src/profile/dshp/profile.js` 的 `dshHome()`，注意 capture 不应为此 import profile 模块——把 `dshHome()` 三行逻辑内联或抽到共享 util）。旧位置若有历史数据，首次启动时输出一次性迁移提示。

**验收**：无 DSH_HOME 时默认落 `~/.dsh/thunderforge-capture`；debugger 的 `initConfig({}).dir` 与之自动一致；CHANGELOG 标注行为变更。

### R3 skill 触发的 preset 盲区警告 🔴

**为什么**：agent preset 为 minimal（极简模式）时，`skill` 工具被整体裁剪、`<available_skills>` 目录不注入——ThunderForge 四层知识库完全不可达，且**无任何报错**。live 评测时靠对比两个会话才发现。用户视角就是"装了技能没效果"，无从排障。

**做什么**：
1. thunderforge-skills 注册后探测 skill 工具是否可达（`ctx.tools.get('skill')` 之类的能力探测，具体 API 以 dsh-tool-skill 实现为准），不可达时输出警告：`thunderforge-skills: 当前 agent preset 未包含 Skills 能力（如 minimal 极简模式），四层知识库不会被模型触发；请切换标准模式或含 Skills 的 preset`。
2. thunderforge-dev SKILL.md 加一条排障条目：「技能不生效？先确认 agent preset 含 Skills（minimal 极简模式裁剪了 skill 工具）」。

**验收**：minimal preset 会话 boot 时日志出现该警告；standard 会话不出现。

### R4 工程债三件套 🔴

**为什么**：都是本次会话顺手发现的真实瑕疵，成本低。

**做什么**：
1. DEP0190：`test/profile.test.mjs` 触发的 child_process `shell:true` 传参弃用警告——改为数组参数形式或显式 windowsVerbatimArguments。
2. debugger 回归测试固化：`align.js`（buildTimeline/captureRows/summarize）与 `session-log.js`（decodeSession/reconstruct）目前零覆盖，本次 waterfall 是拿真机数据人肉验证的——把那次验证固化为 fixture 测试（脱敏后的会话样本 + capture index 样本 → 断言对齐结果）。
3. capture index 损坏行处理：index.jsonl 曾出现一行解析失败被 loadCaptureIndex 静默跳过（append 中断的 torn write）——loadCaptureIndex 对解析失败行计数并在 summary 里报告 `indexCorruptLines`，必要时截断恢复。

**验收**：全量测试绿且新增覆盖；`node --test` 输出无 DEP0190。

---

## P1 —— 产品闭环缺口

### R5 thunderforge_release 发布门禁 🔵

**为什么**：产品叙事是「创建→开发→调试→环境验证→**发布**」，但最后一环没有任何工具辅助——我们自己发布 0.1.7/dsh-buddy 时全靠手工步骤和记忆。项目最值钱的资产是真 bug 血泪（Symbol 双实例、raw 注册契约、层序盲区、prepareCall 协议），它们应该变成用户的自动门禁而不是文档里的故事。

**做什么**：新模型工具 `thunderforge_release`，对指定插件目录执行：
1. `node --test` 冒烟
2. **契约校验**（复用 R6 的断言库）：扫描插件注册的工具定义是否符合 raw JSON Schema 真机契约
3. `--dump-config` 启动验证（经 thunderforge_profile verify）
4. 零依赖铁律检查：源码 grep `@deepseek-ai/` 导入（dependencies 里出现即红）
5. 版本一致性：package.json version vs CHANGELOG 最新条目
6. 输出发布前检查清单（npm 登录态、OTP 提示），不代做 publish

**验收**：对 ThunderForge 自身跑一遍全绿；对一个故意埋了契约违规的工具定义的样例插件能逐项报红。

### R6 契约自测库导出 🔵

**为什么**：`test/tool-contract.test.mjs` 只保护 ThunderForge 自己。用户的插件工具不符合真机契约时（缺 output、`'json'` 糖、DSL `required:true` 残留），要等到真机 boot 才爆——而这些都是我们付过学费的规则。

**做什么**：从 bundle 导出子路径 `dsh-thunderforge/contract`（纯函数、零依赖）：`assertRawToolContract(def)` 返回违规列表（中文、带修法提示）。scaffold 生成的骨架测试直接引用它，形成「生成即合规」；文档同步到 arch-standard 技能 references/tools.md 的对应小节。

**验收**：tool-contract.test.mjs 改为调用该库自身（吃自己的狗粮）；骨架生成的模板工具过断言零违规。

---

## P2 —— 拓展方向

### R7 骨架 upgrade 器 🟢

**为什么**：dsh 协议演进（如 prepareCall 两步化）会让存量用户插件过时。HANDOFF 开发路线候选已列。

**做什么**：`thunderforge_upgrade` 工具：对比目标插件与最新骨架模板的结构差异（diff 关键文件），输出迁移建议清单；只建议不代改（清洁室与用户代码边界）。

### R8 llm-adapter 模板 🟢

**为什么**：三类模板（tool/events/webui）不覆盖「接入新的 LLM 提供方」——这是 thunderforge-dev evals 里出现过的真实正例场景（"我想接一个新的 LLM 提供方，怎么注册适配器"）。本次深挖 prepareCall 协议积累的知识（registerAdapter 契约、providerInfo/providerRetryPolicy/resolveModel 接口面、两步流协议）可以直接沉淀为第四类模板。

**做什么**：`templates.js` 新增 `llm-adapter` 模板：最小合规适配器（含 prepareCall 两步协议 + providerInfo 元数据 + 重试策略挂点）+ 对应冒烟测试 + capture 接入说明。

**验收**：生成即冒烟；在 tf-dev-* preset 里 `dsh plugin add` 后 dump-config 无报错；能被 LlmRuntime 选中并完成一次真实流式调用。

### R9 MCP 双端暴露 🟢

**为什么**：扩大受众——非 dsh 宿主（Claude Code 等）无法使用 scaffold/debugger/profile。HANDOFF 路线候选已列。

**做什么**：可选入口把四个模型工具包装成 MCP server（stdio），工具定义同源（单一事实，避免双份 schema 漂移）。注意保持零依赖红线：MCP 协议层若需依赖需谨慎评估（或手写 stdio JSON-RPC 子集）。

### R10 debugger live watch 🟢

**为什么**：waterfall 目前只能事后分析；调试长任务（如本次 13 分钟的 turn）时要等结束才能看轨迹。

**做什么**：`op=watch`：tail `index.jsonl` + 最新会话文件增量解码，按秒刷新渲染瀑布尾部 N 行。实现上注意 Windows 文件 tail 的轮询间隔与 zstd 帧边界（复用 session-log 的 torn-tail 容忍逻辑）。

### R11 dsh-buddy 渐进式披露 🟢

**为什么**：dsh-buddy 目前是单文件技能，随画像维度增多会膨胀；agentskills.io 规范推荐主文件 <500 行、细节放 references/ 按需加载。

**做什么**：
1. 把「降档/升档的表达模式」「装唐检测案例」拆入 `references/`，主 SKILL.md 只留决策表与红线。
2. **跨会话画像持久化暂缓**（隐私边界），折中做「会话内画像摘要导出」：一个轻量约定（如 `/buddy-profile` 用户指令），agent 输出当前画像快照供用户查看/纠正/删除——把"被算法默默评估"变成透明可控。

**验收**：dsh-buddy 独立仓库与 vendor 双向同步流程照旧（sync 脚本或手工对拍）；evals 触发率不回退。

---

## 背景依据（2026-08-24 接手会话的关键事实）

本路线的 P0 项全部源自当天真机会话的实证，记录关键事实防止将来被质疑：

1. **prepareCall 两步协议**：dsh 0.1.1-rc.2 的 `LlmRuntime.adapterStream` 走 `adapter.prepareCall(provider, model, signal)` 取 `{ model, stream }` 再 dispatch；官方 deepseek/pi-ai 适配器均实现该接口。v0.1.6 及以前只包 `stream()` 故捕获落空（web 会话 12k+ chunk 零落盘），v0.1.7 修复。
2. **capture 落盘位置**：DSH_HOME 未设置时默认 `cwd/.thunderforge-capture`，web 进程 cwd ≠ 用户预期位置，排查成本高。
3. **preset 裁剪 Skills**：minimal preset 仅 bash+str_replace_editor，`skill` 工具不在 tools 列表、`<available_skills>` 不注入 system；live 评测必须在标准模式会话跑。
4. **live 评测基线**：train 6/6（正例点名/隐式/英文/事件系统全触发，负例干净忽略）、validation 4/4（近邻负例未加载技能但有一次 ask_user_question 澄清——边界摇摆非误触发，不改 description）。
