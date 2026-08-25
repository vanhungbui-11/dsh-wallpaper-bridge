const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'plugin.host.js'), 'utf8')
const names = new Set()
const harness = {
  defineTool: (tool) => tool,
  registerTool(_ctx, tool) {
    if (names.has(tool.name)) throw new Error(`tool "${tool.name}" is already registered`)
    names.add(tool.name)
  },
  handle() {},
}
const plugin = new Function('harness', 'console', source)(harness, { log() {}, error() {} })
const ctx = { get() {} }

plugin.apply(ctx)
const firstCount = names.size
plugin.apply(ctx)

assert(firstCount > 0, '首次挂载应注册 wallpaper 工具')
assert.equal(names.size, firstCount, '重复挂载不应重复注册或中断 Host')
const closeCase = source.slice(source.indexOf("case 'close':"), source.indexOf("case 'state':"))
assert(closeCase.includes("args.window ? ['close', String(args.window)] : ['close', '--all']"), 'close 必须支持精确关闭失效场景窗口')
const applyCase = source.slice(source.indexOf("case 'apply':"), source.indexOf("case 'close':"))
assert(applyCase.includes("if (args.window) flags.push('--window', String(args.window))"), 'apply 必须传递独立场景窗口名')
const bridgeStart = source.indexOf('const WEB_AUDIO_BRIDGE')
const bridgeEnd = source.indexOf('const MEDIA_FILE_RE', bridgeStart)
const withWebAudioBridge = new Function(source.slice(bridgeStart, bridgeEnd) + '; return withWebAudioBridge')()
const html = Buffer.from('<html><head></head><body><video></video></body></html>')
const injected = withWebAudioBridge(html, '.html')
assert.equal((String(injected).match(/data-dsh-wallpaper-audio/g) || []).length, 1, '网页 HTML 必须只注入一个音频消息桥')
const reinjected = withWebAudioBridge(Buffer.from(String(injected)), '.html')
assert.equal((String(reinjected).match(/data-dsh-wallpaper-audio/g) || []).length, 1, '音频消息桥必须幂等')
const css = Buffer.from('body{}')
assert.strictEqual(withWebAudioBridge(css, '.css'), css, '非 HTML 资源不得改写')
assert(source.slice(bridgeStart, bridgeEnd).includes('event.source !== parent'), '音频桥只接受父窗口消息')
const webRoute = source.slice(source.indexOf('const serveWebRoute ='), source.indexOf('const webServer ='))
assert(webRoute.includes('withWebAudioBridge(bytes, ext)'), '网页路由必须应用音频消息桥')
const captureRoute = source.slice(source.indexOf("path: '/wallpaper-capture'"), source.indexOf("path: '/wallpaper-transcode'"))
assert(captureRoute.includes("searchParams.get('window')") && captureRoute.includes("'-title', windowName"), '捕获路由必须把请求窗口名原样交给捕获工具')
const nativeAudioCase = source.slice(source.indexOf("case 'native-audio':"), source.indexOf("case 'pause':"))
assert(nativeAudioCase.includes("runNativeBridge(['audio'"), 'Host 必须把实时场景声音状态转交原生桥')
console.log('wallpaper host checks passed')
