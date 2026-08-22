# 发布清单（M3.6）

发布前的最后核查单。实际 `npm publish` 与 GitHub 推送需要发布者凭证，由维护者执行。

## 已完成（2026-08-22）

- [x] `npm pack --dry-run`：433 文件，源码/skills/manifest/许可证全在，dev 文件（test/docs/scripts/node_modules）全排除
- [x] 全量测试 `node --test` 通过（28 项，含三模板生成即冒烟）
- [x] 真实 dsh CLI 验收：`dsh plugin add` + `--dump-config` 层加载通过（见 docs/notes/m3-runtime-acceptance.md）
- [x] 合规：MIT 主许可证 + LICENSES 台账闭环（vendor 3 项原样保留 + 自研参考声明 + 排除记录）
- [x] GitHub 公开仓库：https://github.com/oneinitAI/dsh-thunderforge（CI 徽章点亮）
- [x] npm 发布：https://www.npmjs.com/package/dsh-thunderforge（0.1.0）
- [x] **对外安装验证**：干净 profile `dsh plugin add dsh-thunderforge` 从 registry 拉取（^0.1.0）→ dump-config 五行层加载 ✅
- [x] awesome-deepseek-harness 提交：PR #456（按贡献指南双语言版同 PR）

## 发布步骤（维护者执行）

**一键发布**（推荐，含抗网络推送与 registry 验证）：

```bash
node scripts/release.mjs patch          # bump → 测试 → npm publish → 推送 → 验证
node scripts/release.mjs patch --dry-run # 只看计划
```

未登录 npm 时脚本会完成 bump/提交/推送并明确列出剩余的手动两步（`npm login && npm publish`）。

**手动路径**（等价）：

```bash
node --test && npm pack --dry-run
npm publish
git push                                # 网络被掐时: node scripts/github-push.mjs
```

网络问题（443 重置 / TLS 拦截 / 大包安装慢 / peer 警告）的原理与对策见 [`NETWORK-NOTES.md`](./NETWORK-NOTES.md)。

## 发布后跟进（PRD 遗留项）

- [ ] live skill 触发评测（需带模型 API 的 dsh 会话）：加载 `thunderforge-dev` 技能后按 `skills/thunderforge-dev/evals/trigger-queries.json` 跑正负例
- [ ] 全链路端到端：对话 → scaffold → dev preset 安装 → 模型调用 → capture 落盘 → waterfall 对齐
- [ ] 社区分发：awesome-deepseek-harness / DSH 插件商店提交 PR
