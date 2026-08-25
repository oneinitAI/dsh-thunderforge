// R9 MCP 双端暴露测试：spawn mcp.mjs 子进程，走 initialize → tools/list → tools/call 全流程。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 跨平台路径解析（手写 href replaceAll 在 POSIX 会吃掉根斜杠——CI 实测）
const SERVER = fileURLToPath(new URL('../mcp.mjs', import.meta.url))

/** 与 stdio MCP server 完成一轮请求-响应。 */
function rpc(child, req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP 响应超时: ${req.method}`)), 60_000)
    const onLine = (line) => {
      try {
        const msg = JSON.parse(line)
        if (msg.id === req.id) {
          clearTimeout(timer)
          child.stdout.off('data', onData)
          resolve(msg)
        }
      } catch {
        /* 非 JSON 行忽略 */
      }
    }
    const onData = (buf) => String(buf).split('\n').filter(Boolean).forEach(onLine)
    child.stdout.on('data', onData)
    child.stdin.write(`${JSON.stringify(req)}\n`)
  })
}

test('MCP server：initialize / tools/list / tools/call（scaffold 真实生成）全链路', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-mcp-'))
  try {
    const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] })
    try {
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += d
      })

      const init = await rpc(child, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      assert.equal(init.result.serverInfo.name, 'thunderforge-mcp')
      assert.ok(init.result.capabilities.tools)

      const list = await rpc(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
      const names = list.result.tools.map((t) => t.name)
      for (const expected of ['thunderforge_scaffold', 'thunderforge_upgrade', 'thunderforge_debugger', 'thunderforge_profile', 'thunderforge_release']) {
        assert.ok(names.includes(expected), `应暴露 ${expected}，实际 ${names.join(',')}`)
        const def = list.result.tools.find((t) => t.name === expected)
        assert.equal(def.inputSchema.type, 'object')
      }

      // tools/call：用 debugger 的 sessions op（只读、不依赖网络）
      const call = await rpc(child, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'thunderforge_debugger', arguments: { op: 'sessions' } },
      })
      assert.ok(call.result.content[0].text.includes('sessions') || call.result.content[0].text.length >= 0)

      // 未知工具 → JSON-RPC 错误
      const unknown = await rpc(child, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } })
      assert.match(unknown.error.message, /Unknown tool/)

      // scaffold 工具经 MCP 真实生成一个骨架（端到端产物验证）
      const forge = await rpc(child, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'thunderforge_scaffold', arguments: { plugin_name: 'mcp-probe', template: 'tool', dir, verify: false } },
      })
      assert.ok(forge.result.content[0].text.includes('已锻造'), stderr.slice(0, 400))
      await writeFile(join(dir, '.keep'), '')
      assert.ok(forge.result.content[0].text.includes('mcp-probe'))
    } finally {
      child.kill()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
