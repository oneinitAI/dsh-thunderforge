// 各引擎的 Schemastery Config 声明集中在此（Web 设置面板渲染源）。
// z 为 null（宿主无 schemastery）时对应导出为 undefined——插件照常工作，
// 行级 cordis.patch.yml 覆盖不受影响。键与各引擎 DEFAULTS/实现一一对应。
import z from './config-source.js'

/**
 * 解析引擎生效配置：注册 settings namespace（Web 面板表单来源）并以 scope 值为准。
 * 优先级：面板/宿主 settings 用户分节 > patch 行 config（作为 base）> schema 默认。
 * 注意：cordis 的 ctx 是严格 Proxy——访问未在 inject 声明的服务属性会直接 throw
 * （真机 boot 实证），因此访问必须整体包 try/catch；宿主无 settings 服务时回退。
 * @returns {{ value: object, scope: object | null }}
 */
export function resolveEngineConfig(ctx, ns, schema, rowConfig = {}, fallbackDefaults = {}) {
  const fallback = { value: { ...fallbackDefaults, ...rowConfig }, scope: null }
  try {
    if (typeof ctx?.settings?.register !== 'function' || !schema) return fallback
    const scope = ctx.settings.register(ns, schema, { base: rowConfig })
    return { value: scope.get() ?? {}, scope }
  } catch {
    // 未注入 settings / 注册冲突等：静默回退到 patch+默认
    return fallback
  }
}

/** capture 的配置 schema（与 src/capture/core.js DEFAULTS 对应）。 */
export const captureConfig = (defaults) =>
  z
    ? z
        .object({
          enabled: z.boolean().default(defaults.enabled),
          dir: z.string().default(''),
          providers: z.array(z.string()).default([]),
          redact: z.boolean().default(true),
          captureDeltas: z.boolean().default(false),
          maxStringLength: z.natural().default(0),
          maxFiles: z.natural().default(2000),
          maxTotalBytes: z.natural().default(0),
          pruneEvery: z.natural().default(50),
          staleWarnMs: z.natural().default(300000),
        })
        .description('LLM 载荷捕获')
    : undefined

/** skills 的配置 schema（五层开关 + 探测延迟）。 */
export const skillsConfig = () =>
  z
    ? z
        .object({
          entryLayer: z.boolean().default(true),
          archLayer: z.boolean().default(true),
          pitfallsLayer: z.boolean().default(true),
          buddyLayer: z.boolean().default(true),
          checklistLayer: z.boolean().default(true),
          probeDelayMs: z.natural().default(8000),
        })
        .description('ThunderForge 知识库技能层')
    : undefined

/** debugger 的配置 schema。 */
export const debuggerConfig = () =>
  z
    ? z
        .object({
          disabled: z.boolean().default(false),
          waterfallLimit: z.natural().default(80),
        })
        .description('轨迹瀑布调试器')
    : undefined

/** scaffold 的配置 schema。 */
export const scaffoldConfig = () =>
  z
    ? z
        .object({
          disabled: z.boolean().default(false),
          verify: z.boolean().default(true),
        })
        .description('插件骨架锻造器')
    : undefined

/** release 的配置 schema。 */
export const releaseConfig = () =>
  z
    ? z
        .object({
          disabled: z.boolean().default(false),
        })
        .description('发布门禁')
    : undefined

/** profile 的配置 schema。 */
export const profileConfig = () =>
  z
    ? z
        .object({
          disabled: z.boolean().default(false),
        })
        .description('profile 管理 + dev preset')
    : undefined
