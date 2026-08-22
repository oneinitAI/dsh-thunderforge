# greet-tool

<p align="center">
  <samp>
    <strong>中文</strong> ·
    <a href="./README.en.md">English</a>
  </samp>
</p>

最小模型工具示例：用 `defineTool` 注册一个 `greet` 工具。`@deepseek-ai/dsh-tools` 由 dsh 安装目录自带，无需额外安装。

## 安装

```bash
dsh plugin --profile demo add ./examples/greet-tool
dsh --profile demo
```

然后对 agent 说：

> Use the greet tool to greet Ada.

应收到 "Hello, Ada!"。

## 与标准的对应关系

- `inject: ['tools']` 让 Cordis 等待工具注册表就绪。
- `defineTool` 根据 `parameters` 推导并校验 `args`；`execute` 返回 `output.schema` 声明的规范值；`output.render` 再把它转成面向模型的内容。
- 进阶：把问候语做成可配置（`references/config.md`），或把能力拆成三种角色（`references/three-roles.md`）。
