/** Install the wallpaper runtime and its independent Cordis bootstrap. */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const nodeMajor = Number((process.versions.node || '0').split('.')[0])
if (!Number.isInteger(nodeMajor) || nodeMajor < 18) {
  console.error('需要 Node.js 18 或更高版本，当前为 ' + process.version)
  process.exit(1)
}

const ROOT = path.resolve(__dirname, '..')
const HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const LOCAL = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.env.HOME || '', 'AppData', 'Local')
const RUNTIME = path.resolve(process.env.DSH_WALLPAPER_INSTALL_DIR || path.join(LOCAL, 'DSHWallpaperBridge', 'current'))
const NODE_EXE = path.resolve(process.env.DSH_NODE_EXE || process.execPath)
const PROFILE = path.join(HOME, 'profiles', 'web')
const PLUGINS = path.join(PROFILE, 'plugins')
const BOOTSTRAP = path.join(PROFILE, 'wallpaper-bootstrap.js')
const LEGACY_BOOTSTRAP = path.join(PROFILE, 'dev-plugins-bootstrap2.js')
const PATCH = path.join(PROFILE, 'cordis.patch.yml')
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const HOST_SOURCE = path.join(__dirname, 'plugin.host.js')
const CLIENT_SOURCE = path.join(__dirname, 'plugin.client.js')
const BOOTSTRAP_SOURCE = path.join(__dirname, 'wallpaper-bootstrap.js')
const PATH_LITERAL = "'__DSH_WE_DIR__'"
const NODE_LITERAL = "'__DSH_NODE_EXE__'"
const WALL_MARK = "idPrefix: 'wall'"
let backupDir = ''

function norm(value) { return String(value).replace(/\\/g, '/') }
function sameBuffer(file, data) {
  try { return fs.readFileSync(file).equals(data) } catch (_) { return false }
}
function ensureBackup(file) {
  if (!fs.existsSync(file)) return
  if (!backupDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    backupDir = path.join(PROFILE, 'wallpaper-backups', stamp)
    fs.mkdirSync(backupDir, { recursive: true })
  }
  fs.copyFileSync(file, path.join(backupDir, path.basename(file)))
}
function writeProfile(file, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')
  if (sameBuffer(file, buffer)) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  ensureBackup(file)
  const temp = file + '.installing-' + process.pid
  fs.writeFileSync(temp, buffer)
  if (fs.existsSync(file)) fs.rmSync(file)
  fs.renameSync(temp, file)
  return true
}
function copyRuntimeFile(source, target, overwrite = true) {
  if (!fs.existsSync(source)) throw new Error('安装文件缺失: ' + source)
  const data = fs.readFileSync(source)
  if ((!overwrite && fs.existsSync(target)) || sameBuffer(target, data)) return false
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temp = target + '.installing-' + process.pid
  fs.writeFileSync(temp, data)
  if (fs.existsSync(target)) fs.rmSync(target)
  fs.renameSync(temp, target)
  return true
}
function copyTree(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) copyTree(from, to)
    else if (entry.isFile()) copyRuntimeFile(from, to)
  }
}

function installRuntime() {
  if (RUNTIME === path.parse(RUNTIME).root) throw new Error('拒绝把运行目录设为磁盘根目录')
  fs.mkdirSync(RUNTIME, { recursive: true })
  fs.mkdirSync(path.join(RUNTIME, 'cache'), { recursive: true })
  copyRuntimeFile(path.join(ROOT, 'we.js'), path.join(RUNTIME, 'we.js'))
  copyRuntimeFile(path.join(ROOT, 'native-scene-bridge.js'), path.join(RUNTIME, 'native-scene-bridge.js'))
  copyRuntimeFile(path.join(ROOT, 'update.cmd'), path.join(RUNTIME, 'update.cmd'))
  copyRuntimeFile(path.join(ROOT, 'update.ps1'), path.join(RUNTIME, 'update.ps1'))
  copyTree(path.join(ROOT, 'we-tools'), path.join(RUNTIME, 'we-tools'))

  const targetTitles = path.join(RUNTIME, 'titles.json')
  let privateTitles = {}
  try { privateTitles = JSON.parse(fs.readFileSync(path.join(ROOT, 'titles.local.json'), 'utf8').replace(/^\uFEFF/, '')) } catch (_) {}
  const shippedTitles = Object.assign({}, JSON.parse(fs.readFileSync(path.join(ROOT, 'titles.json'), 'utf8').replace(/^\uFEFF/, '')), privateTitles)
  let localTitles = {}
  try { localTitles = JSON.parse(fs.readFileSync(targetTitles, 'utf8').replace(/^\uFEFF/, '')) } catch (_) {}
  fs.writeFileSync(targetTitles, JSON.stringify(Object.assign({}, shippedTitles, localTitles), null, 2), 'utf8')
  const sourceConfig = path.join(ROOT, 'we.config.json')
  if (!fs.existsSync(path.join(RUNTIME, 'we.config.json')) && fs.existsSync(sourceConfig)) copyRuntimeFile(sourceConfig, path.join(RUNTIME, 'we.config.json'), false)
  fs.writeFileSync(path.join(RUNTIME, 'install.json'), JSON.stringify({ version: VERSION, installedAt: new Date().toISOString() }, null, 2), 'utf8')
}

function installedHost() {
  let code = fs.readFileSync(HOST_SOURCE, 'utf8')
  if (!code.includes(PATH_LITERAL) || !code.includes(NODE_LITERAL)) throw new Error('Host 模板缺少安装占位符')
  code = code.split(PATH_LITERAL).join(JSON.stringify(norm(RUNTIME)))
  code = code.split(NODE_LITERAL).join(JSON.stringify(norm(NODE_EXE)))
  return code
}

