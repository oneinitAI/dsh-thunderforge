# Ponytail 审计报告：test/ 目录（2026-08-24）

> 方法：ponytail 七级阶梯（YAGNI / 库内复用 / stdlib / 平台原生 / 已有依赖 / 一行化 / 最小实现）。
> 结论先行：**测试代码的重复是明确性优先的有意取舍，本轮不建议删改。** 以下为完整台账，供未来参考。

## 现状

| 文件 | 行数 | 测试数 |
|---|---|---|
| capture.test.mjs | 320 | 16 |
| debugger.test.mjs | 168 | 8 |
| scaffold.test.mjs | 113+ | 9 |
| skills.test.mjs | 113 | 7 |
| contract.test.mjs | 98 | 9 |
| release.test.mjs | 86 | 3 |
| mcp.test.mjs | 74 | 1 |
| profile.test.mjs | 91 | 5 |
| tool-contract.test.mjs | 43 | 2 |

## 发现与裁决

### F1. mock ctx 构造重复（5 处）
`{ tools: { register: (d) => defs.push(d) } }` 模式在 scaffold/debugger/release/mcp/tool-contract 测试中各有一份。
**裁决：保留。** 每份 3-6 行；抽共享 fixture 会引入测试间耦合（一个文件坏了拖垮全部），且各测试对 ctx 的定制略有差异（logger/effect/on）。测试明确性 > DRY。

### F2. twoStepAdapter fixture 与 release 测试的内联合规工具定义
capture.test.mjs 有 `twoStepAdapter()`，release.test.mjs 内联了一个合规工具定义。
**裁决：保留。** 两者的断言目标不同（协议形状 vs 门禁行为）；共享会让测试读起来要跳转文件。

### F3. fixture() 会话构造在 debugger.test.mjs 内部复用良好
无跨文件需求。无需动作。

### F4. 断言辅助（assertCompliant / settle / captureFiles）
capture 与 tool-contract 各有一份 `settle`/类似小助手。
**裁决：保留。** 均为 1-3 行局部函数；提取到共享模块的耦合成本高于重复成本。

## 若未来要收敛（触发条件）

仅当出现「同一 helper 在 ≥4 个文件且超过 10 行」时，再建 `test/helpers.mjs`。
当前最大重复块 6 行——不满足阈值。

## 量化

潜在可删行数（若强行去重）：约 40 行。
预期代价：测试文件间耦合 + 单文件可读性下降。
**结论：不划算。ponytail 第①条也适用于抽象本身——这个共享模块不需要存在。**
