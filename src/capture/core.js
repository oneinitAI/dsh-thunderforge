// ThunderForge capture 核心：LLM 载荷捕获的纯逻辑与存储层。
// 零运行时依赖，Node >= 22.19，ESM。
// 本文件为清洁室实现：仅依据 DSH 公开的 LLM 适配器协议（GenerateOptions / StreamChunk）
// 与插件规范编写，未参考任何无许可证上游组件的代码。
import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const VERSION = '0.1.0'

export const DEFAULTS = Object.freeze({
  enabled: true,
  // 空串 → $DSH_HOME/thunderforge-capture（无 DSH_HOME 时 ~/.dsh/thunderforge-capture，
  // 与 sessions/profiles 同级，符合 DSH 数据心智；v0.1.7 及以前是 ./.thunderforge-capture）
  dir: '',
  // 空数组 → 捕获全部 provider
  providers: [],
  // 掩码疑似密钥/凭证的字符串字段
  redact: true,
  // 额外记录原始 StreamChunk 分片序列（调试协议本身时才需要）
  captureDeltas: false,
  // 单个字符串最大保留长度，0 = 不截断
  maxStringLength: 0,
  // 保留的捕获文件数上限，0 = 不限
  maxFiles: 2000,
  // 捕获目录总字节上限，0 = 不限
  maxTotalBytes: 0,
  // 每多少次写入执行一次清理
  pruneEvery: 50,
  // 协议失效守卫：已包装适配器但超过该时长仍零捕获时输出警告（毫秒；0 = 关闭）。
  // 静默失效是 capture 最大的敌人——dsh LLM 适配器协议变更（如两步 prepareCall 化）
  // 曾让 v0.1.6 及以前完全丢数据且无任何报错。
  staleWarnMs: 300000,
})

const REDACT_RE = /(?:api[-_]?key|secret|token|authorization|password|credential)/i

export function initConfig(userConfig = {}) {
  const config = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    if (userConfig?.[key] !== undefined) config[key] = userConfig[key]
  }
  if (!config.dir) {
    // 与 dsh 的 resolveDshHome 口径一致（内联实现，避免跨模块耦合）
    const home = process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
    config.dir = join(home, 'thunderforge-capture')
  } else {
    config.dir = resolve(config.dir)
  }
  return config
}

// 生成可 JSON 化的请求快照：丢弃 signal、函数、不可序列化值；
// 按 redact/maxStringLength 策略清洗。无法序列化时返回 { serializeError }，
// 捕获本身绝不能因为请求对象异常而打断模型流。
export function sanitize(value, config) {
  const replacer = (key, val) => {
    if (key === 'signal') return undefined
    if (typeof val === 'function') return '[Function]'
    if (typeof val === 'bigint') return `${val}n`
    if (config.redact && key && REDACT_RE.test(key) && typeof val === 'string') {
      return '***REDACTED***'
    }
    if (
      typeof val === 'string' &&
      config.maxStringLength > 0 &&
      val.length > config.maxStringLength
    ) {
      return `${val.slice(0, config.maxStringLength)}…[+${val.length - config.maxStringLength} chars]`
    }
    return val
  }
  try {
    return JSON.parse(JSON.stringify(value ?? null, replacer))
  } catch (err) {
    return { serializeError: `${err.name}: ${err.message}` }
  }
}

// StreamChunk 聚合器：block-end 携带完整块，usage 先于 finish，finish 是最后分片。
// 只关心终态数据；delta 细节由 CaptureRecord 按需另存。
export function createAggregator() {
  const state = { blocks: [], usage: null, finish: null, chunkCount: 0 }
  return {
    push(chunk) {
      state.chunkCount++
      if (!chunk || typeof chunk !== 'object') return
      if (chunk.type === 'block-end') {
        state.blocks.push(chunk.block ?? { type: `unknown:${chunk.blockType ?? 'none'}` })
      } else if (chunk.type === 'usage') {
        state.usage = chunk.usage ?? null
      } else if (chunk.type === 'finish') {
        state.finish = chunk.reason ?? null
      }
    },
    snapshot() {
      const { blocks, usage, finish, chunkCount } = state
      return { blocks, usage, finish, chunkCount }
    },
  }
}

