# ThunderForge 开发文档

> 给开发者（维护者/贡献者）的第一天读物。讲清**为什么这么设计**、**怎么改、怎么验、怎么发**、**哪些红线不能碰**。
> 用户向说明见 [`README.md`](../README.md)；分阶段计划见 [`PRD.md`](./PRD.md)；发布清单见 [`RELEASE.md`](./RELEASE.md)；网络坑手册见 [`NETWORK-NOTES.md`](./NETWORK-NOTES.md)。

## 1. 项目是什么

ThunderForge（`dsh-thunderforge`）是 DeepSeek Harness（DSH）的**一站式插件开发套件**，形态是**单一 bundle**：`dsh plugin add` 一次，获得「创建 → 开发 → 调试 → 环境验证」的完整闭环。包含五个插件 + 四层知识库：

| 模块 | 路径 | 职责 |
|---|---|---|
| thunderforge-capture | `src/capture/` | LLM 载荷捕获（清洁室实现） |
| thunderforge-skills | `src/skills/` + `skills/` | 四层知识库注册与内容 |
| thunderforge-scaffold | `src/scaffold/` | 对话式脚手架生成器 |
| thunderforge-debugger | `src/debugger/` | 双数据源轨迹瀑布 |
| thunderforge-profile | `src/profile/` | profile 管理 + dev preset |

## 2. 关键架构决策（改代码前必读）

### 2.1 单一 bundle，插件按子路径引用

`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，patch 里按包名子路径引用插件行：

```yaml
- insert:
    - id: thunderforge-capture
      name: dsh-thunderforge/capture
