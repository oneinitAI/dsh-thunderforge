# 发布清单（M3.6）

发布前的最后核查单。实际 `npm publish` 与 GitHub 推送需要发布者凭证，由维护者执行。

## 已就绪（本机可验证）

- [x] `npm pack --dry-run`：433 文件，源码/skills/manifest/许可证全在，dev 文件（test/docs/scripts/node_modules）全排除
- [x] 全量测试 `node --test` 通过（28 项，含三模板生成即冒烟）
- [x] 真实 dsh CLI 验收：`dsh plugin --profile tf-dev-m3 add F:/dsh-p` + `--dump-config` 层加载通过（见 docs/notes/m3-runtime-acceptance.md）
- [x] 合规：MIT 主许可证 + LICENSES 台账闭环（vendor 3 项原样保留 + 自研参考声明 + 排除记录）

## 发布步骤（维护者执行）

```bash
# 1. 最终检查
node --test && npm pack --dry-run

# 2. 发布到 npm（首次发布后即可 dsh plugin add npm:dsh-thunderforge）
npm publish            # 公开包；确认 npm whoami 已登录

# 3. 推送 GitHub（创建公开仓库 dsh-thunderforge 后）
git remote add origin git@github.com:<user>/dsh-thunderforge.git
git push -u origin main

# 4. 安装方式验证（换一台机器或删掉 link 后）
dsh plugin add github:<user>/dsh-thunderforge
dsh --dump-config | grep -A6 'dsh-thunderforge'
```

## 发布后跟进（PRD 遗留项）

- [ ] live skill 触发评测（需带模型 API 的 dsh 会话）：加载 `thunderforge-dev` 技能后按 `skills/thunderforge-dev/evals/trigger-queries.json` 跑正负例
- [ ] 全链路端到端：对话 → scaffold → dev preset 安装 → 模型调用 → capture 落盘 → waterfall 对齐
- [ ] 社区分发：awesome-deepseek-harness / DSH 插件商店提交 PR
