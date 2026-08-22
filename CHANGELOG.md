# Changelog

## 0.1.2 (2026-08-22)

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
