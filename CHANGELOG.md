# Changelog

## 0.2.1 (2026-08-25)

- **六引擎行级配置正式化**：debugger/scaffold/release 新增 `apply(ctx, config)` 支持——`disabled`（整体不注册）、`waterfallLimit`（debugger 默认行数）、`verify`（scaffold 生成后冒烟默认值）；capture/skills 的既有配置键一并文档化。
- **新增 docs/CONFIGURATION.md**：全部配置键速查表 + `cordis.patch.yml` 覆盖方法（真机验证：重述整行 → dump-config 显示 "patched by" → config 注入 apply）+ 常见场景配方（只留 scaffold+debugger / 调试 capture 自身）。README 双语加链接。
- **CI 修复（三个环境依赖测试 bug，自 fddbdcb 起 ubuntu/windows 全矩阵挂红）**：browse/diff/summary 曾被排在会话解析之后——全新 runner 无 `~/.dsh/sessions` 时被 SESSION_NOT_FOUND 误杀；initConfig 测试用 `'X:/fake-home'` 在 POSIX 是相对路径；mcp.test 手写 file URL 转换吃掉 Linux 根斜杠。修复后 `DSH_HOME=<空目录>` 本地复现法纳入验证流程（空/满双环境 65→66/66）。

## 0.2.0 (2026-08-24)

