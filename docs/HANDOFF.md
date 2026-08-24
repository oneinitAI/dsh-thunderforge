# ThunderForge 项目交接文档

> 给接手维护/贡献者的交接手册。15 分钟内读懂项目全貌。当前最后提交：见 `git log -1`。

---

## 一、项目速览

| 项 | 值 |
|---|---|
| 仓库 | [github.com/oneinitAI/dsh-thunderforge](https://github.com/oneinitAI/dsh-thunderforge) |
| npm | [npmjs.com/package/dsh-thunderforge](https://www.npmjs.com/package/dsh-thunderforge) |
| 独立子项目 | [oneinitAI/dsh-buddy](https://github.com/oneinitAI/dsh-buddy)（画像自适应技能，MIT 同作者） |
| 协议 | MIT |
| 形态 | DSH 单一 Bundle（`dsh plugin add dsh-thunderforge`） |
| Node 要求 | ≥ 22.19 |
| 测试 | `node --test` 全量 ≥31 项（零框架依赖） |
| 依赖 | **零运行时依赖**（optional peerDeps 仅为元数据） |

## 二、产品定位

ThunderForge 是 DeepSeek Harness（DSH）的**一站式插件开发套件**——用户 `dsh plugin add` 一次装好 5 个插件 + 4 层知识库。

**五个插件引擎**：

| 引擎 | 路径 | 一句话 |
|---|---|---|
| thunderforge-capture | `src/capture/` | LLM 载荷透明捕获（清洁室自研，替代无许可上游组件） |
| thunderforge-skills | `src/skills/` + `skills/` | 四层知识库注册（入口/架构标准/坑点手册/画像自适应） |
| thunderforge-scaffold | `src/scaffold/` | 对话式脚手架（三类零依赖模板，生成即冒烟） |
| thunderforge-debugger | `src/debugger/` | 双数据源轨迹瀑布（会话日志 × capture 索引对齐） |
| thunderforge-profile | `src/profile/` | profile 管理 + 一键 dev preset |

## 三、关键架构约束（接手第一天的必读）

### 3.1 零 harness 导入铁律

**绝对禁止** `import ... from '@deepseek-ai/...'`（受控文件 `src/capture/` `src/scaffold/` `src/debugger/` `src/profile/` `src/skills/index.js` `src/debugger/align.js` `src/scaffold/templates.js`——有契约测试兜底）。

**踩过的血泪**：曾把 `dsh-tools` 声明为普通依赖 → pnpm 在 profile 里装了第二份副本 → `Symbol()` 内容寻址的 `TOOL_RUNTIME_SCHEDULER` 在两份副本中不相等 → `ctx.tools[scheduler]` 返回 `undefined` → 多工具并发 turn 以 `Cannot read properties of undefined (reading 'prepare')` 崩溃（web 实测复现，CHANGELOG 0.1.5 录入完整因果）。

### 3.2 原始 JSON Schema 工具注册

不能用 `defineTool`（那是 dsh-tools 的导出）。必须用 **原始 JSON Schema 注册**且满足真实 `ctx.tools.register` 检验：

- **`output` 声明是硬性要求**（缺了直接 TypeError）
- `output.schema.type` 不能是 `'json'`（defineTool 专用糖，raw 不认）
- 显式 object 节点必须声明 `additionalProperties: boolean`
- 属性内不要有 DSL 风格 `required: true`（未知关键字会被拒）
- 必填字段放顶层 `required: [...]` 数组

### 3.3 capture 层序

`llm-deepseek` 适配器在 `@deepseek-ai/dsh-base` 层**内部**。thunderforge 必须排在 `dsh.profile.bundles` **最前**——响应式注入让 capture 恰好在 llm 服务出现后、适配器行之前挂上补丁。排在 base 之后 = 适配器已注册 = 包装落空 = capture 静默失效（llm 服务无公开枚举手段）。

### 3.4 清洁室与 vendor 规则

- `src/capture/` 清洁室自研，仅依据官方 LLM 适配器协议编写
- vendor 文件（`src/debugger/session-log.js`←dsh-replay, `src/profile/dshp/`←dshp, `skills/arch-standard/`←dsh-plugin-dev-skills, `skills/pitfalls/`←dsh-plugin-guide, `skills/dsh-buddy/`←oneinitAI/dsh-buddy）**仅文件头前置来源声明，未修改实现**
- **红线**：不引入/不参照无许可证代码
- 所有上游协议原文进入 `LICENSES/` 台账

## 四、日常开发流程

```bash
# 1. 改代码——遵守 §3 约束
# 2. 跑测试
node --test                     # 全量
node --test test/<模块>.test.mjs # 单模块

# 3. 真机把关（mock 测不出的错真机一票否决）
dsh --profile <某profile> --dump-config   # 层加载无报错

# 4. 提交
git add -A && git commit -m "type(scope): 描述"

# 5. 推送
git push                          # 网络正常
node scripts/github-push.mjs --trust-remote  # github.com:443 被掐时
```

## 五、发布流程

```bash
node scripts/release.mjs patch          # 一键：测试→bump→npm→推送→验证
node scripts/release.mjs patch --dry-run # 只看计划
```

注意：
- npm 有 2FA（OTP 验证），脚本检测登录态，发布失败时提示剩余手动步骤
- npm 未登录时脚本不阻塞，完成 bump/commit/push 后明确列出缺失命令
- 发布完需要维护者手动 npm publish；然后更新 CHANGELOG 记档
- Windows 下脚本内部走 `npm.cmd` 经 shell 解析

## 六、文档索引

| 文档 | 面向 |
|---|---|
| `README.md` / `README.en.md` | 用户（双语文案含梗） |
| `docs/DEVELOPMENT.md` | 贡献者（架构/契约/技能写作规范） |
| `docs/PRD.md` | 产品（分阶段计划与验收） |
| `docs/RELEASE.md` | 发布清单与验证 |
| `docs/NETWORK-NOTES.md` | 网络排障手册 |
| `docs/HANDOFF.md`（本文件） | 交接 |
| `CHANGELOG.md` | 版本历史（含每次真 bug 的因果记录） |

## 七、子项目与上游关系

| 项 | 仓库 | 关系 |
|---|---|---|
| dsh-buddy | [oneinitAI/dsh-buddy](https://github.com/oneinitAI/dsh-buddy) | 同一作者，独立 bundle，MIT；ThunderForge vendor 其 `skills/dsh-buddy/` |
| dsh-plugin-dev-skills | [zimodzh/dsh-plugin-dev-skills](https://github.com/zimodzh/dsh-plugin-dev-skills) | MIT，原样 vendor→`skills/arch-standard/` |
| dsh-plugin-guide | [PerryLink/dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | Apache-2.0，原样 vendor→`skills/pitfalls/`（含 NOTICE） |
| dsh-replay | [zoahdev/dsh-replay](https://github.com/zoahdev/dsh-replay) | MIT，引擎文件 vendor→`src/debugger/session-log.js` |
| dshp | [asdf17128/dshp](https://github.com/asdf17128/dshp) | MIT，核心 vendor→`src/profile/dshp/` |

## 八、工具服务状态

| 工具 | 用途 | 可用 |
|---|---|---|
| `node scripts/release.mjs` | 一键发布 | ✅（Windows npm.cmd 问题已修） |
| `node scripts/github-push.mjs` | 抗网络推送 | ✅（443 降级 + reflog 血统校验） |
| `node scripts/smoke-capture.mjs` | capture e2e 冒烟 | ✅ |

## 九、环境依赖

- **dsh CLI**：全局 `npm i -g @deepseek-ai/dsh@0.1.1-rc.2`
- **gh CLI**（推送网络）：`gh auth token`
- **npm 登录态**（发布）：`npm whoami`
- **本项目**：零其他依赖——`node --test` 即可，不需 `npm i`

## 十、遗留任务（按优先级）

| # | 任务 | 阻塞 |
|---|---|---|
| 1 | web profile 重启 + 多工具对话复测（验证 0.1.6 契约修复 + capture 落盘） | 需用户手动 dsh web 启动 |
| 2 | npm publish 0.1.6 | 需用户 npm OTP |
| 3 | live skill 触发评测（train + validation 按 agentskills.io 方法跑） | 需带模型 API 的 dsh 会话 |
| 4 | 全链路 e2e（对话→scaffold→capture→waterfall） | 同 3 |
| 5 | dsh-buddy 独立仓库同步 + npm 发布 | 按 ThunderForge 发布流程 |
| 6 | awesome-deepseek-harness PR #456 等待合并 | 等维护者审 |

## 十一、外部提交记录

- awesome-deepseek-harness: [PR #456](https://github.com/0xsline/awesome-deepseek-harness/pull/456)
- npm: `dsh-thunderforge@0.1.3`（latest），`0.1.6` 待发布

## 十二、项目统计

| 指标 | 值 |
|---|---|
| 源文件（受控） | 11（`src/` 下 JS） |
| 测试文件 | 7（含契约测试） |
| skill 目录 | 4 |
| `node --test` 项数 | ≥31 |
| vendor 上游 | 5（一个 Apache-2.0，四个 MIT） |
| CI 矩阵 | Node 22/24 × Linux/Windows |
| 踩过的真 bug 并记入 CHANGELOG | 4（Symbol 双实例、raw 注册契约、层序盲区、patch YAML 顶层数组） |