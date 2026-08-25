// 各引擎的 Schemastery Config 声明集中在此（Web 设置面板渲染源）。
// z 为 null（宿主无 schemastery）时对应导出为 undefined——插件照常工作，
// 行级 cordis.patch.yml 覆盖不受影响。键与各引擎 DEFAULTS/实现一一对应。
import z from './config-source.js'

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
