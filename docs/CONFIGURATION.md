# ThunderForge & dsh-buddy 配置指南

> dsh 插件的配置通过 **profile 的 `cordis.patch.yml` 用户层**覆盖：重述目标行（带 id 与 name），`config:` 里的键整行替换、**不深度合并**。改完重启对应应用生效。

## 快速上手

在 `%DSH_HOME%\profiles\<你的profile>\cordis.patch.yml`（无 DSH_HOME 时 `~/.dsh/profiles/<名>/cordis.patch.yml`）追加：

```yaml
# 关闭 capture（例如只想用 scaffold/debugger）
- id: thunderforge-capture
  name: dsh-thunderforge/capture
  config:
    enabled: false

# 换 capture 输出目录 + 关闭协议守卫告警
- id: thunderforge-capture
  name: dsh-thunderforge/capture
  config:
    enabled: true
    dir: D:/my-captures
    staleWarnMs: 0
```

验证：`dsh --profile <名> --dump-config`，目标行应出现 `, patched by ...cordis.patch.yml` 且 config 为你写的值。

---

## thunderforge 各引擎配置

### thunderforge-capture（`id: thunderforge-capture`）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；`false` 时适配器不包装、零开销 |
| `dir` | `~/.dsh/thunderforge-capture` | 载荷落盘目录（空串 = 默认） |
| `providers` | `[]`（全部） | 只捕获这些 provider 路由，如 `["a"]` |
| `redact` | `true` | 掩码 apiKey/secret/token 等敏感字段 |
| `captureDeltas` | `false` | 额外记录原始 StreamChunk 分片（调试协议用，体积大） |
| `maxStringLength` | `0`（不截断） | 单字符串最大保留长度 |
| `maxFiles` | `2000` | 捕获文件数上限轮转 |
| `maxTotalBytes` | `0`（不限） | 目录总字节上限 |
| `pruneEvery` | `50` | 每 N 次写入执行一次清理 |
| `staleWarnMs` | `300000` | 协议失效守卫：包装后超时零捕获输出警告；`0` 关闭 |

### thunderforge-skills（`id: thunderforge-skills`）

| 键 | 默认 | 说明 |
|---|---|---|
| `entryLayer` / `archLayer` / `pitfallsLayer` / `buddyLayer` / `checklistLayer` | `true` | 逐层开关知识库 |
| `probeDelayMs` | `8000` | skill 工具可达性探测延迟（毫秒），`0` 关闭探测 |

### thunderforge-debugger（`id: thunderforge-debugger`）

| 键 | 默认 | 说明 |
|---|---|---|
| `disabled` | `false` | `true` 时整个工具不注册 |
| `waterfallLimit` | `80` | waterfall/watch 默认显示行数 |

### thunderforge-scaffold（`id: thunderforge-scaffold`）

| 键 | 默认 | 说明 |
|---|---|---|
| `disabled` | `false` | `true` 时工具不注册 |
| `verify` | `true` | 生成后是否默认立即冒烟（单次调用仍可用参数覆盖） |

### thunderforge-profile / thunderforge-release（`id: thunderforge-profile` / `thunderforge-release`）

| 键 | 默认 | 说明 |
|---|---|---|
| `disabled` | `false` | `true` 时工具不注册 |

### MCP 入口（`mcp.mjs`）

非 dsh 宿主使用。环境变量暂无配置项；工具集固定为五引擎。

---

## dsh-buddy 配置

独立安装（`dsh plugin add github:oneinitAI/dsh-buddy`）时：

| 键 | 位置 | 默认 | 说明 |
|---|---|---|---|
| 技能注册 | 行级 `config.disabled` | `false` | 同上机制禁用 buddy 技能层 |
| 画像文件路径 | 固定 `~/.dsh/buddy-profile.json` | — | v0.5 暂不可配（显式 opt-in 才会写入） |
| `probeDelayMs` | 行级 `config.probeDelayMs` | `8000` | 同 skills 层探测 |

随 ThunderForge 全家桶安装时：buddy 技能由 `thunderforge-skills` 的 `buddyLayer` 控制；持久化工具不可用（SKILL.md 已声明降级行为）。

---

## 常见配置场景

**只想要 scaffold + debugger，其他全关**：

```yaml
- id: thunderforge-capture
  name: dsh-thunderforge/capture
  config:
    enabled: false
- id: thunderforge-skills
  name: dsh-thunderforge/skills
  config:
    archLayer: false
    pitfallsLayer: false
- id: thunderforge-release
  name: dsh-thunderforge/release
  disabled: true
```

**调试 capture 本身**（看原始协议分片 + 不轮转）：

```yaml
- id: thunderforge-capture
  name: dsh-thunderforge/capture
  config:
    captureDeltas: true
    maxFiles: 0
    redact: false   # ⚠ 仅本地排查密钥问题时临时开启
```

> ⚠️ 层序提醒不变：thunderforge 行仍需位于 `dsh.profile.bundles` 最前（先于 `@deepseek-ai/dsh-base`），配置覆盖不影响层序要求。
