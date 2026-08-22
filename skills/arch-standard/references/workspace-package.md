# 在 DSH 仓库内添加 workspace 包

为新建 @deepseek-ai/dsh-<name> 包提供的逐文件清单。本清单以 bash 与适配器两个包为模板验证；若与模板有出入，以仓库脚本为准。

## 1. 创建包

```
packages/<group>/<pkg>/
  package.json   # 从 packages/core/tools 复制，调整 name/description/deps
  tsconfig.json  # extends ../../../tsconfig.base.json；rootDir src；outDir lib/types
                 # references：../../../vendor/cosmokit、../../../vendor/cordis
                 #   （+ ../../../vendor/schemastery 若用 Config；+ 每个 dsh 依赖 ../../<group>/<dep>）
  src/index.ts   # 服务 default export，或插件（name/inject/apply/Config）
  README.md      # 服务 API、事件、扩展点、设计说明 + Model Experience + Known Limitations
```

已有分组与角色匹配时选择该分组（core、llm、bash、compact、subagent、todo、session-persistence、ui、util 或 support）；允许新建分组，但分组只是纯容器：没有 package.json、没有源文件，包仍然恰好位于其下一层。

### package.json 不变式（pnpm run constraints / scripts/check-workspace-constraints.ts 强制执行）

- private: true；version 与根 package.json 一致；type: module
- main: "lib/index.js"；types: "lib/types/index.d.ts"
- exports["."].types: "./lib/types/index.d.ts"；exports["."].default: "./lib/index.js"
- @deepseek-ai/cordis 同时出现在 peerDependencies 和 devDependencies 中（相同范围）
- 每个 dsh peer 依赖都要在 devDependencies 中镜像；@deepseek-ai/schemastery 放 dependencies（运行时校验器）
- files 精确包含 lib/index.js、lib/invariant.js、lib/types/**/*.d.ts 以及门禁认可的包专用运行时产物；运行时 export 指向输出树时还要包含 lib/types/**/*.js。带 bin 的 CLI 应用包在 files 中把 lib/bin.js 紧跟 lib/index.js
- 不要发布 src、声明映射、JS map 或陈旧的根声明文件
- 包内相对导入在源码中显式使用 .ts 后缀（例如 export * from './types.ts'）——编译器在输出 JS 中重写为 .js，声明文件中保留显式 .ts 后缀，NodeNext/Node16 消费方解析到同目录 .d.ts

## 2. 在根配置中注册

