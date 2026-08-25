// ThunderForge 用户级配置存储：Web 设置面板写入、各引擎启动时合并。
// 优先级（高→低）：cordis patch 行 config > 本文件 > 引擎内置默认。
// 文件损坏时静默回退为空（fail-open），绝不阻塞 boot。
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function settingsPath() {
  return process.env.DSH_HOME ? join(process.env.DSH_HOME, 'thunderforge-config.json') : join(homedir(), '.dsh', 'thunderforge-config.json')
}

let cached = null

/** 读取全部用户级覆盖（按引擎 id 分组）。同步版本供 apply 使用。 */
export function readUserSettingsSync() {
  if (cached) return cached
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    cached = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    cached = {}
  }
  return cached
}

/** 测试与写路径用：清空缓存。 */
export function invalidateCache() {
  cached = null
}

export async function readUserSettings() {
  return readUserSettingsSync()
}
