# hello-plugin

<p align="center">
  <samp>
    <strong>中文</strong> ·
    <a href="./README.en.md">English</a>
  </samp>
</p>

最小 DSH 插件示例（bundle 格式，纯 JavaScript，无需构建）。加载后打印日志，并演示"注册即副作用"：用 `ctx.effect` 注册的心跳定时器会在插件卸载时自动清理。

## 安装

```bash
dsh plugin --profile demo add ./examples/hello-plugin
dsh --profile demo --dump-config    # 应看到 "# == dsh-hello-plugin" 层
dsh --profile demo                  # 日志出现 [hello-plugin] plugin loaded!（及每 5 秒一次的心跳）
```

首次 `add` 会初始化 profile（`@deepseek-ai/dsh-base` 作为第一个组合包加入）。

## 与标准的对应关系

- `package.json` 声明 `dsh.bundle` 指向 `cordis.patch.yml`；patch 行按包名引用插件，Node 模块解析才能找到已安装代码。
- `index.js` 导出 `name` 和 `apply(ctx)`；经 `ctx` 注册的一切在卸载时自动清理。
- 改成你自己的插件：复制本目录，改包名、`index.js` 的导出，以及 patch 里的 `id`/`name`。
- 相关标准：`references/plugin-anatomy.md`（生命周期）与 `references/packaging.md`（组合包与层序）。
