#!/usr/bin/env node
// ThunderForge MCP 双端暴露（R9）：把 scaffold/upgrade/debugger/profile/release 五个模型工具
// 以 MCP (Model Context Protocol) stdio 形态暴露给非 dsh 宿主（Claude Code 等）。
//
// 设计约束：
//   - 零依赖红线：手写 stdio JSON-RPC 2.0 子集（initialize / tools/list / tools/call），
//     不引入 @modelcontextprotocol/sdk
//   - 单一事实：工具定义与执行逻辑直接来自各引擎 apply() 的注册产物，
//     不维护第二份 schema，杜绝双端漂移
//   - 无状态：每次调用即时加载引擎；capture/skills 非"工具"形态故不在此列
//
// 用法（宿主配置示例）：
//   { "command": "node", "args": ["<dsh-thunderforge>/mcp.mjs"] }
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { checkRawToolContract } from './src/contract/index.js'
import { apply as applyScaffold } from './src/scaffold/index.js'
import { apply as applyDebugger } from './src/debugger/index.js'
import { apply as applyProfile } from './src/profile/index.js'
import { apply as applyRelease } from './src/release/index.js'

const packageRoot = dirname(fileURLToPath(import.meta.url))

/** 收集各引擎注册的工具定义（mock ctx，与 tool-contract 测试同款手法）。 */
function collectTools() {
  const defs = []
  const ctxFor = (engine) => ({
    tools: {
      register: (def) => defs.push({ ...def, _engine: engine }),
    },
    on: () => {},
    effect: undefined,
    logger: () => ({ info() {}, warn() {} }),
    llm: undefined,
    skills: undefined,
  })
  // 各引擎按需注入服务；mock 只保证 tools 可用，其余由引擎自身降级处理
  for (const [engine, extra] of [
    ['scaffold', {}],
    ['debugger', {}],
    ['profile', {}],
    ['release', {}],
  ]) {
    try {
      const apply = { scaffold: applyScaffold, debugger: applyDebugger, profile: applyProfile, release: applyRelease }[engine]
      apply({ ...ctxFor(engine), ...extra })
    } catch (err) {
      process.stderr.write(`thunderforge-mcp: 引擎 ${engine} 加载失败：${err.message}\n`)
    }
  }
  return defs
}

/** 工具定义 → MCP tools/list 条目（parameters 即合规的 JSON Schema inputSchema）。 */
function toMcpTool(def) {
  return {
    name: def.name,
    description: def.description ?? '',
    inputSchema: def.parameters,
  }
}

/** 执行一个工具调用：透传 execute(args, {signal})，输出转 MCP content。 */
async function callTool(def, args) {
  const value = await def.execute(args ?? {}, {})
  if (typeof value === 'string') {
    return { content: [{ type: 'text', text: value }] }
  }
  const rendered = typeof def.output?.render === 'function' ? def.output.render(args ?? {}, value) : null
  const text = Array.isArray(rendered)
    ? rendered.map((block) => block?.text ?? '').filter(Boolean).join('\n')
    : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text }] }
}

/** 手写 MCP stdio 主循环：逐行读 JSON-RPC 请求，写回响应。 */
async function main() {
  const tools = collectTools()
  // 契约自检：定义若不符合 raw 契约，MCP 端也一定坏——启动即报，不静默
  for (const def of tools) {
    const { ok, violations } = checkRawToolContract(def, def.name)
    if (!ok) {
      process.stderr.write(`thunderforge-mcp: 工具 ${def.name} 违反契约：\n${violations.join('\n')}\n`)
    }
  }

  const readline = createInterface({ input: process.stdin })
  const respond = (id, result) => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
  }
  const respondError = (id, code, message) => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
  }

  for await (const line of readline) {
    if (!line.trim()) continue
    let req
    try {
      req = JSON.parse(line)
    } catch {
      respondError(null, -32700, 'Parse error')
      continue
    }
    const { id, method, params } = req
    try {
      if (method === 'initialize') {
        respond(id, {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'thunderforge-mcp', version: '0.1.10' },
        })
      } else if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
        // 通知无响应
      } else if (method === 'tools/list') {
        respond(id, { tools: tools.map(toMcpTool) })
      } else if (method === 'tools/call') {
        const def = tools.find((t) => t.name === params?.name)
        if (!def) {
          respondError(id, -32602, `Unknown tool: ${params?.name}`)
          continue
        }
        const result = await callTool(def, params?.arguments)
        respond(id, result)
      } else if (method === 'ping') {
        respond(id, {})
      } else {
        respondError(id, -32601, `Method not found: ${method}`)
      }
    } catch (err) {
      respondError(id, -32603, err.message ?? String(err))
    }
  }
}

main().catch((err) => {
  process.stderr.write(`thunderforge-mcp fatal: ${err.stack ?? err.message}\n`)
  process.exit(1)
})
