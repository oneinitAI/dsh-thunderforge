# dsh-example-note

由 ThunderForge scaffold 生成的 DSH 插件骨架（模板：`tool`）。

## 开发

- 演示工具 `example_note_greet` 已注册（原始 JSON Schema 写法，零依赖）
- 升级为 `defineTool` 类型化写法：查 dsh-plugin-dev 技能 references/tools.md
- 架构规范/坑点：agent 会话里加载 `thunderforge-dev` / `dsh-plugin-dev` / `dsh-plugin-guide` 技能

## 验证

```bash
npm test        # 冒烟：加载校验 + node --test
```

发布前建议自检工具定义是否符合真机契约（output 必填、schema 类型白名单、additionalProperties 等）：
宿主安装 dsh-thunderforge 后可用 `import { checkRawToolContract } from 'dsh-thunderforge/contract'`，
把注册的工具定义传入即可得到违规清单与修法提示。

## 调试埋点

`thunderforge.debug.json` 声明了本骨架的埋点约定：宿主启用 thunderforge-capture 后，
模型调用的载荷按 `index.jsonl` 索引流落盘，可与本插件的事件（前缀 `example-note/`）对齐排查。

## 安装（开发期）

```bash
dsh plugin --profile demo add ./
dsh --profile demo --dump-config   # 应出现 "# == dsh-example-note" 层
```
