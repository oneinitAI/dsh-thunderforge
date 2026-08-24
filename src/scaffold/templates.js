// ThunderForge scaffold 模板：生成带调试埋点与冒烟测试的 DSH 插件骨架。
// 模板依据 dsh-plugin-dev 技能的规范（examples/greet-tool、references/plugin-forms.md）
// 改写为零依赖形态（原始 JSON Schema 工具注册），骨架在任何机器上无需安装依赖即可通过冒烟。
// 上游 dsh-plugin-dev-skills 为 MIT（台账见 LICENSES/README.md）。
import { VERSION } from '../capture/core.js'

export const TEMPLATES = ['tool', 'events', 'webui']
export const PLUGIN_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function packageJson({ pkgName, description }) {
  return `${JSON.stringify(
    {
      name: pkgName,
      version: '0.1.0',
      description,
      type: 'module',
      main: 'index.js',
      files: ['index.js', 'cordis.patch.yml', 'test', 'thunderforge.debug.json'],
      scripts: { test: 'node --test' },
      license: 'UNLICENSED',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    },
    null,
    2,
  )}\n`
}

function patchYml({ pluginName }) {
  return `# ${pluginName} 的配置层：本包贡献的插件行。
- insert:
    - id: ${pluginName}
      name: dsh-${pluginName}
      # 载荷捕获（可选）：宿主 profile 安装 dsh-thunderforge 后，
      # thunderforge-capture 行先于本行应用即可捕获本插件的模型调用。
`
}

function debugManifest({ pluginName, template, now }) {
  return `${JSON.stringify(
    {
      version: 1,
      scaffoldedBy: `thunderforge-scaffold@${VERSION}`,
      template,
      scaffoldedAt: now,
      instrumentation: {
        capture: {
          bundle: 'dsh-thunderforge/capture',
          indexStream: 'index.jsonl',
          record: 'NNNNNN-*.json',
        },
        events: { prefix: `${pluginName}/` },
        smoke: { command: 'npm test', runner: 'node --test test/' },
      },
    },
    null,
    2,
  )}\n`
}

function readme({ pluginName, pkgName, template, toolName }) {
  const specifics =
    template === 'tool'
      ? `- 演示工具 \`${toolName}\` 已注册（原始 JSON Schema 写法，零依赖）\n- 升级为 \`defineTool\` 类型化写法：查 dsh-plugin-dev 技能 references/tools.md`
      : template === 'events'
        ? '- 已挂 tools/pre-execute 门禁（waterfall，记得调用 next()）；替换成你的策略\n- 事件系统五种分发模式：查 dsh-plugin-dev 技能 references/events.md'
        : '- 已订阅 session/event 文本增量并汇入 debugChunks；把 render 接到你的 UI\n- UI 插件形态参考：查 dsh-plugin-dev 技能 references/plugin-forms.md'
  return `# dsh-${pluginName}

由 ThunderForge scaffold 生成的 DSH 插件骨架（模板：\`${template}\`）。

## 开发

${specifics}
- 架构规范/坑点：agent 会话里加载 \`thunderforge-dev\` / \`dsh-plugin-dev\` / \`dsh-plugin-guide\` 技能

## 验证

\`\`\`bash
npm test        # 冒烟：加载校验 + node --test
\`\`\`

发布前建议自检工具定义是否符合真机契约（output 必填、schema 类型白名单、additionalProperties 等）：
宿主安装 dsh-thunderforge 后可用 \`import { checkRawToolContract } from 'dsh-thunderforge/contract'\`，
把注册的工具定义传入即可得到违规清单与修法提示。

## 调试埋点

\`thunderforge.debug.json\` 声明了本骨架的埋点约定：宿主启用 thunderforge-capture 后，
模型调用的载荷按 \`index.jsonl\` 索引流落盘，可与本插件的事件（前缀 \`${pluginName}/\`）对齐排查。

## 安装（开发期）

\`\`\`bash
dsh plugin --profile demo add ./
dsh --profile demo --dump-config   # 应出现 "# == ${pkgName}" 层
\`\`\`
`
}

function ciYml() {
  return `name: ci
on: [push, pull_request]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node --test test/
`
}

function toolIndex({ pluginName, toolName }) {
  return `// 由 ThunderForge scaffold 生成的最小工具插件骨架（零依赖）。
// 注册基于副作用：dispose 插件 fiber 即注销工具。
export const name = '${pluginName}'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: '${toolName}',
    description: 'Greet someone by name. Replace with your own tool.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name to greet' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    // raw 注册必须声明 output（schema + render）；'json' 是 defineTool 专用糖，raw 不支持
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    // 原始 JSON Schema 注册需自行校验输入
    async execute(args) {
      if (typeof args?.name !== 'string' || !args.name) {
        throw new Error('name must be a non-empty string')
      }
      return { greeting: 'Hello, ' + args.name + '!' }
    },
  })
}
`
}

