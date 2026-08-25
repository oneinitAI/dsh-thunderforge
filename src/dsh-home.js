// DeepSeek Harness home 解析（单一来源）。
// 镜像 dsh 自身的 resolveDshHome 行为：DSH_HOME 环境变量优先，否则 ~/.dsh。
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function dshHome() {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
}