function slug(input) {
  return String(input ?? '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown'
}

class CaptureRecord {
  constructor(store, providers, options) {
    this.store = store
    this.providers = providers
    this.request = sanitize(options, store.config)
    this.provider = providers[0] ?? 'unknown'
    this.model = typeof options?.model === 'string' ? options.model : 'unknown'
    this.aggregator = createAggregator()
    this.deltas = store.config.captureDeltas ? [] : null
    this.error = null
    this.startedAt = Date.now()
  }

  push(chunk) {
    this.aggregator.push(chunk)
    if (this.deltas) this.deltas.push(chunk)
  }

  fail(err) {
    this.error = err
      ? { name: err.name ?? 'Error', message: err.message ?? String(err), code: err.code ?? null }
      : null
  }

  finalize() {
    return this.store.commit(this).catch((err) => this.store.warn(err))
  }
}

export class CaptureStore {
  constructor(config, onWarn = () => {}) {
    this.config = config
    this.warn = onWarn
    this.seq = 0
    this.dirReady = null
    this.written = []
    this.writesSincePrune = 0
    // 协议失效守卫计数：wrapped = 走过包装的适配器注册数；committed = 成功落盘的捕获数。
    // wrapped > 0 且 committed === 0 持续到 staleWarnMs 即视为协议可能失配（见 index.js 的守卫定时器）。
    this.wrapped = 0
    this.committed = 0
  }

  shouldCapture(providers) {
    if (!this.config.enabled) return false
    const allow = this.config.providers
    if (!allow.length) return true
    return providers.some((provider) => allow.includes(provider))
  }

  begin(providers, options) {
    return new CaptureRecord(this, providers, options)
  }

  async ensureDir() {
    this.dirReady ??= mkdir(this.config.dir, { recursive: true }).catch((err) => {
      this.dirReady = null
      throw err
    })
    return this.dirReady
  }

  async commit(record) {
    await this.ensureDir()
    this.seq += 1
    const seq = this.seq
    const ts = new Date().toISOString()
    const snapshot = record.aggregator.snapshot()
    const finishedWithError = record.error !== null || snapshot.finish?.kind === 'error'
    const file = `${String(seq).padStart(6, '0')}-${ts.replaceAll(/[:.]/g, '-')}-${slug(record.provider)}-${slug(record.model)}.json`
    const payload = {
      capture: {
        tool: `thunderforge-capture@${VERSION}`,
        seq,
        ts,
        providers: record.providers,
        model: record.model,
        ok: !finishedWithError,
        durationMs: Date.now() - record.startedAt,
        chunkCount: snapshot.chunkCount,
      },
      request: record.request,
      response: {
        blocks: snapshot.blocks,
        usage: snapshot.usage,
        finish: snapshot.finish,
      },
      error: record.error,
    }
    if (record.deltas) payload.deltas = record.deltas
    const body = `${JSON.stringify(payload, null, 2)}\n`
    await writeFile(join(this.config.dir, file), body, 'utf8')
    await appendFile(
      join(this.config.dir, 'index.jsonl'),
      `${JSON.stringify({
        seq,
        ts,
        file,
        provider: record.provider,
        model: record.model,
        ok: payload.capture.ok,
        durationMs: payload.capture.durationMs,
      })}\n`,
      'utf8',
    )
    this.written.push({ seq, file, bytes: Buffer.byteLength(body) })
    this.committed += 1
    this.writesSincePrune += 1
    if (this.writesSincePrune >= this.config.pruneEvery) {
      this.writesSincePrune = 0
      await this.prune()
    }
    return payload
  }

  // 清理仅针对本工具写出的捕获文件；删除失败静默（force: true 已容忍不存在）。
  async prune() {
    const { maxFiles, maxTotalBytes } = this.config
    if (!maxFiles && !maxTotalBytes) return
    let keep = [...this.written].sort((a, b) => a.seq - b.seq)
    const drop = []
    if (maxFiles > 0 && keep.length > maxFiles) {
      drop.push(...keep.slice(0, keep.length - maxFiles))
      keep = keep.slice(drop.length)
    }
    if (maxTotalBytes > 0) {
      let total = keep.reduce((sum, item) => sum + item.bytes, 0)
      while (total > maxTotalBytes && keep.length) {
        const item = keep.shift()
        total -= item.bytes
        drop.push(item)
      }
    }
    if (!drop.length) return
    const dropped = new Set(drop)
    this.written = keep.filter((item) => !dropped.has(item))
    await Promise.allSettled(drop.map((item) => rm(join(this.config.dir, item.file), { force: true })))
  }
}
