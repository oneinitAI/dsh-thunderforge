# LICENSES — 上游声明与致谢台账

> **协议承诺**：ThunderForge 尊重并严格遵守所有上游仓库的开源协议。全部 vendor 文件未修改实现（仅前置来源声明头），
> 各上游许可证原文随包分发；Apache-2.0 组件按其协议要求文件级保留原协议与 NOTICE；对上游组件的任何权利主张
> 始终以上游协议原文为准。感谢每一位上游作者——ThunderForge 站在你们的肩膀上。
>
> **License commitment**: ThunderForge strictly respects every upstream license. All vendored files are unmodified
> (provenance header only); upstream license texts ship with the package. Our thanks to all upstream authors.

整合的上游组件在此保留各自的版权声明与许可证文本。
引入方式与状态随里程碑更新；分发时本目录必须随包发布（`files` 已包含）。

| 组件 | 上游 | 许可证 | 引入状态 |
|---|---|---|---|
| dsh-plugin-dev-skills | [zimodzh/dsh-plugin-dev-skills](https://github.com/zimodzh/dsh-plugin-dev-skills) | MIT | **已引入** `skills/arch-standard/`（原样 vendor，未修改上游正文；含 examples/、references/、evals/） |
| dsh-plugin-guide | [PerryLink/dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | Apache-2.0 | **已引入** `skills/pitfalls/`（原样 vendor，未修改；上游自带 LICENSE 与 NOTICE.md 保留） |
| create-dsh-plugin | [whyihaveyou/dsh-suite](https://github.com/whyihaveyou/dsh-suite) | MIT | 不再引入——脚手架模板改为依据 dsh-plugin-dev 规范自研（见下） |
| dsh-plugin-starter | [ciceroyang/dsh-plugin-starter](https://github.com/ciceroyang/dsh-plugin-starter) | MIT | 不再引入——tests/CI 模板自研 |
| dsh-trajectory-debug | [devmom/dsh-trajectory-debug](https://github.com/devmom/dsh-trajectory-debug) | MIT | 未 vendor（Web UI 宿主形态与本套件模型工具形态不匹配）；瀑布/断点概念参考，实现自研 |
| dsh-replay | [zoahdev/dsh-replay](https://github.com/zoahdev/dsh-replay) | MIT | **已引入** `src/debugger/session-log.js`（原样 vendor，仅前置来源声明头） |
| dshp | [asdf17128/dshp](https://github.com/asdf17128/dshp) | MIT | **已吸收并入**（原 vendor 于 `src/profile/dshp/`，现内联为 `src/profile/store.js` + `src/profile/portable-format.js` 一等公民模块维护；MIT 归属声明保留于文件头） |
| dsh-buddy | [oneinitAI/dsh-buddy](https://github.com/oneinitAI/dsh-buddy) | MIT | **已引入** `skills/dsh-buddy/`（本项目作者同源仓库，原样 vendor；用户画像自适应表达技能） |

### 自研中的上游参考（文件级声明）

- `src/skills/index.js` 的注册模式（frontmatter 拆分 + `ctx.effect` + `ctx.skills.register` + 目录 resourceBase）参考 dsh-plugin-guide（Apache-2.0）的入口实现改写为多技能注册
- `src/scaffold/templates.js` 的 tool 模板改写自 dsh-plugin-dev-skills `examples/greet-tool`（MIT）；events/webui 模板依据其 `references/plugin-forms.md` 的规范示例改写为零依赖形态

**明确不引入**：`moeblack/dsh-payload-capture`（无许可证，All Rights Reserved）。
其功能由本项目清洁室自研的 `thunderforge-capture` 替代，未使用该上游任何代码。

**NOTICE**：各上游组件引入后，凡经 ThunderForge 修改的文件，在文件头注明修改内容与日期。