- **第五知识层：发布清单技能（dsh-plugin-checklist）**——用户提到"发布/上架/分享插件"时触发，引导 agent 走 `thunderforge_release` 门禁流程并交接手动步骤；含翻车排查表（boot 报错/静默失效/publish 被拒）。evals train 12 / validation 6 按 agentskills.io 双集规范。LAYERS 现为五层。
- **debugger 三新 op**：`browse`（表格化浏览 capture 记录，支持 ok/provider 过滤与分页）；`diff`（对比两个 capture 载荷的叶子级差异——排查"升级后模型行为变了"）；summary 新增 **token 用量聚合 + 可选成本估算**（`price_usd_per_m` 提供才算钱，不内置会过时的单价表）。
- **自定义模板发现**：scaffold 的 `template` 参数现接受 `~/.dsh/thunderforge-templates/<name>/` 目录约定（文件集与内置模板同构），社区/私有骨架可插拔——放弃 git URL 直拉方案（供应链风险）。
- **examples/**：真实由 scaffold 生成的示例骨架（tool 模板），README 徽章补 Tests；README.en.md 全面同步中文版（六引擎/ROADMAP/状态段，此前滞后多个版本）。
- **ponytail 精简轮**：runSmoke 双胞胎合并（release 复用 scaffold 导出，净删 19 行）；mcp.mjs 死字段清理；test/ 目录专项审计报告（docs/notes/ponytail-test-audit.md，结论：明确性优先不去重）。
- **dsh-buddy v0.4.2**（独立仓 `62bc68d`）：画像持久化显式 opt-in 条款（沉默≠同意）；修复 0.4.1 tarball 缺 fallback 句的问题（同步方向事故复盘）。
- `node --test` 62/62。

## 0.1.10 (2026-08-24)

- **骨架 upgrade 器（R7）**：新增 `thunderforge_upgrade` 工具——对比存量骨架与最新模板（文件清单 / thunderforge.debug.json 埋点声明 / 工具契约自检），输出迁移建议清单，**只建议不代改**；scaffold 引擎现注册双工具。
- **llm-adapter 模板（R8）**：第四类模板——最小合规 LLM 适配器（两步协议 prepareCall → adapterCall.stream + providerInfo/retryPolicy 挂点 + 单步 stream 兜底），把 0.1.7 事故沉淀的真机协议知识直接产品化；生成即冒烟。
- **debugger 增量快照（R10）**：`op=watch` 按 `since_ts` 返回窗口内的新事件瀑布 + `next_since_ts` 轮询锚点——长任务调试不必等会话结束拉全量。
- **MCP 双端暴露（R9）**：新增 `mcp.mjs` 入口，手写 stdio JSON-RPC 子集（initialize/tools/list/tools/call）把 scaffold/upgrade/debugger/profile/release 五工具暴露给非 dsh 宿主（Claude Code 等）；零依赖红线守住（不用 MCP SDK），工具 schema 与引擎同源不漂移；集成测试走真实子进程全链路。
- **dsh-buddy 渐进式披露（R11）**：表达模式与装唐完整规程拆入 `references/patterns.md`（按需加载）；新增「画像摘要导出」条款（用户可查/纠/重置，不主动落盘）；buddy 独立仓库同步至 v0.4.0（`617daa1`）。
- `node --test` 56/56。

## 0.1.9 (2026-08-24)

- **新增契约自检库 `dsh-thunderforge/contract`（R6）**：`checkRawToolContract(def)` 把 ctx.tools.register 的真机硬性规则（output 必填、schema 类型白名单、'json' 糖拒绝、additionalProperties 开放性、DSL required 残留、未知关键字）固化为零依赖纯函数——违规以中文清单返回、每条带修法提示。用户的插件发布前一行代码自检，不必等真机 boot 爆雷；test/tool-contract.test.mjs 改为吃自己的狗粮（规则同源不漂移）；骨架 README 补自检指引。
- **新增第六引擎 thunderforge-release（R5 发布门禁）**：`thunderforge_release` 工具对插件目录执行四道自动检查（node --test 冒烟 / 动态加载+mock ctx 的工具契约 / 零 harness 依赖铁律含源码扫描 / 版本与 CHANGELOG 一致性），输出结构化报告与剩余手动步骤——npm publish 与 OTP 永远留给维护者本人。项目血泪（Symbol 双实例、raw 契约、版本记档）从此是用户的自动门禁。
- `node --test` 47/47。

## 0.1.8 (2026-08-24)

- **capture 默认目录改到 DSH 数据根**（行为变更）：无 `dir` 配置时从 `./.thunderforge-capture`（进程 cwd）改为 `$DSH_HOME/thunderforge-capture`（无 DSH_HOME 时 `~/.dsh/thunderforge-capture`），与 sessions/profiles 同级、符合用户心智——真机排查时维护者都找错了位置。检测到旧目录有历史数据时输出一次性迁移提示；debugger 默认 capture_dir 自动跟随。
- **capture 协议失效守卫（R1）**：新增 `staleWarnMs` 配置（默认 300000，0 关闭）——已包装适配器但超过该时长仍零捕获时输出显式警告「LLM 适配器协议可能已变更」。静默失效是 capture 最大敌人（v0.1.6 prepareCall 失配事故零报错），此后协议再变至少会叫。
- **skills preset 盲区警告（R3）**：agent preset 为 minimal（极简模式）时 dsh 不挂载 `skill` 工具、`<available_skills>` 不注入 system——四层知识库注册成功却永远无法触发且无任何报错。thunderforge-skills 现于 boot 后延迟探测 `skill` 工具可达性，不可达时显式警告并指引切换标准模式；thunderforge-dev SKILL.md 增加对应排障条目。
- **工程债清理（R4）**：① 消除 DEP0190（profile verify 的 spawn 在 Windows 改经 `cmd /d /s /c`，不再 shell:true + args）；② decodeSession 支持 Buffer 输入，新增多帧 zstd 容器解码与 torn tail 容忍测试（真实会话形态首次入测）；③ loadCaptureIndex 返回 `{ rows, corrupt }`，损坏索引行（append 中断的 torn write）不再静默丢失——summary 新增 `indexCorruptLines` 上报。
- **双协议覆盖防回归测试**：断言两步协议适配器必获 prepareCall 包装、单步 stream 适配器必获 stream 包装；真机形状 fixture（twoStepAdapter）固化 dsh-llm-pi-ai 接口面。`node --test` 43/43。

## 0.1.7 (2026-08-24)

- **修复 capture 在 dsh 0.1.1-rc.2 上完全失效（真 bug，web 会话复现）**：dsh 的 `LlmRuntime` 主调用路径是两步协议 `adapter.prepareCall(provider, model, signal)` → `adapterCall.stream(options)`，而 capture 的 `wrapAdapter` 只包装了单步 `adapter.stream()`——官方 `dsh-llm-deepseek` / `dsh-llm-pi-ai` 适配器都实现 `prepareCall`，注册进 LlmRuntime 后走的是 `prepareCall().stream()`，捕获流永远不被调用。后果：web 会话 4k+ chunk、13 次工具调用，`thunderforge-capture` 目录零落盘（插件激活、`registerAdapter` 包装均正常，仅协议钩错方法，mock 老协议测不出来）。修复：`wrapAdapter` 同时覆盖两步协议——`Object.create` 包一层 `prepareCall` 返回的 adapterCall 并重写其 `stream`（不改原对象，保留 `model` 等）；保留单步 `stream` 兼容。
- **补上集成测试盲区**：原 `test/capture.test.mjs` 只测 core 层（CaptureStore/聚合/清洗），未测 `apply`/`wrapAdapter` 集成。新增 4 项：两步协议落盘、两步协议 stream 抛错路径、单步 stream 协议兼容、provider 过滤透传。`node --test` 36/36。

## 0.1.6 (2026-08-23)

- **修复 raw 工具注册契约违规（真机报错驱动）**：0.1.5 去依赖化时对 raw 注册的 `output` 要求删过头/用错糖，真机 boot 报两类错——`must declare output { schema, render, presentationMeta? }`（scaffold 缺 output）与 `schema.type must be one of object/array/string/number/integer/boolean/null`（debugger/profile 用了 defineTool 专用的 `{type:'json'}`）。修复：三个工具 + tool 模板全部补齐合规 output；debugger/profile 的参数从 DSL 属性映射改为完整 object schema（含顶层 required、additionalProperties）
- **新增真机契约测试**（test/tool-contract.test.mjs）：把 dsh `ctx.tools.register` 的实际校验规则固化进测试——output 硬性要求、schema 类型白名单、未知关键字拒绝、DSL `required:true` 残留检测、对象节点开放性声明，并对模板生成的工具同样校验

## 0.1.5 (2026-08-23)

- **修复 Symbol 双实例崩溃（真 bug）**：曾把 `@deepseek-ai/dsh-tools`/`schemastery` 声明为普通 dependencies，装进 profile 后形成第二份模块实例——`TOOL_RUNTIME_SCHEDULER` 等内容寻址的 Symbol 在两份实例中不相等，导致 `ctx.tools[scheduler]` 为 undefined，多工具调用的 turn 以 `Cannot read properties of undefined (reading 'prepare')` 崩溃（web 实测复现）。修复：遵循树外插件零 harness 导入的生态惯例，全部工具改为原始 JSON Schema 注册（与脚手架模板一致），Config schema 移除（配置键与默认值保留于代码与文档），依赖降级为 optional peerDependencies（仅元数据）
- 副产品：dsh-thunderforge 回到**零运行时依赖**，tarball 不再携带任何 @deepseek-ai 包

## 0.1.4 (2026-08-23)

- **新口号**：励志做（字号小到免责）**0 元以内最 nb 的 DSH 插件\***（h1 全页最大）——注\* 为产品目标，非质量承诺，解释权归雷雨天气；ThunderForge 本名降级为 h3 陪衬
- README 修复：dsh-buddy 引用块移出引擎表格（此前表格渲染破碎）；中英双语同步

## 0.1.3 (2026-08-22)

- **修复 capture 层序盲区（真 bug）**：`llm-deepseek` 适配器行位于 dsh-base 层内部，thunderforge 排在其后时 capture 包装落空、静默不捕获。修复：dev preset 与文档改为将 `dsh-thunderforge` 置于 `dsh.profile.bundles` 最前（响应式注入恰好在适配器行之前挂上补丁）；README/入口技能加层序提示；capture 挂载时输出确认日志
- npm 元数据补全（repository/bugs/homepage）、本文件（CHANGELOG）建立、仓库 topics 设置
- **dsh-buddy 0.2.1**：装唐检测——自述水平与操作表现冲突时以行为为准，错位反复出现可温和拷问一次（"你是在装唐？"）
- 仓库工程：抗网络推送器 `scripts/github-push.mjs`（git 优先、API 降级、sha 增量复用、TLS 自重生、分歧保护）、一键发布 `scripts/release.mjs`、网络手册 `docs/NETWORK-NOTES.md`

## 0.1.2 (2026-08-22, git only — 未单独发布，变更并入 0.1.3)

- **dsh-buddy 0.2.1**：装唐检测——自述水平与操作表现冲突时以行为为准，错位反复出现可温和拷问一次（"你是在装唐？"），认了即按真实水平切换，不认则尊重用户节奏；单次错位仍按跨域新手处理
- 仓库工程：抗网络推送器 `scripts/github-push.mjs`（git 优先、API 降级、sha 增量复用、TLS 自重生、分歧保护）、一键发布 `scripts/release.mjs`、网络手册 `docs/NETWORK-NOTES.md`

## 0.1.1 (2026-08-22)

- 新增第四层技能 **dsh-buddy**（独立仓库 [oneinitAI/dsh-buddy](https://github.com/oneinitAI/dsh-buddy)）：用户画像自适应表达——实时构建熟练度/偏好/领域差异/状态画像，按画像现场生成解释；无预设话术；拿不准宁可略高估
- 双语 README 焕新（徽章/引擎矩阵/上游致谢与协议声明）、CI 工作流（Node 22/24 × Linux/Windows）

## 0.1.0 (2026-08-22)

首个发布，M0–M3 全量：

- **thunderforge-capture**：LLM 载荷捕获（清洁室实现，替代无许可上游组件）——透明代理包装 `registerAdapter`、双错误路径落盘、密钥掩码、轮转清理、`index.jsonl` 索引流
- **thunderforge-skills**：三层知识库（thunderforge-dev 入口索引 / dsh-plugin-dev 架构标准 / dsh-plugin-guide 坑点手册，后两者原样 vendor 并保留许可证）
- **thunderforge-scaffold**：对话式脚手架（tool/events/webui 三类零依赖模板，生成即冒烟，骨架带 thunderforge.debug.json 埋点与 CI）
- **thunderforge-debugger**：双数据源轨迹瀑布（会话日志解码 vendor 自 dsh-replay + capture 索引对齐）
- **thunderforge-profile**：profile 管理 + dev preset（核心 vendor 自 dshp，只新建不触碰既有环境）
- 真机验收：dsh 0.1.1-rc.2 CLI `plugin add` + `--dump-config` 全部加载通过