function eventsIndex({ pluginName }) {
  return `// 由 ThunderForge scaffold 生成的钩子插件骨架：tools/pre-execute 权限门禁示例。
// waterfall 监听器必须调用 next() 放行（或返回 deny 短路）。
export const name = '${pluginName}'

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    // 示例策略：拒绝名字以 demo-blocked 开头的调用；替换成你的策略
    if (String(exec?.name ?? '').startsWith('demo-blocked')) {
      return { kind: 'deny', reason: 'Denied by ${pluginName} policy.' }
    }
    return next()
  })
}
`
}

function webuiIndex({ pluginName }) {
  return `// 由 ThunderForge scaffold 生成的 UI 插件骨架：订阅会话文本增量。
export const name = '${pluginName}'
export const inject = ['agents']

// 调试可见的增量缓冲；接到真实 UI 后删除
export const debugChunks = []

export function apply(ctx) {
  const render = (text) => {
    debugChunks.push(text)
    // TODO: 把 text 渲染到你的界面（侧边栏卡片 / Web 面板 / 通知）
  }

  ctx.on('session/event', (_session, event) => {
    if (event?.type === 'assistant/chunk' && event?.data?.chunk?.type === 'text-delta') {
      render(event.data.chunk.text)
    }
  })
}
`
}

function toolTest({ pluginName, toolName }) {
  return `import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../index.js'

test('插件注册演示工具', () => {
  const registered = []
  apply({ tools: { register: (def) => registered.push(def) } })
  assert.equal(name, '${pluginName}')
  assert.deepEqual(inject, ['tools'])
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, '${toolName}')
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
`
}

function eventsTest({ pluginName }) {
  return `import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, name } from '../index.js'

test('插件挂载 pre-execute 门禁', async () => {
  const handlers = {}
  apply({ on: (event, fn) => { handlers[event] = fn } })
  assert.equal(name, '${pluginName}')
  assert.ok(handlers['tools/pre-execute'])

  let nextCalled = false
  const allowed = await handlers['tools/pre-execute'](
    { name: 'safe_tool' },
    async () => { nextCalled = true; return { kind: 'allow' } },
  )
  assert.equal(nextCalled, true, '放行路径必须调用 next()')
  assert.deepEqual(allowed, { kind: 'allow' })

  const denied = await handlers['tools/pre-execute'](
    { name: 'demo-blocked-x' },
    async () => ({ kind: 'allow' }),
  )
  assert.equal(denied.kind, 'deny')
})
`
}

function webuiTest({ pluginName }) {
  return `import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, debugChunks, name } from '../index.js'

test('插件订阅会话文本增量', () => {
  const handlers = {}
  apply({ on: (event, fn) => { handlers[event] = fn } })
  assert.equal(name, '${pluginName}')
  assert.ok(handlers['session/event'])

  handlers['session/event'](null, {
    type: 'assistant/chunk',
    data: { chunk: { type: 'text-delta', text: 'thunder' } },
  })
  handlers['session/event'](null, {
    type: 'assistant/chunk',
    data: { chunk: { type: 'usage' } },
  })
  assert.deepEqual(debugChunks.slice(-1), ['thunder'])
})
`
}

/**
 * 生成一套骨架的全部文件。返回 [相对路径, 内容] 数组。
 * @param {{pluginName: string, template: string, description?: string}} options
 */
export function scaffoldFiles({ pluginName, template, description }) {
  if (!PLUGIN_NAME_RE.test(pluginName)) {
    throw new Error(`INVALID_PLUGIN_NAME: ${pluginName} 不是 kebab-case`)
  }
  if (!TEMPLATES.includes(template)) {
    throw new Error(`INVALID_TEMPLATE: ${template}，可选 ${TEMPLATES.join('/')}`)
  }
  const pkgName = `dsh-${pluginName}`
  const toolName = `${pluginName.replaceAll('-', '_')}_greet`
  const ctx = {
    pluginName,
    pkgName,
    template,
    toolName,
    description: description ?? `DSH plugin skeleton (${template}) forged by ThunderForge`,
    now: new Date().toISOString(),
  }
  const entries = {
    tool: toolIndex,
    events: eventsIndex,
    webui: webuiIndex,
  }
  const tests = {
    tool: toolTest,
    events: eventsTest,
    webui: webuiTest,
  }
  return [
    ['package.json', packageJson(ctx)],
    ['cordis.patch.yml', patchYml(ctx)],
    ['index.js', entries[template](ctx)],
    ['test/smoke.test.mjs', tests[template](ctx)],
    ['thunderforge.debug.json', debugManifest(ctx)],
    ['README.md', readme(ctx)],
    ['.github/workflows/ci.yml', ciYml()],
  ]
}
