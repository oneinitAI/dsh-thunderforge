// 最小 DSH 插件示例（bundle 格式）。
// 参考：dsh-plugin-dev 技能 references/plugin-anatomy.md。
export const name = 'hello-plugin'

export function apply(ctx) {
  console.log('[hello-plugin] plugin loaded!')

  // 所有注册都是副作用：返回的清理函数在插件卸载时自动执行。
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('[hello-plugin] heartbeat')
    }, 5000)
    return () => clearInterval(timer)
  })
}
