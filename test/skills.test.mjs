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

test('注册四层知识库技能（入口/架构标准/坑点手册/人话模式）', async () => {
  const { ctx, registered } = mockCtx()
  apply(ctx)
  assert.equal(pluginName, 'thunderforge-skills')
  assert.deepEqual(
    registered.map((s) => s.name).sort(),
    ['dsh-buddy', 'dsh-plugin-dev', 'dsh-plugin-guide', 'thunderforge-dev'],
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
  apply(ctx, { archLayer: false, pitfallsLayer: false, buddyLayer: false })
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

test('入口技能评测集完整且正负例齐备', async () => {
  const { readFile } = await import('node:fs/promises')
  const evals = JSON.parse(
    await readFile(join(import.meta.dirname, '..', 'skills', 'thunderforge-dev', 'evals', 'trigger-queries.json'), 'utf8'),
  )
  assert.equal(evals.skill, 'thunderforge-dev')
  const positives = evals.queries.filter((q) => q.should_trigger)
  const negatives = evals.queries.filter((q) => !q.should_trigger)
  assert.ok(positives.length >= 12, `正例应不少于 12，实际 ${positives.length}`)
  assert.ok(negatives.length >= 6, `负例应不少于 6，实际 ${negatives.length}`)
})

test('入口技能正文索引到两个知识层与锻造工具', () => {
  const skill = loadSkillDir('thunderforge-dev')
  for (const keyword of ['dsh-plugin-dev', 'dsh-plugin-guide', 'thunderforge_scaffold', 'thunderforge-capture']) {
    assert.ok(skill.body.includes(keyword), `入口技能应索引 ${keyword}`)
  }
})
