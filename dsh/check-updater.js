'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const updater = fs.readFileSync(path.join(root, 'update.ps1'), 'utf8')
const installer = fs.readFileSync(path.join(__dirname, 'install-bootstrap.js'), 'utf8')
const release = fs.readFileSync(path.join(root, 'release.ps1'), 'utf8')

assert.equal((updater.match(/api\.github\.com/g) || []).length, 1, '更新器只能请求一次固定 GitHub API')
assert.ok(updater.includes('vanhungbui-11/dsh-wallpaper-bridge'), '更新器必须固定到官方仓库')
assert.ok(updater.includes('SHA256]::Create()') && updater.includes('Assert-ArchiveHash'), '更新前必须校验 SHA-256')
assert.ok(updater.includes('Expand-VerifiedArchive') && updater.includes('escapes the extraction directory'), '解压前必须阻止路径穿越')
assert.ok(!/Invoke-Expression|Authorization|GITHUB_TOKEN|Cookie/.test(updater), '更新器不得执行字符串命令或读取认证信息')
assert.ok(installer.includes("path.join(ROOT, 'update.ps1')") && installer.includes("path.join(ROOT, 'update.cmd')"), '安装器必须持久化一键更新入口')
assert.ok(release.includes("'update.cmd', 'update.ps1'"), '发布包必须包含更新入口')

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'update.ps1'), '-PackagePath', path.join(root, 'missing-update-package.zip')], { encoding: 'utf8', timeout: 30000 })
assert.equal(result.status, 1, String(result.stderr || result.stdout))
assert.match(String(result.stderr || result.stdout), /Update package does not exist/, '更新器必须拒绝不存在的离线包')

console.log('updater checks passed')
