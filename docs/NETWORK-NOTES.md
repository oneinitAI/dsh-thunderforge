# 网络问题手册（本项目实战沉淀）

发布与推送在本机网络下踩过的坑及对策。工具已内置，这里存档原理。

## 现象一：github.com:443 被重置，api.github.com 正常

**表现**：`git push` 报 `Recv failure: Connection was reset` 或 `Failed to connect to github.com port 443`；同一时刻 `gh api` / `gh repo view` 全部正常。

**原理**：两类域名走不同通道策略，git 的 HTTPS 传输被掐而 REST API 存活。

**对策**：`node scripts/github-push.mjs`——git 直连失败自动降级 API 通道（blobs→tree→commit→ref）。要点：

- git blob sha 与 API blob sha 同源（内容寻址），远端已有文件直接复用，只传增量
- 不带 base_tree 的全新根树天然同步删除
- 降级路径产出**单条提交**（Contents API 逐文件 PUT 会刷屏，已弃用）
- 分歧保护：远端出现本地没有的提交时拒绝推送

**注意**：API 推送后本地与远端历史形状不同（内容一致）。网络恢复后对齐：`git fetch origin && git reset origin/main`。

## 现象二：Node fetch 被本机代理 TLS 链拦截

**表现**：`unable to verify the first certificate` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`；gh CLI 正常（Go 栈用系统 CA）。

**对策**：`node --use-system-ca`（Node ≥ 24）。`github-push.mjs` 检测到证书错误会**自动带该参数重启自身**，无需手动。

## 现象三：npm 安装超大包（如 @deepseek-ai/dsh 全家桶）极慢或假死

**表现**：`npx`/`npm i` 长时间无输出，缓存膨胀至 GB 级。

**对策**：

1. 让它跑完一次——缓存热了以后重装只要两分钟（实测 454 包 / 2min）
2. 优先用 pnpm（profiles 目录内的安装本来就由 dsh 转发给 pnpm，很快）
3. 已装用户升级 dsh 生态包走 `dsh plugin --profile <名> update <包>`，不要全局重装

## 现象四：peer dependency 警告（安装 dsh 插件时）

**表现**：pnpm 警告 `missing peer @deepseek-ai/dsh-agent` 等一串。

**原理**：dsh 架构里这些平台包由**宿主在启动时提供**（内置 bundle 从 dsh 安装目录解析，pnpm 只管 profile 树外包），静态分析看不见但运行时齐备。

**对策**：无视。这是 dsh 插件安装的预期噪音。

## 其他

- **jq 不可用**：本机脚本一律用 Node 内置能力（fetch/execFileSync），零外部依赖
- **Windows 换行**：克隆下来的文件是 CRLF，frontmatter 解析前需 `replaceAll('\r\n', '\n')`
- **`node --test test/` 位置参数**：Windows 下会被当模块入口解析，统一用 `node --test`（自动发现）
