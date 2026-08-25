# examples/

真实由 `thunderforge_scaffold` 生成的示例骨架，供上手参考——每个目录都是一个可独立安装的 DSH 插件。

| 目录 | 模板 | 说明 |
|---|---|---|
| `dsh-example-note/` | tool | 最小工具插件：注册一个模型工具，原始 JSON Schema 写法 |

## 试玩

```bash
# 冒烟（生成即验证的产物，随时可复验）
cd dsh-example-note && npm test

# 装进干净的 dev 环境体验完整闭环
dsh plugin --profile tf-dev-demo add ./dsh-example-note
dsh --profile tf-dev-demo --dump-config   # 应出现 "# == dsh-example-note" 层
```

想生成自己的骨架？在装了 ThunderForge 的会话里对 agent 说：

> 帮我用 thunderforge_scaffold 生成一个 events 模板的插件，短名 my-first
