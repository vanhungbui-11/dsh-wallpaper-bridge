'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const forbiddenPaths = /(^|\/)(\.env(?:\.|$)|[^/]*(?:cookie|credential|secret|token)[^/]*|[^/]+\.(?:log|jsonl|pem|key|pfx|p12)$|runtime\.json$|wallpapers\.json$|titles\.local\.json$|we\.config\.json$|node_modules(?:\/|$)|cache(?:\/|$)|dist(?:\/|$)|prototype(?:\/|$)|\.dsh-filess(?:\/|$)|wallpaper-backups(?:\/|$))/i
const secretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /gh[pousr]_[0-9A-Za-z]{20,}/,
  /github_pat_[0-9A-Za-z_]{50,}/,
  /sk-[0-9A-Za-z]{20,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
]
const privateMarkers = [root, os.homedir()].filter(Boolean).flatMap((value) => [value, value.replace(/\\/g, '/')])
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((relative) => relative && fs.existsSync(path.join(root, relative)))

for (const relative of files) {
  const normalized = relative.replace(/\\/g, '/')
  assert.ok(!forbiddenPaths.test(normalized), `privacy-sensitive path is publishable: ${normalized}`)
  const file = path.join(root, relative)
  const bytes = fs.readFileSync(file)
  if (bytes.includes(0)) continue
  const text = bytes.toString('utf8')
  for (const marker of privateMarkers) assert.ok(!text.includes(marker), `source-machine path leaked into ${normalized}`)
  for (const pattern of secretPatterns) assert.ok(!pattern.test(text), `possible secret in ${normalized}: ${pattern}`)
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  for (const email of emails) assert.ok(email.endsWith('@users.noreply.github.com'), `public email address in ${normalized}`)
}

console.log(`privacy checks passed (${files.length} publishable files)`)
