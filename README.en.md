<div align="center">

### ⚡ ThunderForge · The Universe-Invincible Thunder-Lightning Dazzling

<sub><sub><sub>aspiring to be</sub></sub></sub>

# The best DSH plugin $0 can buy<sup>\*</sup>

<sub><sub><sub>*"The best DSH plugin $0 can buy" is a product goal — not a promise of being best, becoming best, or ever being evaluated as best. "$0 and under" refers to this plugin's price bracket and does not imply a competitive $0.01 tier exists. Interpretation rights belong to the weather.</sub></sub></sub>

**All-in-one plugin development suite for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) · a single Bundle**

[中文](./README.md) · **English**

[![CI](https://github.com/oneinitAI/dsh-thunderforge/actions/workflows/ci.yml/badge.svg)](https://github.com/oneinitAI/dsh-thunderforge/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-59%2F59-brightgreen)](https://github.com/oneinitAI/dsh-thunderforge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-4D6BFE.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.19-339933.svg)](./package.json)
[![dsh](https://img.shields.io/badge/DSH-0.1.1--rc.2-7C3AED.svg)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![npm](https://img.shields.io/npm/v/dsh-thunderforge.svg)](https://www.npmjs.com/package/dsh-thunderforge)

**Create → Develop → Debug → Verify → Ship** — one `dsh plugin add`, the whole forge lights up ⚡

<sub>Keep dreaming — lightning might just pick you</sub>

</div>

---

## 🔥 Six Forging Engines

| Engine | Form | In one line |
|---|---|---|
| ⚡ **thunderforge-capture** | Plugin | LLM payload capture: transparent proxy + secret redaction + rotation + an `index.jsonl` stream (clean-room implementation) |
| 🧠 **thunderforge-skills** | Skill ×5 | Five-layer knowledge base: entry index + architecture standard + pitfalls handbook + **portrait-adaptive communication** ([dsh-buddy](https://github.com/oneinitAI/dsh-buddy)) + **release checklist** |
| 🔨 **thunderforge-scaffold** | Model tools | Conversational scaffolder: four zero-dependency templates (tool / events / webui / llm-adapter), **smoke-tested the moment they're generated**, plus an upgrade advisor for older skeletons |
| 🔍 **thunderforge-debugger** | Model tool | Dual-source trajectory waterfall: session logs × capture payloads aligned by the millisecond; browse, diff two payloads, watch live, token cost rollup |
| 🧰 **thunderforge-profile** | Model tool | Profile management + one-shot dev presets (only ever creates new dirs — never touches your existing setups) |
| 🚢 **thunderforge-release** | Model tool | Publish gate: smoke + raw-registration contract check + zero-harness dependency rule + changelog consistency, with manual steps left to the human |

Also exportable: `dsh-thunderforge/contract` — the real-machine tool-contract checker as a pure function library, and `mcp.mjs` — an MCP stdio entry exposing five tools to non-dsh hosts.

## 🚀 Installation

```bash
# from npm (recommended)
dsh plugin --profile <profile> add dsh-thunderforge
# or from GitHub
dsh plugin --profile <profile> add github:oneinitAI/dsh-thunderforge
# or a local directory (developers)
dsh plugin --profile <profile> add /path/to/dsh-thunderforge
```

**Restart the target app** after installing (profiles compose at boot; for web, restart `dsh web`), then verify:

```bash
dsh --profile <profile> --dump-config    # should show a "# == dsh-thunderforge" layer
```

Removal is always reversible: `dsh plugin --profile <profile> remove dsh-thunderforge`

> ⚠️ **Layer order (critical for capture)**: after installing into an **existing** profile, move `dsh-thunderforge` to the **front** of the profile's `dsh.profile.bundles` array (before `@deepseek-ai/dsh-base`) — capture wraps adapter registration and silently misses if applied after base. Presets made via `thunderforge_profile` are ordered correctly already.

Then just tell your agent:

> Build me a DSH plugin with a webui — it invokes `thunderforge_scaffold`; the skeleton ships with debug instrumentation and smoke tests, verified as it lands.

A clean dev environment in one line:

```
You: create a dev preset named demo
AI:  (thunderforge_profile) → tf-dev-demo ready
     dsh plugin --profile tf-dev-demo add <your-plugin> && dsh --profile tf-dev-demo
```

## 🛠️ The Forging Journey

```
  Create ──► Develop ──► Debug ──────────► Verify ───────► Ship
 scaffold    skills      capture +         dev preset      release gate +
  smoke on   on demand   debugger          clean profile    checklist skill
  generate               dual-source ⚡    create-only ✅   human owns publish ✅
```

- Each step's output feeds the next: the skeleton's `thunderforge.debug.json` declares the capture index stream and event prefix, which the debugger consumes directly.
- Real-runtime acceptance: `plugin add` + `--dump-config` on dsh `0.1.1-rc.2` loads every row ✅ (including one patch-format bug caught — and fixed — by the real CLI).

## 📦 Status

- ✅ `node --test` 59/59 (incl. real-machine contract tests); all four templates generate-and-smoke
- ✅ Real-runtime verified end to end: conversation → scaffold → capture persisted → aligned waterfall
- ✅ Live skill-trigger evals: train 6/6, validation 4/4 (sampled in a web session)
- 🙋 Try it yourself: `dsh --profile <your-profile> "invoke thunderforge_scaffold ..."`

## 📚 Docs

| Doc | Content |
|---|---|
| [HANDOFF](./docs/HANDOFF.md) | Handover guide: overview, architecture constraints, release flow (**read this first**) |
| [DEVELOPMENT](./docs/DEVELOPMENT.md) | Architecture decisions + code map + testing philosophy + skill authoring canon |
| [ROADMAP](./docs/ROADMAP.md) | Roadmap: improvement & expansion candidates (all shipped) |
| [PRD](./docs/PRD.md) | Phased product plan & acceptance records |
| [RELEASE](./docs/RELEASE.md) | Release checklist & one-shot release |
| [NETWORK-NOTES](./docs/NETWORK-NOTES.md) | Network troubleshooting manual |
| [CONFIGURATION](./docs/CONFIGURATION.md) | Configuration guide: every config key across the six engines and buddy, override recipes |

## 🙏 Acknowledgements & Upstream Licenses (required reading)

ThunderForge stands on the shoulders of community giants and **strictly respects the open-source license of every upstream repository**:

| Upstream | License | Role in ThunderForge |
|---|---|---|
| [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | MIT | The runtime foundation and source of official conventions |
| [dsh-plugin-dev-skills](https://github.com/zimodzh/dsh-plugin-dev-skills) | MIT | **Vendored verbatim** → `skills/arch-standard/` (upstream license text included) |
| [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | Apache-2.0 | **Vendored verbatim** → `skills/pitfalls/` (license & NOTICE retained) |
| [dsh-replay](https://github.com/zoahdev/dsh-replay) | MIT | **Vendored verbatim** → `src/debugger/session-log.js` (provenance header) |
| [dshp](https://github.com/asdf17128/dshp) | MIT | **Vendored verbatim** → `src/profile/dshp/` (provenance header) |
| [dsh-trajectory-debug](https://github.com/devmom/dsh-trajectory-debug) | MIT | Concept reference (no code vendored), recorded in the ledger |

- All vendored files are **unmodified** — only a provenance header is prepended; every upstream license text ships with the package (see [`LICENSES/`](./LICENSES)).
- The Apache-2.0 component keeps its license and NOTICE at file level, as its license requires.
- An unlicensed payload-capture component exists in the ecosystem; ThunderForge explicitly does **not** include it — its function is clean-room implemented here, with none of its code used or consulted.

## 📄 License

[MIT](./LICENSE) © 2026 ThunderForge Contributors

Provided "as is"; claims regarding upstream components remain governed by their original licenses. Full ledger: [`LICENSES/README.md`](./LICENSES/README.md).
