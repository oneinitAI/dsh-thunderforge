# greet-tool

<p align="center">
  <samp>
    <strong>English</strong> ·
    <a href="./README.md">中文</a>
  </samp>
</p>

A minimal model-facing tool: registers a `greet` tool with `defineTool`. `@deepseek-ai/dsh-tools` is provided by the dsh installation itself — no extra install needed.

## Install

```bash
dsh plugin --profile demo add ./examples/greet-tool
dsh --profile demo
```

Then ask the agent:

> Use the greet tool to greet Ada.

It should reply "Hello, Ada!".

## How it maps to the standard

- `inject: ['tools']` makes Cordis wait until the tool registry is ready.
- `defineTool` derives and validates `args` from `parameters`; `execute` returns the canonical value declared by `output.schema`; `output.render` turns it into model-facing content.
- Next steps: make the greeting configurable (`references/config.md`) or split the capability into three roles (`references/three-roles.md`).
