/** Auto-load one shared wallpaper plugin for the current DSH process. */
'use strict'
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const NAME = '壁纸引擎控制'
const BASE_PURPOSE = 'Wallpaper Engine 窗口控制、悬浮面板、背景注入与设置页。'
const LOG_FILE = path.join(__dirname, 'wallpaper-bootstrap.log')

function log(line) {
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n') } catch (_) {}
}

module.exports = {
  name: 'wallpaper-bootstrap',
  inject: ['agents', 'dynamicCordisRunner'],
  apply(ctx) {
    const runner = ctx.dynamicCordisRunner
    const code = {
      host: fs.readFileSync(path.join(__dirname, 'plugins', 'wallpaper.host.js'), 'utf8'),
      client: fs.readFileSync(path.join(__dirname, 'plugins', 'wallpaper.client.js'), 'utf8'),
    }
    const digest = crypto.createHash('sha256').update(code.host).update('\0').update(code.client).digest('hex').slice(0, 16)
    const marker = `[build:${digest}]`
    const purpose = BASE_PURPOSE + ' ' + marker
    let ensuring = null

    const ensureOne = async (requestedAgent) => {
      // The wallpaper UI registers global shell/settings slots.  snapshot() is
      // session-scoped, so using it here created one copy for every new chat.
      const agents = ctx.agents.list()
      const byId = new Map(agents.map((agent) => [agent.id, agent]))
      const rows = typeof runner.inventory === 'function' ? runner.inventory() : runner.snapshot(requestedAgent)
      const matches = rows.filter((row) => row.packages.some((pkg) => pkg.name === NAME))
      let row = matches.find((item) => item.activeRun) || matches[0]
      const agent = (row && byId.get(row.agentId)) || requestedAgent || agents[0]
      if (!agent) return
      let pluginId = row && row.pluginId
      let packageId = row && [...row.packages].reverse().find((pkg) => pkg.name === NAME && pkg.purpose.endsWith(marker))?.packageId

      if (!packageId) {
        const receipt = runner.define({
          sessionId: agent.id,
          plugin: row ? { kind: 'existing', pluginId } : { kind: 'new', idPrefix: 'wall' },
          name: NAME,
          purpose,
          code,
        })
        pluginId = receipt.pluginId
        packageId = receipt.packageId
      }

      if (row && row.currentPackageId === packageId && row.activeRun?.packageId === packageId && ['running', 'waiting'].includes(row.latestRun?.status)) {
        log(`ready ${pluginId}/${packageId} for ${agent.id}`)
        return
      }
      if (row && row.latestRun?.approvalRequestId && ['awaiting-approval', 'starting-host', 'client-pending'].includes(row.latestRun.status)) {
        log(`pending ${pluginId}/${packageId} for ${agent.id}`)
        return
      }

      const mode = row && row.currentPackageId && row.currentPackageId !== packageId ? 'update' : 'run'
      const host = await runner.runHostHalf(agent, pluginId, packageId, mode, null, false)
      if (!host || host.ok === false) throw new Error(host && host.message ? host.message : 'Host half failed')
      const started = await runner.run(agent, pluginId, packageId, mode, undefined)
      if (!started || started.ok === false) throw new Error(started && started.message ? started.message : 'Client start failed')
      log(`${mode} ${pluginId}/${packageId} ${marker} for ${agent.id}`)
    }

    const ensure = (agent) => {
      if (!agent || typeof agent.id !== 'string') return Promise.resolve()
      if (ensuring) return ensuring
      ensuring = ensureOne(agent)
        .catch((error) => log(`failed for ${agent.id}: ${error && error.message ? error.message : String(error)}`))
        .finally(() => { ensuring = null })
      return ensuring
    }

    // 动态插件只需要一个宿主会话；其工具与 UI 插槽均为进程级共享。
    // 冷启动若还没有会话，则只借第一个新会话启动一次，之后不再响应切换。
    let started = false
    const startOnce = (agent) => {
      if (started) return Promise.resolve()
      started = true
      return ensure(agent)
    }
    const firstAgent = ctx.agents.list()[0]
    if (firstAgent) startOnce(firstAgent)
    else ctx.on('agent/created', ({ agent }) => startOnce(agent))
    log(`mounted ${marker}`)
  },
}
