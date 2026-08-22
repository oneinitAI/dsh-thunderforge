# hello-plugin

<p align="center">
  <samp>
    <strong>English</strong> ·
    <a href="./README.md">中文</a>
  </samp>
</p>

A minimal DSH plugin in bundle format (plain JavaScript, no build step). It logs on load and demonstrates that every registration is a disposable side effect: a heartbeat interval registered with `ctx.effect` is cleared automatically when the plugin unloads.

## Install

```bash
dsh plugin --profile demo add ./examples/hello-plugin
dsh --profile demo --dump-config    # expect a "# == dsh-hello-plugin" layer
dsh --profile demo                  # logs: [hello-plugin] plugin loaded! (plus a heartbeat every 5s)
```

The first `add` initializes the profile (`@deepseek-ai/dsh-base` is added as its first bundle).

## How it maps to the standard

- `package.json` declares `dsh.bundle`, pointing at `cordis.patch.yml`; the patch row references the plugin by package name so Node module resolution finds the installed code.
- `index.js` exports `name` and `apply(ctx)`; everything registered through `ctx` is cleaned up automatically on unload.
- To turn this into your own plugin: copy the folder, change the package name, the exports in `index.js`, and the `id`/`name` in the patch file.
- Related standards: `references/plugin-anatomy.md` (lifecycle) and `references/packaging.md` (bundles & layer order).
