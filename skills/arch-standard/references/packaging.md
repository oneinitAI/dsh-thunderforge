# 打包与安装插件

把本地插件打包成可安装的组合包（bundle），用 dsh plugin add 安装进 profile。本文假设 dsh CLI 已安装。

## 两个概念，两种 manifest

两者都由 package.json 描述，但在 dsh 键下携带不同 manifest，回答不同问题：

- **组合包（bundle）**：附带一个配置层的 npm 包。manifest 声明 dsh.bundle，回答「这个包贡献什么？」——一个插入或覆盖插件行的 patch 文件。是你编写并分发的东西。
- **profile**：位于 $DSH_HOME/profiles/<name> 下、描述一份可启动组合的目录。manifest 声明 dsh.profile，回答「这套配置由哪些组合包按什么顺序组成？」。是用户用 dsh --profile <name> 启动的东西。

没有东西同时是两者。

## 组合包结构

```
hello-plugin/
├── package.json      # 声明 dsh.bundle
├── cordis.patch.yml  # profile 列出该 bundle 时应用的层
└── index.js          # patch 行引用的插件模块
```

package.json：

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

index.js 写插件入口（与本地插件完全一样，导出 name + apply）。cordis.patch.yml 与 --patch overlay 同构，是 patch 条目的 YAML 数组；区别是**插件行按包名引用**（Node 模块解析才能找到已安装代码）：

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

不声明 dsh.bundle 的包仍可安装，但只作为普通依赖：dsh plugin 打印警告、不激活任何层。供插件包 import 的库使用这种包格式。

## profile

profile 目录两个文件：

- package.json —— profile 的树外插件依赖（pnpm 管理）+ dsh.profile manifest 及其有序 bundles 列表。
- cordis.patch.yml —— 用户自己的 patch 层，在每个组合包层之后应用。

profile manifest 从不需要手写：dsh plugin 负责创建与维护。

## 安装进 profile

```bash
dsh plugin --profile demo add ./hello-plugin
```

首次使用会初始化 profile（@deepseek-ai/dsh-base 作为第一个组合包）。因包声明了 dsh.bundle，被追加进 dsh.profile.bundles：

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": { "dsh-hello-plugin": "link:/path/to/hello-plugin" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-hello-plugin"] } }
}
```

先验证层、再启动：

```bash
dsh --profile demo --dump-config   # 应显示 "# == dsh-hello-plugin" 层
dsh --profile demo
```

dsh plugin --profile demo remove dsh-hello-plugin 同时移除依赖与对应层。

## 加载顺序（层序）

生效配置在空根之上按以下顺序逐层组合：

1. profile 的 dsh.profile.bundles 各组合包 patch（按列表顺序：先 @deepseek-ai/dsh-base，再每个已安装组合包按加入顺序）
2. profile 自己的 cordis.patch.yml
3. home 级 $DSH_HOME/cordis.patch.yml（各 profile 共享的机器本地偏好）
4. 每个 --patch <path> overlay（按 argv 顺序）

**后应用层按行胜出；patch 替换目标行的整个 config 值，而不是深度合并各键。** 两个推论：

- 你的 patch 按 id 覆盖前面层的行时，必须重述该行需要的每一个键，而不是只写改动的那个。
- 用户可在自己 profile 的 cordis.patch.yml 覆盖你的行、无需改动你的包——优先给出用户大概率保留的配置默认值，其余交给 schema。

内置组合包名始终从 dsh 安装目录解析；pnpm 只管理树外包，所以组合包可以放心依赖 @deepseek-ai/dsh-base 存在且与安装一致。

## 让表层组合包持有自己的命令行

定义可运行应用的组合包挂载一个普通提供方插件（如 dsh-hello-plugin/startup）：导出 inject = ['cmdlineArgs']，用 @deepseek-ai/dsh-cmdline 的 parseCmdline + 自己的 commander program，在 action 中把应用自有服务提供出去。受这些参数配置的行在 !!js 选项里读取：

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

遇到 --help 时提供方不发布服务，这些行不会激活。

## 从 GitHub 安装：构建脚本这道坎

```bash
dsh plugin --profile demo add github:you/hello-plugin
```

git 安装拉取源码而非构建产物：没有任何环节运行 build 脚本，TypeScript 包到手时没有 lib/ 输出，加载会失败。两边各做一件事：

- **作者**：提供 prepare 脚本（pnpm 在 git 安装后运行它），从源码构建出发布入口，且必须自包含——不能假设仅开发环境才有的上下文（如旁边有一份 monorepo checkout）。
- **用户**：为构建授权。pnpm ≥10 在显式允许前拒绝运行 git 依赖的 prepare 脚本，第一次 add 会失败；把 pnpm 打印的确切包键复制进该 profile 的 pnpm-workspace.yaml：

```yaml
allowBuilds:
  dsh-hello-plugin: true
```

然后重新 add。请如实看待这项授权：允许该包代码在安装时于你的机器上执行，且不在 agent 运行的任何沙箱之内。只对源码可信的包授权，并**锁定 commit**（github:you/hello-plugin#<sha>），让后续推送无法悄悄改变实际运行的内容。

不想让用户做这项授权，就分发构建产物（都不需要构建权限）：

- 发布到 npm：pnpm publish 时构建好 lib/；dsh plugin add your-package 安装预构建代码。
- 交付 tarball：pnpm pack 打包；用户执行 dsh plugin add ./hello-plugin-0.1.0.tgz。