| 文件 | 变更 |
| --- | --- |
| tsconfig.base.json | 已有分组无需编辑；新分组为 @deepseek-ai/dsh-* 通配符添加 ./packages/<group>/*/src 候选路径 |
| tsconfig.host.json（Host 包）或 tsconfig.client.json（Client 包） | references 中添加 { "path": "./packages/<group>/<pkg>" }——普通包恰好属于一个 aggregate，绝不两个都加（api/remotes 的仓库专属拆分不得仿照） |
| knip.json | 仅当包有仓库发现机制尚未覆盖的入口时需要 |

packages/client/* 包改为 extends tsconfig.base.client.json（而非 tsconfig.base.json）；client 插件包还需在 package.json 声明 dsh.client、导出 ./client、调用共享 tsdown preset（packages/client/tsdown.client.ts）。

以下内容由 glob 或包 manifest 发现机制自动覆盖，无需手动编辑：根 package.json workspaces、scripts/publint-all.ts、tsdown.config.ts、.oxlintrc.json、scripts/check-workspace-constraints.ts。

## 3. 确定包拓扑与命名

- **可替换能力**：当 Service Definition / Service Provider / Consumer 角色需要独立演进时拆分到不同包（shell 三组件是模板）；单一用途的插件保持为一个包。
- **名称必须描述当前稳定职责**：不要用首个实现、可能的未来扩展或 Cordis 基类命名；接口包使用能力名称；实现包加上能区分实现的机制、协议、环境或厂商限定词；只有同主机执行属于约定时才用 local。
- **ctx key 单复数**：engine、runtime、policy、controller、resolver、store 或当前配置使用单数 key；registry 或拥有多个具名成员的服务使用复数 key；类的角色与 key 的单复数必须一致。
- **host 与 client 声明不得复用同一个 Cordis Context key**：即使二者使用独立的运行时 context，TypeScript 声明合并仍会同时看到两种类型；自然复数已被另一面占用时增加职责后缀。

### 角色词表

| 词 | 适用条件 | 不适用条件 |
| --- | --- | --- |
| Controller | 接受命令或用户意图，改变既有领域状态或展示状态 | 执行任意工作、拥有一组 provider、只把值转换为展示形式 |
| Store | 拥有一组数据，主要提供 CRUD、snapshot 或 subscription | 校验状态机、裁决权限、分派工作或拥有 provider 优先级（类中有 map ≠ store） |
| Directory | 暴露供发现或选择的条目及其元数据 | producer 向其中注册实现，或调用方通过它执行工作 |
| Presenter | 把领域值或工具参数纯转换为渲染意图 | 执行 I/O、订阅、修改状态或拥有生命周期 |
| Registry | 拥有一组动态具名注册，以及查询、重复项或优先级规则、生命周期和释放 | 主要约定是分派、执行、取消、策略或编排 |
| Runtime | 运行实时工作，跨调用拥有分派、取消、provider 协调或操作生命周期 | 只存储记录、返回目录、解析一个值或保存配置 |
| Resolver | 根据输入计算或定位一个答案，但不拥有该答案的生命周期 | 拥有可变集合或长时间运行的执行过程 |
| Binder | 把已声明接口绑定到调用方的 context 或生命周期，并返回绑定值 | 把该值作为集合持有、控制其领域状态、或只转换数据 |
| Engine | 实现领域算法或有状态执行模型 | 只选择 provider 或跨协议边界转发请求 |
| Policy | 决定允许、选择、限制或观察什么 | 执行该决定所允许的机制 |
| Executor | 在一项能力中运行一个明确请求或已解析 spec | 拥有广泛应用生命周期或 provider 目录 |
| Gateway | 适配进程、网络、RPC 或 API 边界 | 只注册同进程服务或存储元数据 |
| Provider | 提供一项能力定义的一个实现；存在多个实现时加机制或厂商限定词 | 表示能力定义、provider registry 或消费方 runtime |
| Backend | 在已定义接口之后实现可替换的底层持久化、传输或执行 | 表示面向用户的服务或一个已返回的实时资源引用 |
| Handle | 引用一个实时资源，并控制或观察该资源 | 创建并管理完整资源池 |
| Config | 拥有一个已解析配置值，或一项边界严格的配置记录及其更新约定 | 存储通用集合、执行工作或暴露无关设置 |
| Service | 拥有一项无法用以上更精确角色诚实描述的内聚领域服务 | 只因为类继承 Cordis Service 而使用该名称 |

术语：只对受支持的 Python 与 TypeScript SDK 所使用的 JSON-RPC 客户端/服务器协议使用 SDK 字样（DeepSeek Harness 本身是 agent harness，不是 SDK 项目）；产品拼写统一使用 Typert。

## 4. 编写包 README

包特有的服务 API、配置、事件、扩展点和设计说明放在前面。limitations 部分记录持久的消费方缺口和本包拥有的非显而易见维护者约束；日常清理事项留在源码 TODO 或 Agent Note 中。间接的 Model Experience 语句可以点名暴露本包贡献的消费方，但不重述该消费方的实现。README 以如下规范序列结尾：

```markdown
## Model Experience
### Request context and condition
#### What the model sees
（数据依赖字段、锚定的生成目录链接，或逐字原文）
#### Token effect
（fixed / conditional / retained / replaced / capped / zero-direct token effect）
#### KV Cache effect
（append-only / prefix-stable / replacing / independent，含确切失效条件）
## Known Limitations and Deferred Work
- **Consumer-visible gap** — 确切缺失的操作或场景、其后果、维护者约束
```

规则：每个直接、条件、上限、生命周期或辅助的模型上下文条目使用一个 H3，包含上述三个有序 H4 字段；系统提示词等长稳定文本用带标题的 H5 + markdown 围栏放在 What the model sees 下；工具 schema 条目链接到生成工具目录的锚定章节、只说明差异；填写 KV Cache effect 时区分仅追加增长、稳定重复前缀、替换既有请求 token 与独立请求；「不使缓存失效」仅表示本包保留已有可复用前缀。没有上下文效果或仅消费方拥有路径的包，使用经审计的 None, as 或 Indirectly, through 语句（或 NO_MODEL_EXPERIENCE_SECTION），不要展开为对另一个包工作的描述。

## 5. 验证

```bash
pnpm install       # 注册 workspace
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

遵循仓库测试政策，执行新包所需的行为专项检查并达到相应覆盖率。
