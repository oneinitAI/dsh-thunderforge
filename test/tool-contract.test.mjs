// 真机契约测试：固化 dsh ctx.tools.register 的实际校验规则。
// 这些规则来自真实运行时报错（见 CHANGELOG 0.1.6），mock 单测测不出，必须显式断言。
//
// 规则实现已提炼为可复用的自检库 src/contract/index.js（R6）——本测试吃自己的狗粮：
// 对 ThunderForge 自身注册的全部工具与骨架模板产物跑 checkRawToolContract，
// 确保库的规则与仓库工具的实现永不漂移；规则细节的正反例见 test/contract.test.mjs。
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRawToolContract } from '../src/contract/index.js'
import { apply as applyScaffold } from '../src/scaffold/index.js'
import { apply as applyDebugger } from '../src/debugger/index.js'
import { apply as applyProfile } from '../src/profile/index.js'
import { scaffoldFiles } from '../src/scaffold/templates.js'

function collect(apply, name) {
  const defs = []
  apply({ tools: { register: (d) => defs.push(d) } })
  assert.equal(defs.length, 1, `${name} 应注册恰好 1 个工具`)
  return defs[0]
}

function assertCompliant(tool, source) {
  const { ok, violations } = checkRawToolContract(tool, source)
  assert.equal(ok, true, `${source} 违反真机契约：\n${violations.join('\n')}`)
}

test('真机契约：scaffold/debugger/profile 三个工具全部合规', () => {
  assertCompliant(collect(applyScaffold, 'scaffold'), 'thunderforge_scaffold')
  assertCompliant(collect(applyDebugger, 'debugger'), 'thunderforge_debugger')
  assertCompliant(collect(applyProfile, 'profile'), 'thunderforge_profile')
})

test('真机契约：tool 模板生成的工具合规（写入临时目录校验）', async () => {
  const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'tf-contract-'))
  try {
    for (const [path, body] of scaffoldFiles({ pluginName: 'contract-probe', template: 'tool' })) {
      await mkdir(join(dir, path, '..'), { recursive: true })
      await writeFile(join(dir, path), body, 'utf8')
    }
    const mod = await import(`file://${join(dir, 'index.js').replaceAll('\\', '/')}`)
    const defs = []
    mod.apply({ tools: { register: (d) => defs.push(d) } })
    assertCompliant(defs[0], '模板工具')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
