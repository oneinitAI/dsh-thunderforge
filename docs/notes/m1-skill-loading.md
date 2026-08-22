# M1.1 调研笔记：DSH 的 skill 加载机制

> 依据：本地源码 `F:\dsh\deepseek-harness`（deepseek-ai/deepseek-harness @ b150a551b，dsh v0.1.1-rc.2，2026-08-22 拉取）

## 结论（ThunderForge 采用的挂载方式）

**bundle 插件内联注册**：插件 `inject = ['skills']`，在 `apply()` 中把随包分发的技能目录逐个经 `ctx.skills.register(skillRegistration)` 注册，`resourceBase: { kind: 'directory', path }` 指向包内技能目录，使 SKILL.md 正文中的相对资源（references/、examples/）可被解析。

依据源码：
- `packages/skill/skill/src/index.ts` — `SkillRegistry extends Service`，`register(skill: SkillRegistration): () => void`（返回注销函数，HMR 安全）
- `SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & { invocation?, provider? }`
- `SkillDefinition`：`{ name, description, whenToUse?, invocation, source, provider, content, path?, metadata?, resourceBase? }`
- 技能名语法：kebab-case `^[a-z0-9]+(?:-[a-z0-9]+)*$`

## 备选机制（未采用）

| 机制 | 说明 | 未采用原因 |
|---|---|---|
| 本地目录扫描 | `dsh-skill-filesystem` 按优先级扫 `<projectRoot>/.dsh/skills`(100) → `.agents/skills`(200) → `Config.customSkillDirs`(300) → `<dshHome>/skills`(400) → `<agentsHome>/skills`(500) → `Config.bundledSkillDir`(600) | 需要 bundle 之外的动作（复制文件/用户配置）；bundle 原则是装即所得 |
| 自定义 SkillProvider | `ctx.skills.registerProvider()` 提供目录/远程源 | 我们只需静态内容，内联 register 更简单 |

## 关键事实

- 注册表是 host+scope 分层的；runtime 注册（`ctx.skills.register`）落在调用方 scope 层，rank 250
- `SkillSummary` 只有 `name` + `description`（+`whenToUse`）进入模型可见目录；正文与绝对路径不进
- 目录 bundle 形态 `<name>/SKILL.md`；嵌套递归发现不支持（references 由 resourceBase 在正文内引用）
- 模型侧消费：`dsh-tool-skill` 把目录发布为模型可见的 `skill` 工具

## 对 M2 的连带结论（工具 API）

- `defineTool` 由 `@deepseek-ai/dsh-tools` 导出（源码 `packages/core/tools/src/schema.ts`，npm 已发布 0.1.1-rc.2）
- 工具插件：`inject = ['tools']`，`ctx.tools.register(defineTool({ name, description, parameters, output: { schema, render }, execute }))`
- execute 返回规范 JSON 值（不返回内容块）；参数由 schema 自动校验
