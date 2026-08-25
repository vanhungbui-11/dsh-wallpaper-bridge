'use strict'
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const NAME = '壁纸引擎控制'
const HOST = 'host-v2'
const CLIENT = 'client-v2'
const digest = crypto.createHash('sha256').update(HOST).update('\0').update(CLIENT).digest('hex').slice(0, 16)
const marker = `[build:${digest}]`

function fakeRunner(snapshot, receipt) {
  const calls = []
  const rows = JSON.parse(JSON.stringify(snapshot))
  let finish
  const done = new Promise((resolve) => { finish = resolve })
  return {
    calls,
    done,
    runner: {
      snapshot(agent) { calls.push({ kind: 'snapshot', agent }); return rows.filter((row) => row.agentId === agent.id).map((row) => JSON.parse(JSON.stringify(row))) },
      inventory() { calls.push({ kind: 'inventory' }); return JSON.parse(JSON.stringify(rows)) },
      define(request) {
        calls.push({ kind: 'define', request })
        const row = { agentId: request.sessionId, pluginId: receipt.pluginId, currentPackageId: receipt.packageId, packages: [{ packageId: receipt.packageId, name: request.name, purpose: request.purpose }] }
        rows.push(row)
        return receipt
      },
      async runHostHalf(...args) { calls.push({ kind: 'host', args }); return { ok: true } },
      async run(...args) {
        calls.push({ kind: 'run', args })
        const row = rows.find((item) => item.pluginId === args[1])
        if (row) { row.activeRun = { packageId: args[2] }; row.latestRun = { status: 'running' } }
        finish()
        return { ok: true, status: 'starting' }
      },
    },
  }
}

async function execute(plugin, snapshot, receipt) {
  const agent = { id: 'session-test' }
  const fake = fakeRunner(snapshot, receipt)
  const listeners = {}
  plugin.apply({ agents: { list: () => [agent] }, dynamicCordisRunner: fake.runner, on(name, fn) { listeners[name] = fn } })
  let timeout
  try {
    await Promise.race([fake.done, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('bootstrap timeout')), 1000) })])
  } finally { clearTimeout(timeout) }
  assert.equal(listeners['agent/created'], undefined, '已有启动会话时不得监听后续新会话')
  return { ...fake, agent, listeners }
}

;(async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-bootstrap-'))
  try {
    fs.mkdirSync(path.join(fixture, 'plugins'))
    fs.copyFileSync(path.join(__dirname, 'wallpaper-bootstrap.js'), path.join(fixture, 'wallpaper-bootstrap.js'))
    fs.writeFileSync(path.join(fixture, 'plugins', 'wallpaper.host.js'), HOST)
    fs.writeFileSync(path.join(fixture, 'plugins', 'wallpaper.client.js'), CLIENT)
    const plugin = require(path.join(fixture, 'wallpaper-bootstrap.js'))

    const fresh = await execute(plugin, [], { pluginId: 'wall-1', packageId: 'pkg-1' })
    assert.deepEqual(fresh.calls.map((call) => call.kind), ['inventory', 'define', 'host', 'run'])
    assert.deepEqual(fresh.calls[1].request.plugin, { kind: 'new', idPrefix: 'wall' })
    assert.equal(fresh.calls[1].request.code.host, HOST)
    assert.equal(fresh.calls[1].request.code.client, CLIENT)
    assert.ok(fresh.calls[1].request.purpose.endsWith(marker))
    assert.deepEqual(fresh.calls[2].args, [fresh.agent, 'wall-1', 'pkg-1', 'run', null, false])
    assert.deepEqual(fresh.calls[3].args, [fresh.agent, 'wall-1', 'pkg-1', 'run', undefined])
    assert.equal(fresh.calls.filter((call) => call.kind === 'define').length, 1, '新会话不得重复注册壁纸插件')
    assert.equal(fresh.calls.filter((call) => call.kind === 'run').length, 1, '新会话不得重复启动壁纸插件')

    const old = await execute(plugin, [{ pluginId: 'wall-7', currentPackageId: 'pkg-old', packages: [{ packageId: 'pkg-old', name: NAME, purpose: 'legacy [build:0000000000000000]' }] }], { pluginId: 'wall-7', packageId: 'pkg-2' })
    assert.deepEqual(old.calls.map((call) => call.kind), ['inventory', 'define', 'host', 'run'])
    assert.deepEqual(old.calls[1].request.plugin, { kind: 'existing', pluginId: 'wall-7' })
    assert.deepEqual(old.calls[2].args, [old.agent, 'wall-7', 'pkg-2', 'update', null, false])
    assert.deepEqual(old.calls[3].args, [old.agent, 'wall-7', 'pkg-2', 'update', undefined])

    const same = await execute(plugin, [{ pluginId: 'wall-7', currentPackageId: 'pkg-current', packages: [{ packageId: 'pkg-current', name: NAME, purpose: 'wallpaper ' + marker }] }], null)
    assert.deepEqual(same.calls.map((call) => call.kind), ['inventory', 'host', 'run'])
    assert.deepEqual(same.calls[1].args, [same.agent, 'wall-7', 'pkg-current', 'run', null, false])
    assert.deepEqual(same.calls[2].args, [same.agent, 'wall-7', 'pkg-current', 'run', undefined])
  } finally { fs.rmSync(fixture, { recursive: true, force: true }) }
  console.log('wallpaper bootstrap checks passed')
})().catch((error) => { console.error(error); process.exitCode = 1 })
