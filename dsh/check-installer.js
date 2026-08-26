'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh 安装 'quote' "))
const source = path.join(temp, '解压 源码')
const home = path.join(temp, '用户', '.dsh')
const runtime = path.join(temp, '稳定 运行目录')
const profile = path.join(home, 'profiles', 'web')
const shared = path.join(profile, 'dev-plugins-bootstrap2.js')

function copy(relative) {
  const from = path.join(root, relative)
  const to = path.join(source, relative)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

try {
  for (const item of ['install.js', 'package.json', 'native-scene-bridge.js', 'titles.json', 'update.cmd', 'update.ps1', 'we.js', 'we-tools', 'dsh/install-bootstrap.js', 'dsh/plugin.host.js', 'dsh/plugin.client.js', 'dsh/wallpaper-bootstrap.js']) copy(item)
  fs.writeFileSync(path.join(source, 'wallpapers.json'), JSON.stringify({ appId: '431960', count: 1, items: [{ id: 'must-not-copy' }] }))
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), "- insert:\n    - id: keep-me\n      name: './keep-me.js'\n- insert:\n    - id: dev-plugins-bootstrap2\n      name: './dev-plugins-bootstrap2.js'\n")
  fs.writeFileSync(shared, "const KEEP_BEFORE = 'tkus/popt/zhui';\nconst SPECS = [\n  {\n    idPrefix: 'tkus',\n    name: 'Token 用量挂件',\n  },\n  {\n    idPrefix: 'wall',\n    name: '壁纸引擎控制',\n    files: { host: 'wallpaper.host.js', client: 'wallpaper.client.js' },\n  },\n];\nconst KEEP_AFTER = 'other plugins stay byte-compatible';\n")

  const env = Object.assign({}, process.env, {
    DSH_HOME: home,
    DSH_WALLPAPER_INSTALL_DIR: runtime,
    DSH_NODE_EXE: process.execPath,
    DSH_INSTALL_SKIP_SCAN: '1',
  })
  for (let pass = 0; pass < 2; pass++) {
    const result = spawnSync(process.execPath, [path.join(source, 'install.js')], { cwd: source, env, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, String(result.stderr || result.stdout))
  }

  const patch = fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8')
  assert.equal((patch.match(/name:\s*['"]\.\/wallpaper-bootstrap\.js['"]/g) || []).length, 1, '独立 bootstrap 必须且只能挂载一次')
  assert.ok(patch.includes("name: './keep-me.js'"), '不得破坏其他 patch 项')
  const migrated = fs.readFileSync(shared, 'utf8')
  assert.ok(migrated.includes("KEEP_BEFORE = 'tkus/popt/zhui'"), '不得破坏共享 bootstrap 前段')
  assert.ok(migrated.includes("KEEP_AFTER = 'other plugins stay byte-compatible'"), '不得破坏共享 bootstrap 后段')
  assert.ok(migrated.includes("idPrefix: 'tkus'"), '不得移除其他插件')
  assert.ok(!migrated.includes("idPrefix: 'wall'"), '旧共享 bootstrap 不得重复加载 wall')

  const host = fs.readFileSync(path.join(profile, 'plugins', 'wallpaper.host.js'), 'utf8')
  assert.ok(!host.includes("'__DSH_WE_DIR__'"), 'Host 不得保留运行目录占位符')
  assert.ok(!host.includes("'__DSH_NODE_EXE__'"), 'Host 不得保留 Node 占位符')
  assert.ok(host.includes(JSON.stringify(runtime.replace(/\\/g, '/'))), 'Host 必须引用稳定运行目录')
  assert.ok(host.includes(JSON.stringify(process.execPath.replace(/\\/g, '/'))), 'Host 必须引用安装时确认的 Node')
  assert.ok(!host.includes(source.replace(/\\/g, '/')), 'Host 不得引用解压源目录')
  assert.ok(fs.existsSync(path.join(runtime, 'we-tools', 'SceneLayerHost.cs')), '原生场景 Helper 源码必须安装')
  assert.ok(fs.existsSync(path.join(runtime, 'we-tools', 'capture.exe')), '捕获工具必须安装')
  assert.ok(fs.existsSync(path.join(runtime, 'update.cmd')), '一键更新入口必须安装到稳定运行目录')
  assert.ok(fs.existsSync(path.join(runtime, 'update.ps1')), '更新脚本必须安装到稳定运行目录')
  assert.ok(fs.statSync(path.join(runtime, 'cache')).isDirectory(), '实时场景捕获缓存目录必须安装')
  const installInfo = JSON.parse(fs.readFileSync(path.join(runtime, 'install.json'), 'utf8'))
  assert.equal(installInfo.version, require(path.join(root, 'package.json')).version, '安装版本必须写入本地清单')
  assert.ok(!Object.hasOwn(installInfo, 'source'), '本地清单不得保存解压源绝对路径')
  const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'wallpapers.json'), 'utf8'))
  assert.equal(manifest.count, 0, '不得把打包机器的壁纸清单复制到新设备')
  assert.ok(fs.existsSync(path.join(profile, 'wallpaper-backups')), '迁移旧配置时必须创建备份')

  fs.rmSync(source, { recursive: true, force: true })
  const list = spawnSync(process.execPath, [path.join(runtime, 'we.js'), 'list'], { cwd: runtime, encoding: 'utf8', timeout: 10000 })
  assert.equal(list.status, 0, String(list.stderr || list.stdout))
  assert.equal(JSON.parse(list.stdout).count, 0, '删除解压源后稳定运行时仍须可用')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log('installer checks passed')
