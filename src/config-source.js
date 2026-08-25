// Schemastery 安全加载器：Web 设置面板的插件配置 UI 依赖 plugin.Config（Schemastery schema）。
// schemastery 在 dsh 生态用 Symbol.for("schemastery") 全局注册表——天然免疫 v0.1.5 那种
// Symbol() 双实例问题（那是内容寻址服务键特有的坑）。但仍以 try-require 守卫：
// 宿主未安装时返回 null，引擎的 Config 导出为 undefined，插件照常工作（零依赖红线不破）。
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let z = null
try {
  const mod = require('@deepseek-ai/schemastery')
  z = mod.default ?? mod
} catch {
  /* 宿主无 schemastery：Config 导出 undefined，行级 patch 配置仍然可用 */
}

export default z
