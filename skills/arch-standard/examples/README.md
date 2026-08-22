# 示例

<p align="center">
  <samp>
    <strong>中文</strong> ·
    <a href="./README.en.md">English</a>
  </samp>
</p>

两个可复制、可运行的最小 DSH 插件示例（bundle 格式，纯 JavaScript，无需构建）。均假设已安装 `dsh`。

| 示例 | 演示内容 | 快速开始 |
| --- | --- | --- |
| [hello-plugin](./hello-plugin) | 插件入口（`name`/`apply`）、用 `ctx.effect` 做生命周期清理、组合包清单（`dsh.bundle`）与 patch 层 | `dsh plugin --profile demo add ./examples/hello-plugin` |
| [greet-tool](./greet-tool) | 用 `defineTool` 注册模型工具（类型化参数、规范输出值、`output.render`） | `dsh plugin --profile demo add ./examples/greet-tool` |

每个示例目录里都有分步说明。底层标准见技能的 `references/packaging.md`（组合包与层序）、`references/plugin-anatomy.md`（生命周期）和 `references/tools.md`（工具开发）。
