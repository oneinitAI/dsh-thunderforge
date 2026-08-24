# Changelog

## 0.1.8 (2026-08-24)

- **capture 默认目录改到 DSH 数据根**（行为变更）：无 `dir` 配置时从 `./.thunderforge-capture`（进程 cwd）改为 `$DSH_HOME/thunderforge-capture`（无 DSH_HOME 时 `~/.dsh/thunderforge-capture`），与 sessions/profiles 同级、符合用户心智——真机排查时维护者都找错了位置。检测到旧目录有历史数据时输出一次性迁移提示；debugger 默认 capture_dir 自动跟随。
- **capture 协议失效守卫（R1）**：新增 `staleWarnMs` 配置（默认 300000，0 关闭）——已包装适配器但超过该时长仍零捕获时输出显式警告「LLM 适配器协议可能已变更」。静默失效是 capture 最大敌人（v0.1.6 prepareCall 失配事故零报错），此后协议再变至少会叫。
- **双协议覆盖防回归测试**：断言两步协议适配器必获 prepareCall 包装、单步 stream 适配器必获 stream 包装；真机形状 fixture（twoStepAdapter）固化 dsh-llm-pi-ai 接口面。`node --test` 40/40。

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
