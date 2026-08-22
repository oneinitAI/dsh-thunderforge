# 触发评测

<p align="center">
  <samp>
    <strong>中文</strong> ·
    <a href="./README.en.md">English</a>
  </samp>
</p>

`description` 的回归评测集，方法论来自 Agent Skills 官方指南[《Optimizing skill descriptions》](https://agentskills.io/skill-creation/optimizing-descriptions)。

## 评测集

`trigger-queries.json` 包含 12 条 should-trigger（应触发）与 9 条 should-not-trigger（不应触发）查询：

- **正例**：变着法考——不同措辞、繁简、错别字、中英文、直接点名与隐式描述（"加一个能读文件的工具"全程不提 DSH），以及多步工作流（打包安装、workspace 包）。
- **负例**：一半是明显无关领域（天气、翻译、SQL、Chrome 扩展、GitHub Actions），一半是**易混淆近邻**（Koishi——同为 Cordis 系但目标框架不同；Claude Code hooks 配置——属于其它技能的领域）。

## 运行方法

1. 把每条查询发给目标 agent，记录是否触发了本技能（DSH 中用 `skill` 工具确认；Claude Code 用 `--output-format json` 检查 `Skill` 工具调用，见官方指南的示例脚本）。
2. `should_trigger` 与实际触发一致即通过；通过率 = 通过条数 / 总条数。
3. 每条跑 2-3 次取多数（触发本身有随机性）。

## 训练/验证集划分（防过拟合）

- **训练集（~60%）**：用来定位失败、指导修改 description。
- **验证集（~40%）**：只在确认修改是否泛化时使用，不进修改过程。
- 修改原则：正例漏触发 → description 过窄，补充使用场景；负例误触 → 过宽，写清边界。**不要抄失败查询里的关键词**——找它代表的类别。按验证集通过率选最优版本，不一定是最后一版。

## 记录

每次修改 description 后把通过率记入提交信息，例如：`evals: zh 12/12, en 3/3, negatives 9/9`。
