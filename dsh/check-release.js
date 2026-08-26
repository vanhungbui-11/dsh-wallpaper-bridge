'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const version = require(path.join(root, 'package.json')).version
const archive = path.join(dist, `DSH-Wallpaper-Setup-${version}.zip`)
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const prefix = 'DSH-Wallpaper-Setup'
const forbidden = /(^|\/)(\.env(?:\.|$)|\.npmrc$|\.netrc$|[^/]*(?:cookie|credential|secret|token)[^/]*|[^/]+\.(?:log|jsonl|pem|key|pfx|p12)$|runtime\.json$|wallpapers\.json$|titles\.local\.json$|we\.config\.json$|node_modules(?:\/|$)|cache(?:\/|$)|dist(?:-local)?(?:\/|$)|prototype(?:\/|$)|\.dsh-filess(?:\/|$)|wallpaper-backups(?:\/|$))/i

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, ...options })
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr || result.stdout}`)
  return result
}

function archiveHas(file, entry, timeout = 30000) {
  const result = spawnSync('tar', ['-tf', file, entry], { encoding: 'utf8', timeout })
  return result.status === 0 && result.stdout.replace(/\\/g, '/').split(/\r?\n/).includes(entry)
}

assert.ok(fs.existsSync(archive), 'build the portable release before checking it')
assert.ok(fs.statSync(archive).size < 50 * 1024 * 1024, 'public package is too large for a lightweight GitHub release candidate')
assert.deepEqual(fs.readdirSync(dist).sort(), [path.basename(archive), path.basename(archive) + '.sha256'].sort(), 'public dist must contain only the current portable package and its SHA-256 sidecar')

const entries = run('tar', ['-tf', archive]).stdout.replace(/\\/g, '/').split(/\r?\n/).filter(Boolean)
function has(relative) { return entries.includes(`${prefix}/${relative}`) }
for (const name of ['install.cmd', 'install.ps1', 'install.js', 'update.cmd', 'update.ps1', 'manifest.json', 'THIRD_PARTY_NOTICES.md', 'dsh/wallpaper-bootstrap.js', 'we-tools/SceneLayerHost.cs']) {
  assert.ok(has(name), `release missing ${name}`)
}
for (const entry of entries) {
  assert.ok(entry === prefix || entry.startsWith(prefix + '/'), `release has an unexpected root: ${entry}`)
  const relative = entry.slice(prefix.length).replace(/^\//, '')
  assert.ok(!forbidden.test(relative), `release contains forbidden path: ${relative}`)
}
for (const developmentFile of ['dsh/check-client.js', 'dsh/check-host.js', 'dsh/check-installer.js', 'dsh/check-privacy.js', 'dsh/check-release.js', 'dsh/check-updater.js']) {
  assert.ok(!has(developmentFile), `release included development file ${developmentFile}`)
}

const sidecar = archive + '.sha256'
assert.ok(fs.existsSync(sidecar), 'release is missing its SHA-256 sidecar')
const match = fs.readFileSync(sidecar, 'utf8').trim().match(/^([0-9a-f]{64}) {2}([^\r\n]+)$/i)
assert.ok(match, 'SHA-256 sidecar format is invalid')
assert.equal(match[2], path.basename(archive), 'SHA-256 sidecar names a different archive')
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), match[1].toLowerCase(), 'release SHA-256 does not match')

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-release-check-'))
try {
  run('tar', ['-xf', archive, '-C', temp])
  const payload = path.join(temp, prefix)
  const home = path.join(temp, 'profile')
  const runtime = path.join(temp, 'runtime')
  const env = { ...process.env, DSH_NODE: process.execPath, DSH_WALLPAPER_INSTALL_DIR: runtime, DSH_INSTALL_SKIP_SCAN: '1' }
  const result = run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(payload, 'install.ps1'), '-DshHome', home, '-NoLaunch', '-NoShortcut'], { cwd: payload, env })
  assert.match(result.stdout, /Setup completed/, 'portable installer did not report completion')
  assert.ok(fs.existsSync(path.join(runtime, 'update.cmd')) && fs.existsSync(path.join(runtime, 'update.ps1')), 'installed runtime is missing the updater')
  const installInfo = JSON.parse(fs.readFileSync(path.join(runtime, 'install.json'), 'utf8'))
  assert.equal(installInfo.version, version, 'installed version is wrong')
  assert.ok(!Object.hasOwn(installInfo, 'source'), 'installed metadata leaked the extracted source path')

  run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'update.ps1'), '-PackagePath', archive, '-DshHome', home, '-NoLaunch', '-NoShortcut', '-Force'], { cwd: root, env })
  assert.equal(JSON.parse(fs.readFileSync(path.join(runtime, 'install.json'), 'utf8')).version, version, 'offline one-click update did not reinstall the verified package')

  fs.rmSync(payload, { recursive: true, force: true })
  const list = run(process.execPath, [path.join(runtime, 'we.js'), 'list'], { cwd: runtime })
  assert.equal(JSON.parse(list.stdout).count, 0, 'installed runtime must survive deleting the extracted package')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

if (process.env.DSH_CHECK_FULL_INSTALL === '1') {
  const fullArchive = path.join(root, 'dist-local', `DSH-Wallpaper-Setup-Full-${version}.zip`)
  assert.ok(fs.existsSync(fullArchive), 'build the local-only full release before checking it')
  const fullPrefix = 'DSH-Wallpaper-Setup-Full'
  for (const name of ['install.cmd', 'update.cmd', 'manifest.json', 'DeepSeek Harness/DeepSeek Harness.exe', 'DeepSeek Harness/LICENSE', 'DeepSeek Harness/runtime/node.exe']) {
    assert.ok(archiveHas(fullArchive, `${fullPrefix}/${name}`, 600000), `local full release missing ${name}`)
  }
  assert.ok(archiveHas(fullArchive, `${fullPrefix}/DeepSeek Harness/runtime/node_modules/@deepseek-ai/`, 600000), 'local full release should keep the DSH runtime dependencies')

  const fullTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-full-release-check-'))
  try {
    run('tar', ['-xf', fullArchive, '-C', fullTemp], { timeout: 600000 })
    const payload = path.join(fullTemp, fullPrefix)
    const manifest = JSON.parse(fs.readFileSync(path.join(payload, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''))
    assert.equal(manifest.publication, 'local-only', 'full release must be marked local-only')
    const home = path.join(fullTemp, 'profile')
    const runtime = path.join(fullTemp, 'runtime')
    const harness = path.join(fullTemp, 'installed-harness')
    run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(payload, 'install.ps1'), '-DshHome', home, '-InstallDir', harness, '-NoLaunch', '-NoShortcut'], {
      cwd: payload,
      timeout: 600000,
      env: { ...process.env, DSH_WALLPAPER_INSTALL_DIR: runtime, DSH_INSTALL_SKIP_SCAN: '1' },
    })
    assert.ok(fs.existsSync(path.join(harness, 'DeepSeek Harness.exe')), 'full installer did not install DSH')
    assert.ok(fs.existsSync(path.join(runtime, 'update.cmd')), 'full installer did not install the updater')
    fs.rmSync(payload, { recursive: true, force: true })
    run(path.join(harness, 'runtime', 'node.exe'), [path.join(runtime, 'we.js'), 'list'], { cwd: runtime })
  } finally {
    fs.rmSync(fullTemp, { recursive: true, force: true })
  }
}

console.log('release checks passed')
