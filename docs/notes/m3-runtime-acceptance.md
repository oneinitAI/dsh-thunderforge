# M3 运行时验收记录（2026-08-22）

真实 dsh CLI（非 mock）对 ThunderForge bundle 的安装与加载验证。

## 环境

- dsh CLI：`0.1.1-rc.2`，经 `~/.dsh/profiles/node_modules/@deepseek-ai/dsh` → `F:/dsh/deepseek-harness/apps/cli`（用户本地源码 link，`node bin.js --version` 实测）
- 被测包：`F:/dsh-p`（dsh-thunderforge@0.1.0，本地 link 安装）
- 验收 profile：`tf-dev-m3`（由 `thunderforge_profile create-dev-preset` 生成）

## 步骤与结果

| # | 步骤 | 结果 |
|---|---|---|
| 1 | `thunderforge_profile op=create-dev-preset name=m3` | ✅ 生成 `~/.dsh/profiles/tf-dev-m3`（package.json + cordis.patch.yml + pnpm-workspace） |
| 2 | `dsh plugin --profile tf-dev-m3 add F:/dsh-p` | ✅ pnpm 安装 498ms，bundle 追加进 `dsh.profile.bundles`，依赖 `link:F:/dsh-p` |
| 3 | `dsh --profile tf-dev-m3 --dump-config` | ❌→✅ 首跑失败（见下），修复后通过 |
| 4 | 配置转储包含 ThunderForge 层 | ✅ `# == dsh-thunderforge` 下 5 行全部就位：capture / skills / scaffold / debugger / profile |

## 发现并修复的真实 bug

**PRESET_PATCH 顶层 YAML 数组问题**：dsh boot 要求每个 patch 文件解析为顶层 YAML 数组
（`Array.isArray(parsed)` 检查，源码 `@deepseek-ai/dsh-app-boot/lib/index.js` parsePatchList）。
初始 PRESET_PATCH 全部是注释，YAML 解析为 `null`，dump-config 直接报错：
`overlay ...cordis.patch.yml must be a top-level YAML array`。

修复：PRESET_PATCH 追加 `[]` 顶层空数组（注释保留为指导），并在
`test/profile.test.mjs` 增加防回归断言（去注释后必须恰为 `['[]']`）。

## 未覆盖（需模型 API key / 交互 TTY）

- `dsh --profile tf-dev-m3` 完整启动（交互式）
- 对话内 skill 触发、`thunderforge_scaffold` 工具调用、模型调用落 capture、waterfall 对齐 live 数据

## 附注

- npx 首跑下载 `@deepseek-ai/dsh` 停滞（依赖树过重，npm 缓存 1.4G 未完成），改用用户既有
  profiles 工作区的 CLI link 完成验收——结论：**dsh-thunderforge 在真实 dsh 0.1.1-rc.2 上安装与层加载均通过**。
- 验收 profile `tf-dev-m3` 保留在本机，可直接 `dsh --profile tf-dev-m3` 启动开发环境。