```

新增插件 = 新增 `src/<模块>/index.js` + 在 `cordis.patch.yml` 加一行 + `package.json` exports 加子路径。

### 2.2 零 harness 运行时依赖（铁律）

**规则**：禁止 `import ... from '@deepseek-ai/...'`（`src/` 下受控文件零导入）。这是踩过真崩溃换来的：

- 曾把 `@deepseek-ai/dsh-tools` 声明为普通依赖 → pnpm 往 profile 装了第二份副本
- `TOOL_RUNTIME_SCHEDULER` 是 `Symbol()`（内容寻址，每次模块加载新建）→ 两份副本符号不等 → `ctx.tools[scheduler]` 为 undefined → 多工具并发调用 turn 崩溃（`Cannot read properties of undefined (reading 'prepare')`）
- 修复：所有 util 自己实现；`dsh-tools`/`schemastery` 降为 optional peerDependencies（纯元数据）

**推论**：工具注册不能用 `defineTool`（那是 `dsh-tools` 的导出），必须用**原始 JSON Schema 注册**：

```js
ctx.tools.register({
  name: 'my_tool',
  description: '...',
  parameters: { type: 'object', properties: {...}, required: [...], additionalProperties: false },
  output: { schema: { type: 'object', additionalProperties: true }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
  async execute(args) { ... },  // 需自行校验输入
})
```

**真机契约**（`ctx.tools.register` 实际校验，见 `test/tool-contract.test.mjs`）：

- **`output` 必须声明** `{ schema, render }`（缺了直接 TypeError）
- `schema.type` 只能取 `object/array/string/number/integer/boolean/null`——**`'json'` 是 defineTool 专用糖，raw 不认**
- 显式对象节点必须声明 `additionalProperties: boolean`
- schema 里**不要出现 DSL 风格的 `required: true` 属性键**（未知关键字会被拒，必填用顶层 `required: [...]` 数组）
- `parameters` 建议是完整 object schema（执行期校验安全）

### 2.3 层序策略（capture 生效的关键）

`llm-deepseek` 适配器行在 `@deepseek-ai/dsh-base` **层内部**。capture 靠包装 `llm.registerAdapter` 工作，若 thunderforge 排在 base **之后**，适配器早已注册、包装落空（llm 服务无公开枚举手段，迟到无法补救）。

**规则**：`dsh-thunderforge` 必须位于 profile `dsh.profile.bundles` **数组最前**（先于 `@deepseek-ai/dsh-base`）。响应式注入会让 capture 恰好在 llm 服务出现后、适配器行之前挂上补丁。

- `thunderforge_profile create-dev-preset` 生成时已自动排好
- 装进既有 profile 需手动把 bundle 挪到最前（README 有提示）

### 2.4 清洁室与 vendor 原则

- `src/capture/` 是**清洁室实现**：只依据官方 LLM 适配器协议编写，未使用无许可证上游 `dsh-payload-capture` 的任何代码（该组件被明确排除，见 `LICENSES/README.md`）
- vendor 引入（`src/debugger/session-log.js` 来自 dsh-replay、`src/profile/dshp/` 来自 dshp、`skills/arch-standard`、`skills/pitfalls`、`skills/dsh-buddy`）：**未修改实现，仅文件头前置来源声明**；许可证原文进 `LICENSES/`
- **红线**：不引入/不参照无许可证（All Rights Reserved）的代码

## 3. 本地开发环境

```bash
node >= 22.19          # node -v 验证
# dsh CLI（验证 profile 层加载用）：
#   推荐全局安装：npm i -g @deepseek-ai/dsh@0.1.1-rc.2
#   或复用现有：$USERPROFILE/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js
```

项目自身**零安装依赖**（`node --test` 即可跑测试，无需 `npm i`——这是零依赖设计的红利）。

## 4. 代码地图

```
src/
├── capture/
│   ├── core.js        # 清洗/聚合/存储/轮转纯逻辑（零依赖，可单测）
│   └── index.js       # 插件入口：包装 llm.registerAdapter（透明代理 + dispose 还原）
├── skills/
│   └── index.js       # 注册四层技能（ctx.skills.register + 目录 resourceBase）
├── scaffold/
│   ├── templates.js   # 三类骨架模板（tool/events/webui）+ 埋点清单
│   └── index.js       # thunderforge_scaffold 工具：生成 → 落盘 → 冒烟
├── debugger/
│   ├── session-log.js # vendor: dsh-replay 引擎（zstd 容器 + chunk-row 解码）
│   ├── align.js       # 双数据源对齐（session 事件 × capture index.jsonl）
│   └── index.js       # thunderforge_debugger 工具（sessions/summary/waterfall）
└── profile/
    ├── dshp/          # vendor: dshp（profile 读写 + 可移植序列化）
    └── index.js       # thunderforge_profile 工具（list/export/create-dev-preset/verify）

skills/                  # 四层知识库内容
├── thunderforge-dev/    # 入口索引（自研）
├── arch-standard/       # vendor: dsh-plugin-dev-skills（MIT）
├── pitfalls/            # vendor: dsh-plugin-guide（Apache-2.0）
└── dsh-buddy/           # vendor: oneinitAI/dsh-buddy（MIT，同作者仓库）

scripts/
├── github-push.mjs      # 抗网络推送（git 优先 + API 降级 + 血统校验）
├── release.mjs          # 一键发布（bump→测试→npm→推送→registry 验证）
└── smoke-capture.mjs    # capture 端到端冒烟（假适配器全链路）

test/                    # node --test（node:test，无框架）
├── capture.test.mjs     # 清洗/聚合/存储/轮转
├── skills.test.mjs      # 技能注册/开关/词典与画像条款
├── scaffold.test.mjs    # 三模板生成即冒烟 + 错误值
├── debugger.test.mjs    # 双源对齐 + 真实会话验证
├── profile.test.mjs     # preset 生成/防覆盖/patch 数组契约
└── tool-contract.test.mjs  # 真机工具注册契约（必读 §2.2）

docs/                    # PRD / RELEASE / NETWORK-NOTES / DEVELOPMENT / notes/
```

## 5. 开发流程

```bash
# 1. 改代码。遵循 §2 的决策（零依赖、原始 JSON Schema、层序、合规）
# 2. 跑测试
node --test                     # 全量（当前 31 项）
node --test test/<模块>.test.mjs # 单模块

# 3. 真机验证（mock 测不出的错必须真机把关）
dsh --profile <某profile> --dump-config   # 层加载 + 无 boot 报错
#   新增/改动工具时先过一遍 test/tool-contract.test.mjs 的规则

# 4. 提交（遵循仓库内的 Conventional Commits 风格，中文 message 亦可）
git add -A && git commit -m "feat(xxx): 描述"

# 5. 推送
git push                          # 网络正常时
node scripts/github-push.mjs --trust-remote   # 443 被掐 / 历史形状差异时
```

## 6. 测试哲学

- **mock 单测负责逻辑**：清洗规则、聚合、轮转、错误路径、模板内容
- **契约测试负责真机规则**：`tool-contract.test.mjs` 把 `ctx.tools.register` 的真实校验固化成断言——mock 测不出"register 拒绝什么"，契约测能
- **冒烟负责全链路**：`smoke-capture.mjs` 用假适配器驱动完整 注册→流→落盘→dispose 链路
- **真机 boot 是最后一道门**：`--dump-config` 无报错 + 层加载齐全。历史上最贵的两个坑（Symbol 双实例、raw 注册契约）都是真机先抓出来的——**不信 mock，只信真机**

## 7. 发布流程

```bash
node scripts/release.mjs patch          # 一键：测试→bump→npm→推送→registry 验证
node scripts/release.mjs patch --dry-run # 只看计划
```

注意：

- npm 有 2FA：`npm publish` 需 OTP，脚本自动检测登录态，未登录/OTP 时明确提示剩余手动步骤
- Windows 下脚本内部用 `npm.cmd` 经 shell 解析（曾踩 spawn ENOENT）
- 发布后用户侧：`dsh plugin --profile <名> update dsh-thunderforge` + 重启对应应用
- CHANGELOG.md 每个版本都要记（含"git only 未单独发布"的版本，注明并入下一版）

## 8. 网络与推送

详见 [`NETWORK-NOTES.md`](./NETWORK-NOTES.md)。要点：

- `github.com:443` 被掐但 `api.github.com` 通 → `node scripts/github-push.mjs` 自动降级 API 通道（单提交、blob sha 复用、删除同步）
- API 推送后本地/远端历史形状可能不同（内容一致）→ 网络恢复后 `git fetch origin && git reset origin/main`
- `--trust-remote`：远端提交不在本地历史时做血统校验（tree sha 是否在 reflog 中）；`--allow-divergent`：已人工验证时显式跳过
- Node fetch 遇本地代理 TLS 拦截 → 自动带 `--use-system-ca` 重启自身

## 9. 技能写作规范（Skill Authoring）

**权威依据**：Agent Skills 官方规范与官方指南：
- [Specification](https://agentskills.io/specification)（frontmatter 字段、命名规则、渐进式披露）
- [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)（触发评测方法论）

本项目的两个自研技能（`skills/thunderforge-dev`、`skills/dsh-buddy`，独立仓库 dsh-buddy 同源）按此规范重写（v0.3.0）。**新技能必须遵守以下规则**：

### 9.1 frontmatter 规范

- `name`：kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`），≤64 字符，与目录同名，禁止大写/连字符结尾/连续连字符
- `description`：** imperative 动词开头**（"Use when..."），同时写清「做什么 + 何时用 + 何时不用（边界）」，≤1024 字符，**单行**（本项目 frontmatter 解析器按单行读取）
- 触发优化三原则（官方指南）：**以用户意图为中心**（不是内部机制）、**宁可偏 pushy**（显式列出隐式触发场景——用户没点名的也算）、**边界写清**（"Not for..." 防误触发）
- `metadata`：author/version 必填，可加 sources 记录方法论出处

### 9.2 正文与渐进式披露

- 主 `SKILL.md` 目标 **< 500 行**；详细资料（API 参考、完整规则集）放 `references/` 按需加载——模型只在需要时拉取
- 正文结构建议：任务触发后第一件事 = 决策表/判断流程（本项目都是「索引型」技能，先决定查哪一层）
- `evals/trigger-queries.json` 强制存在：约 20 条查询，**正例覆盖直接点名/隐式描述/多步工作流，负例一半无关领域、一半易混淆近邻**（近邻比无关更有验证价值）
- **训练/验证集划分（60/40 防过拟合）**：`train_queries` 用于定位失败、指导改 description；`validation_queries` 只在确认泛化时使用，**禁止用验证集结果进修改过程**
- 改 description 后：train 集指导修改（正例漏触发→过窄，补场景；负例误触→过宽，写边界），**不抄失败查询的关键词**（找它代表的类别）；每次修改把通过率记进提交信息（上游惯例：`evals: train 11/11, validation 8/8`）

### 9.3 本项目落地记录

- `thunderforge-dev`：description 重写为 "Use when developing, reviewing, debugging..."，正例含隐式（"给 agent 加一个能读文件的工具"不提 dsh）、负例含近邻（Koishi / Claude Code hooks / Chrome 扩展 / 通用编程）
- `dsh-buddy`：description 重写为 "Use when communicating with a user about DSH, plugins, code..."，负例含专业流畅（无校准信号不触发）
- 两个技能的触发评测集均已按 60/40 拆为 train/validation 并更新 methodology 字段

## 10. 贡献指南（简版）

1. **先读本文件**，尤其 §2 决策与红线
2. 改动尽量小、可回滚；每个版本补 CHANGELOG
3. 新 vendor 任何上游 → 协议确认（宽松协议才可引入）+ `LICENSES/` 台账 + 文件头来源声明
4. 新工具 → 过真机契约规则 + 补 `tool-contract.test.mjs` 覆盖
5. 提交信息说明「为什么」（决策与教训），不只是「改了什么」
6. 提 PR 前：`node --test` 全绿 + 真机 dump-config 无报错

## 10. 已知边界与待办

- **live 端到端**（真模型对话 → skill 触发 → capture 落盘 → waterfall 对齐）已于 2026-08-24 真机验证通过（见 HANDOFF §十）
- **live skill 触发评测**：train 6/6、validation 4/4（web 真机抽样，结果记入 `skills/thunderforge-dev/evals/trigger-queries.json` methodology）；注意 skill 触发要求 agent preset 含 Skills（minimal 极简模式裁剪 skill 工具）
- 改进与拓展路线（骨架 upgrade 器、llm-adapter 模板、MCP 双端暴露、capture 协议告警等）→ 见 [`ROADMAP.md`](./ROADMAP.md)