# Examples

<p align="center">
  <samp>
    <strong>English</strong> ·
    <a href="./README.md">中文</a>
  </samp>
</p>

Two minimal, copy-and-run examples of DSH plugins in bundle format (plain JavaScript, no build step). Both assume `dsh` is installed.

| Example | What it demonstrates | Try it |
| --- | --- | --- |
| [hello-plugin](./hello-plugin/README.en.md) | Plugin entry point (`name`/`apply`), lifecycle cleanup with `ctx.effect`, bundle manifest (`dsh.bundle`) and patch layer | `dsh plugin --profile demo add ./examples/hello-plugin` |
| [greet-tool](./greet-tool/README.en.md) | Registering a model-facing tool with `defineTool` (typed parameters, canonical output value, `output.render`) | `dsh plugin --profile demo add ./examples/greet-tool` |

Each example has its own README with step-by-step instructions. For the underlying standard, see the skill's `references/packaging.md` (bundles & layer order), `references/plugin-anatomy.md` (lifecycle) and `references/tools.md` (tool development).
