# Trigger evals

<p align="center">
  <samp>
    <strong>English</strong> ·
    <a href="./README.md">中文</a>
  </samp>
</p>

Regression set for the skill's `description`, following the methodology from the Agent Skills guide ["Optimizing skill descriptions"](https://agentskills.io/skill-creation/optimizing-descriptions).

## The eval set

`trigger-queries.json` holds 12 should-trigger and 9 should-not-trigger queries:

- **Should-trigger** queries vary phrasing, formality, typos, Chinese/English, and explicit vs implicit references ("add a tool that reads files" never mentions DSH), plus multi-step workflows (packaging, workspace packages).
- **Should-not-trigger** queries mix clearly unrelated domains (weather, translation, SQL, Chrome extensions, GitHub Actions) with **confusable neighbors** (Koishi — also Cordis-based, but a different framework; Claude Code hooks config — another skill's domain).

## Running

1. Send each query to the target agent and record whether this skill was invoked (in DSH, check with the `skill` tool; in Claude Code, use `--output-format json` and inspect `Skill` tool calls, as in the official guide's example script).
2. A query passes when `should_trigger` matches actual triggering. Pass rate = passed / total.
3. Run each query 2-3 times and take the majority (triggering is stochastic).

## Train/validation split (avoid overfitting)

- **Train set (~60%)**: find failures and guide description changes.
- **Validation set (~40%)**: check whether changes generalize; keep it out of the revision process.
- When revising: positive misses mean the description is too narrow (add usage contexts); false triggers mean it is too broad (state the boundary). Never copy keywords from failing queries — find the category they represent. Pick the best version by validation pass rate, which may not be the last one.

## Recording

Log pass rates with every description change, e.g. in the commit message: `evals: zh 12/12, en 3/3, negatives 9/9`.
