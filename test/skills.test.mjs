import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { apply, loadSkillDir, name as pluginName } from '../src/skills/index.js'

function mockCtx() {
  const registered = []
  const disposers = []
  return {
    registered,
    disposers,
    ctx: {
      skills: { register: (skill) => { registered.push(skill); return () => registered.pop() } },
      effect: (fn) => { disposers.push(fn()) },
    },
  }
}

test('注册五层知识库技能（入口/架构标准/坑点手册/人话模式/发布清单）', async () => {
  const { ctx, registered } = mockCtx()
  apply(ctx)
  assert.equal(pluginName, 'thunderforge-skills')
  assert.deepEqual(
    registered.map((s) => s.name).sort(),
    ['dsh-buddy', 'dsh-plugin-checklist', 'dsh-plugin-dev', 'dsh-plugin-guide', 'thunderforge-dev'],
  )
  for (const skill of registered) {
    assert.ok(skill.description?.length > 20, `${skill.name} 缺少有效 description`)
    assert.ok(skill.content?.includes('#') || skill.content?.length > 100, `${skill.name} 正文为空`)
    assert.equal(skill.source, 'bundled')
    assert.equal(skill.resourceBase?.kind, 'directory')
    await access(join(skill.resourceBase.path, 'SKILL.md'))
  }
})

test('config 可关闭单个知识层', () => {
  const { ctx, registered } = mockCtx()
  apply(ctx, { archLayer: false, pitfallsLayer: false, buddyLayer: false, checklistLayer: false })
  assert.deepEqual(registered.map((s) => s.name), ['thunderforge-dev'])
})

test('buddy 为用户画像自适应模式（无预设话术）', () => {
  const skill = loadSkillDir('dsh-buddy')
  assert.equal(skill.name, 'dsh-buddy')
  assert.ok(skill.body.includes('画像'), '核心是实时用户画像')
  assert.ok(skill.body.includes('分域'), '必须分域评估（老手也可能是新手）')
  assert.ok(skill.body.includes('每轮') || skill.body.includes('实时'), '画像必须持续更新')
  assert.ok(skill.body.includes('who is JSON'), '保留轻梗彩蛋')
  assert.ok(skill.body.includes('高估'), '拿不准时宁可略高估')
  assert.ok(skill.body.includes('装唐'), '应含言行冲突检测条款')
  assert.ok(skill.body.includes('以行为为准'), '冲突时以行为为准')
  assert.ok(!skill.body.includes('| 术语 |'), '不得包含预设术语对照表')
})

test('frontmatter 解析 name/description 并剥离元数据块', () => {
  const skill = loadSkillDir('arch-standard')
  assert.equal(skill.name, 'dsh-plugin-dev')
  assert.ok(skill.description.includes('DSH'))
  assert.ok(!skill.body.startsWith('---'))
  assert.ok(skill.body.length > 500, '正文应保留完整内容')
})

test('入口技能评测集完整且正负例齐备（train/validation 双集）', async () => {
  const { readFile } = await import('node:fs/promises')
  const evals = JSON.parse(
    await readFile(join(import.meta.dirname, '..', 'skills', 'thunderforge-dev', 'evals', 'trigger-queries.json'), 'utf8'),
  )
  assert.equal(evals.skill, 'thunderforge-dev')
  const all = [...(evals.train_queries ?? []), ...(evals.validation_queries ?? [])]
  const positives = all.filter((q) => q.should_trigger)
  const negatives = all.filter((q) => !q.should_trigger)
  assert.ok(evals.train_queries.length >= 8, `train 集应有 ≥8 条，实际 ${evals.train_queries.length}`)
  assert.ok(evals.validation_queries.length >= 4, `validation 集应有 ≥4 条，实际 ${evals.validation_queries.length}`)
  assert.ok(positives.length >= 8, `总正例应 ≥8，实际 ${positives.length}`)
  assert.ok(negatives.length >= 6, `总负例应 ≥6，实际 ${negatives.length}`)
})

test('入口技能正文索引到全部工具与知识层', () => {
  const skill = loadSkillDir('thunderforge-dev')
  for (const keyword of [
    'dsh-plugin-dev',
    'dsh-plugin-guide',
    'dsh-buddy',
    'thunderforge_scaffold',
    'thunderforge_debugger',
    'thunderforge_profile',
    'thunderforge-capture',
  ]) {
    assert.ok(skill.body.includes(keyword), `入口技能应索引 ${keyword}`)
  }
  assert.ok(skill.body.includes('之前'), '应含 capture 层序提示')
})

test('技能遵循正统规范（imperative description + 评测集 train/validation）', async () => {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  for (const dir of ['thunderforge-dev', 'dsh-buddy', 'plugin-checklist']) {
    const skill = loadSkillDir(dir)
    assert.ok(skill.description.startsWith('Use when'), `${dir}: description 应以 imperative \"Use when\" 开头`)
    assert.ok(skill.description.includes('Not for'), `${dir}: 应写清 Not for 边界防误触发`)
    assert.ok(skill.body.length < 10000, `${dir}: 主 SKILL.md 应控制在渐进式披露的紧凑篇幅`)
    const evals = JSON.parse(
      await readFile(join(import.meta.dirname, '..', 'skills', dir, 'evals', 'trigger-queries.json'), 'utf8'),
    )
    assert.ok(Array.isArray(evals.train_queries), `${dir}: 评测集应含 train_queries（防过拟合划分）`)
    assert.ok(Array.isArray(evals.validation_queries), `${dir}: 评测集应含 validation_queries`)
    const positives = [...evals.train_queries, ...evals.validation_queries].filter((q) => q.should_trigger)
    const negatives = [...evals.train_queries, ...evals.validation_queries].filter((q) => !q.should_trigger)
    assert.ok(positives.length >= 8, `${dir}: 正例应 ≥8（含隐式触发）`)
    assert.ok(negatives.length >= 6, `${dir}: 负例应 ≥6（含易混淆近邻）`)
  }
})
