---
name: dsh-plugin-checklist
description: Use when the user mentions publishing, releasing, uploading, sharing, or submitting a DSH plugin anywhere (npm, GitHub, plugin market, awesome list) — or asks "can I ship this / is this ready" about a DSH plugin. Walks the release gate: run thunderforge_release checks, fix what fails, then hand the human the manual steps they must own. Also use when a release was rejected or a plugin breaks on install after publish. Not for: writing or reviewing plugin code before it exists (use thunderforge-dev), or general npm publishing outside dsh.
metadata:
  author: ThunderForge Contributors
  version: "0.1.0"
  sources: agentskills.io/specification · agentskills.io/skill-creation/optimizing-descriptions
---

# 发布门禁清单（dsh-plugin-checklist）

发布前把关的决策表。第一件事永远是跑门禁工具，而不是凭感觉放行——mock 测不出的错真机一票否决。

## 第一决策：现在处于哪一步

| 状态 | 先做 |
|---|---|
| 插件还没生成 | 回 `thunderforge-dev`（先有骨架再谈发布） |
| 代码写完，准备发布 | 本页 §门禁流程 |
| 已发布但装上就崩/被拒 | 本页 §翻车排查 |

## 门禁流程

1. **自动四查**：调用 `thunderforge_release`（参数 `dir`=插件目录），它会依次执行：
   - 冒烟测试（node --test）
   - 工具契约自检（raw 注册真机规则：output 必填、schema 类型白名单、additionalProperties、无 DSL 残留）
   - 零 harness 依赖铁律（dependencies 出现 @deepseek-ai 即红——Symbol 双实例事故）
   - 版本一致性（package.json version vs CHANGELOG 最新条目）
2. **逐项修复**未过项；工具返回的 violations 自带修法提示，照做后重跑直到全绿
3. **手动两步**（工具会列出，永远由人执行）：
   - `dsh --profile <验证用profile> --dump-config` 确认层加载无报错
   - `npm publish`（OTP 自理）；发完在 CHANGELOG 补记

## 发布红线（门禁之外，人工确认）

- LICENSE 与第三方依赖台账齐备（引用了别人的代码就要有出处）
- README 至少说清：这是什么、怎么装、怎么验证装上了
- 版本号语义：行为变更升 minor/patch 有据可依，CHANGELOG 记了因果

## 翻车排查（已发布但出问题）

| 症状 | 先查 |
|---|---|
| 装上 boot 报错 | dump-config 找红行 → 多半是 raw 契约或 patch 格式 |
| 装上静默不生效 | bundle 层序（capture 类需排最前）；agent preset 是否裁掉了能力 |
| npm publish 被拒 | 版本号是否已存在；OTP 是否过期 |

## 边界

- 门禁工具只检查不代发：npm publish 与 OTP 永远由人执行
- 不替用户决定版本号语义，只核对一致性
