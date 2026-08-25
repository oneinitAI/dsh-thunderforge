import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../index.js'

test('插件注册演示工具', () => {
  const registered = []
  apply({ tools: { register: (def) => registered.push(def) } })
  assert.equal(name, 'example-note')
  assert.deepEqual(inject, ['tools'])
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'example_note_greet')
})

test('execute 返回问候', async () => {
  const registered = []
  apply({ tools: { register: (def) => registered.push(def) } })
  const out = await registered[0].execute({ name: 'Thunder' })
  assert.equal(out.greeting, 'Hello, Thunder!')
})

test('execute 拒绝空名（原始注册自校验）', async () => {
  const registered = []
  apply({ tools: { register: (def) => registered.push(def) } })
  await assert.rejects(() => registered[0].execute({ name: '' }))
})