function removeLegacyWallSpec() {
  if (!fs.existsSync(LEGACY_BOOTSTRAP)) return false
  const content = fs.readFileSync(LEGACY_BOOTSTRAP, 'utf8')
  if (!content.includes(WALL_MARK)) return false
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const marker = lines.findIndex((line) => line.includes(WALL_MARK))
  let start = marker
  let end = marker
  while (start >= 0 && !/^\s*\{\s*$/.test(lines[start])) start--
  while (end < lines.length && !/^\s*\},?\s*$/.test(lines[end])) end++
  if (start < 0 || end >= lines.length) throw new Error('无法安全移除旧 bootstrap 中的 wall 项；原文件未修改')
  lines.splice(start, end - start + 1)
  writeProfile(LEGACY_BOOTSTRAP, lines.join(eol))
  return true
}

function ensurePatch() {
  const entry = "# dsh-wallpaper-bridge: independent bootstrap\n- insert:\n    - id: wallpaper-bootstrap\n      name: './wallpaper-bootstrap.js'\n"
  const current = fs.existsSync(PATCH) ? fs.readFileSync(PATCH, 'utf8') : ''
  if (current.includes("name: './wallpaper-bootstrap.js'") || current.includes('id: wallpaper-bootstrap')) return false
  writeProfile(PATCH, current.replace(/\s*$/, '') + (current.trim() ? '\n\n' : '') + entry)
  return true
}

function emptyManifest(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ appId: '431960', generatedAt: new Date().toISOString(), count: 0, items: [] }, null, 2), 'utf8')
}
function prepareCatalog() {
  const manifest = path.join(RUNTIME, 'wallpapers.json')
  if (process.env.DSH_INSTALL_SKIP_SCAN === '1') {
    emptyManifest(manifest)
    return { detected: false, skipped: true }
  }
  const detect = spawnSync(NODE_EXE, [path.join(RUNTIME, 'we.js'), 'detect'], { cwd: RUNTIME, encoding: 'utf8', timeout: 30000 })
  let info = null
  try { info = JSON.parse(String(detect.stdout || '')) } catch (_) {}
  if (detect.status === 0 && info && info.ok && info.installDir) {
    const scan = spawnSync(NODE_EXE, [path.join(RUNTIME, 'we.js'), 'scan'], { cwd: RUNTIME, encoding: 'utf8', timeout: 120000 })
    if (scan.status !== 0) console.warn('  [警告] 壁纸扫描失败: ' + String(scan.stderr || scan.stdout || '').slice(0, 240))
    emptyManifest(manifest)
    return { detected: true, scanned: scan.status === 0, installDir: info.installDir }
  }
  emptyManifest(manifest)
  return { detected: false }
}

function verifyInstall() {
  const files = [
    path.join(RUNTIME, 'we.js'), path.join(RUNTIME, 'native-scene-bridge.js'),
    path.join(RUNTIME, 'update.cmd'), path.join(RUNTIME, 'update.ps1'),
    path.join(RUNTIME, 'cache'),
    path.join(RUNTIME, 'we-tools', 'capture.exe'), path.join(RUNTIME, 'we-tools', 'SceneLayerHost.cs'),
    path.join(PLUGINS, 'wallpaper.host.js'), path.join(PLUGINS, 'wallpaper.client.js'), BOOTSTRAP, PATCH,
  ]
  for (const file of files) if (!fs.existsSync(file)) throw new Error('安装校验失败，缺少: ' + file)
  const host = fs.readFileSync(path.join(PLUGINS, 'wallpaper.host.js'), 'utf8')
  if (host.includes(PATH_LITERAL) || host.includes(NODE_LITERAL)) throw new Error('安装校验失败，Host 仍含路径占位符')
  new Function(host)
  new Function(fs.readFileSync(path.join(PLUGINS, 'wallpaper.client.js'), 'utf8'))
  const patch = fs.readFileSync(PATCH, 'utf8')
  if ((patch.match(/name:\s*['"]\.\/wallpaper-bootstrap\.js['"]/g) || []).length !== 1) throw new Error('安装校验失败，wallpaper bootstrap 挂载项不是唯一一项')
}

try {
  console.log('DSH 壁纸插件一键安装 ' + VERSION)
  console.log('  DSH profile: ' + norm(PROFILE))
  console.log('  稳定运行目录: ' + norm(RUNTIME))
  installRuntime()
  fs.mkdirSync(PLUGINS, { recursive: true })
  writeProfile(path.join(PLUGINS, 'wallpaper.host.js'), installedHost())
  writeProfile(path.join(PLUGINS, 'wallpaper.client.js'), fs.readFileSync(CLIENT_SOURCE))
  writeProfile(BOOTSTRAP, fs.readFileSync(BOOTSTRAP_SOURCE))
  const migrated = removeLegacyWallSpec()
  ensurePatch()
  const catalog = prepareCatalog()
  verifyInstall()
  if (migrated) console.log('  已从共享 bootstrap 安全迁移 wall；其他插件保持不变。')
  if (catalog.detected) console.log('  Wallpaper Engine 已检测并刷新本机壁纸清单。')
  else if (!catalog.skipped) console.warn('  [警告] 未检测到 Wallpaper Engine；插件可打开，安装 WE 后在面板刷新即可。')
  if (backupDir) console.log('  旧配置备份: ' + norm(backupDir))
  console.log('安装与静态校验完成。重启 DSH 后侧栏、悬浮窗和设置页会自动加载。')
} catch (error) {
  console.error('[安装失败] ' + (error && error.message ? error.message : String(error)))
  if (backupDir) console.error('可恢复备份: ' + norm(backupDir))
  process.exitCode = 1
}
