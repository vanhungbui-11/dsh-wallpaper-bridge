'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const version = require(path.join(root, 'package.json')).version
const light = path.join(dist, `DSH-Wallpaper-Setup-${version}.zip`)
const full = path.join(dist, `DSH-Wallpaper-Setup-Full-${version}.zip`)
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, ...options })
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr || result.stdout}`)
  return result
}

function hasEntry(archive, entry) {
  const result = spawnSync('tar', ['-tf', archive, entry], { encoding: 'utf8', timeout: 30000 })
  return result.status === 0 && result.stdout.replace(/\\/g, '/').split(/\r?\n/).includes(entry)
}

function requireEntries(archive, prefix, names) {
  for (const name of names) assert.ok(hasEntry(archive, `${prefix}/${name}`), `release missing ${name}`)
}

assert.ok(fs.existsSync(light), 'build the portable release before checking it')
assert.ok(fs.existsSync(full), 'build the full release before checking it')
requireEntries(light, 'DSH-Wallpaper-Setup', ['install.cmd', 'install.ps1', 'install.js', 'THIRD_PARTY_NOTICES.md', 'dsh/wallpaper-bootstrap.js', 'we-tools/SceneLayerHost.cs'])
requireEntries(full, 'DSH-Wallpaper-Setup-Full', ['install.cmd', 'THIRD_PARTY_NOTICES.md', 'dsh/wallpaper-bootstrap.js', 'DeepSeek Harness/DeepSeek Harness.exe', 'DeepSeek Harness/LICENSE', 'DeepSeek Harness/runtime/node.exe', 'DeepSeek Harness/app/native-scene-lab.html'])
assert.ok(!hasEntry(full, 'DSH-Wallpaper-Setup-Full/DeepSeek Harness/README.md'), 'full release leaked the machine-specific harness README')
for (const forbidden of ['wallpapers.json', 'runtime.json', 'we.config.json', 'titles.local.json', '.env', 'node_modules', 'cache', 'prototype', '.dsh-filess', 'wallpaper-backups']) {
  assert.ok(!hasEntry(light, `DSH-Wallpaper-Setup/${forbidden}`), `portable release leaked ${forbidden}`)
  if (forbidden !== 'node_modules') assert.ok(!hasEntry(full, `DSH-Wallpaper-Setup-Full/${forbidden}`), `full release leaked bridge ${forbidden}`)
}
for (const developmentFile of ['dsh/check-client.js', 'dsh/check-host.js', 'dsh/check-installer.js', 'dsh/check-privacy.js', 'dsh/check-release.js']) {
  assert.ok(!hasEntry(light, `DSH-Wallpaper-Setup/${developmentFile}`), `portable release included development file ${developmentFile}`)
  assert.ok(!hasEntry(full, `DSH-Wallpaper-Setup-Full/${developmentFile}`), `full release included development file ${developmentFile}`)
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-release-check-'))
try {
  run('tar', ['-xf', light, '-C', temp])
  const payload = path.join(temp, 'DSH-Wallpaper-Setup')
  const home = path.join(temp, 'profile')
  const runtime = path.join(temp, 'runtime')
  const result = run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(payload, 'install.ps1'), '-DshHome', home, '-InstallDir', runtime, '-NoLaunch', '-NoShortcut'], {
    cwd: payload,
    env: { ...process.env, DSH_NODE: process.execPath, DSH_WALLPAPER_INSTALL_DIR: runtime, DSH_INSTALL_SKIP_SCAN: '1' },
  })
  assert.match(result.stdout, /Setup completed/, 'portable installer did not report completion')
  fs.rmSync(payload, { recursive: true, force: true })
  const list = run(process.execPath, [path.join(runtime, 'we.js'), 'list'], { cwd: runtime })
  assert.equal(JSON.parse(list.stdout).count, 0, 'installed runtime must survive deleting the extracted package')

  if (process.env.DSH_CHECK_FULL_INSTALL === '1') {
    run('tar', ['-xf', full, '-C', temp], { timeout: 600000 })
    const fullPayload = path.join(temp, 'DSH-Wallpaper-Setup-Full')
    const fullHome = path.join(temp, 'full-profile')
    const fullRuntime = path.join(temp, 'full-runtime')
    const harness = path.join(temp, 'installed-harness')
    run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(fullPayload, 'install.ps1'), '-DshHome', fullHome, '-InstallDir', harness, '-NoLaunch', '-NoShortcut'], {
      cwd: fullPayload,
      timeout: 600000,
      env: { ...process.env, DSH_WALLPAPER_INSTALL_DIR: fullRuntime, DSH_INSTALL_SKIP_SCAN: '1' },
    })
    assert.ok(fs.existsSync(path.join(harness, 'DeepSeek Harness.exe')), 'full installer did not copy DeepSeek Harness')
    const host = fs.readFileSync(path.join(fullHome, 'profiles', 'web', 'plugins', 'wallpaper.host.js'), 'utf8')
    assert.ok(host.includes(JSON.stringify(path.join(harness, 'runtime', 'node.exe').replace(/\\/g, '/'))), 'full installer did not bind its bundled Node runtime')
    fs.rmSync(fullPayload, { recursive: true, force: true })
    run(path.join(harness, 'runtime', 'node.exe'), [path.join(fullRuntime, 'we.js'), 'list'], { cwd: fullRuntime })
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log('release checks passed')
