#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ROOT = __dirname
const SOURCE = path.join(ROOT, 'we-tools', 'SceneLayerHost.cs')
const CACHE = path.join(os.tmpdir(), 'deepseek-harness-native-scene')
const EXE = path.join(CACHE, 'SceneLayerHost.exe')
const CONFIG = path.join(os.tmpdir(), 'deepseek-harness-native-scene.json')
const CSC = ['C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'].find(fs.existsSync)
function helper () {
  if (!CSC) throw new Error('C# compiler unavailable')
  fs.mkdirSync(CACHE, { recursive: true })
  if (!fs.existsSync(EXE) || fs.statSync(EXE).mtimeMs < fs.statSync(SOURCE).mtimeMs) {
    const result = spawnSync(CSC, ['/nologo', '/target:exe', '/out:' + EXE, SOURCE], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'native helper compile failed').trim())
  }
  return EXE
}
async function main () {
  const title = process.argv[3]
  const action = process.argv[2]
  const audioOn = process.argv[4]
  if (!((action === 'attach' && /^dsh-we-[A-Za-z0-9._-]+$/.test(title || '')) || action === 'detach' || (action === 'audio' && /^dsh-we-[A-Za-z0-9._-]+$/.test(title || '') && /^(on|off)$/.test(audioOn || '')))) throw new Error('usage: native-scene-bridge.js attach <dsh-we-title>|detach|audio <dsh-we-title> <on|off>')
  // 音频按 DSH 专用场景窗口的进程会话处理，不走 Wallpaper Engine 的全局 mute。
  if (action === 'audio') {
    const result = spawnSync(helper(), ['audio', title, audioOn], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'native scene audio failed').trim())
    process.stdout.write(result.stdout || '{"ok":false}')
    return
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  const body = JSON.stringify(action === 'attach' ? { action, title, helper: helper() } : { action })
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: cfg.port, method: 'POST', path: '/', headers: { 'x-dsh-native-token': cfg.token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let data = ''; res.on('data', (chunk) => { data += chunk }); res.on('end', () => res.statusCode === 200 ? resolve(data) : reject(new Error(data || 'native bridge rejected')))
    })
    req.on('error', reject); req.end(body)
  })
  process.stdout.write(result)
}
main().catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
