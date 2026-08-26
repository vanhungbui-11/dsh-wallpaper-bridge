const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'plugin.client.js'), 'utf8')
const packageVersion = require('../package.json').version
new Function(source)

const preview = source.slice(source.indexOf('const preview ='), source.indexOf('const collArea'))
assert(preview.indexOf('it.previewUrl') < preview.indexOf("it.type === 'video'"), '预览图必须优先于视频回退')
assert(source.includes('uiTintAll: false'), '缺少染色范围默认值')
assert(source.includes("fxStore.uiTint && fxStore.uiTintAll"), '缺少全局染色状态同步')
assert(source.includes("fx.uiTintAll ? '全界面' : '四个模块'"), '缺少明确的染色范围切换按钮')
assert(source.includes("disclosure('主色与界面', false,"), '设置页主色与界面参数必须可展开收纳')
const uiSync = source.slice(source.indexOf('const syncUiGlass ='), source.indexOf('syncUiGlass()', source.indexOf('const syncUiGlass =')))
assert(uiSync.includes('fxStore.uiTintStrength'), '界面染色必须使用独立强度')
assert(!/fxStore\.(?:on|strength|hue)\b/.test(uiSync), '界面染色不得依赖壁纸效果开关、主色覆盖或色相偏移')
const globalTintCss = source.slice(source.indexOf('html[data-wp-ui-tint-all] body'), source.indexOf('/* 主题：', source.indexOf('html[data-wp-ui-tint-all] body')))
assert(!globalTintCss.includes('--dsw-alias-brand-primary:'), '全界面染色不得覆盖按钮和滑块状态色')
assert(globalTintCss.includes('var(--wp-ui-tint-surface)'), '全界面染色必须沿用背景透明度')
const bgParams = source.slice(source.indexOf('const setBgParams ='), source.indexOf('// 静态背景', source.indexOf('const setBgParams =')))
assert(bgParams.includes('if (p.opacity !== undefined) syncUiGlass()'), '调整背景透明度时必须同步全界面染色表面')
assert(source.includes("localStorage.getItem('wp-bg-music-on')"), '背景音乐开关必须持久化')
const musicControl = source.slice(source.indexOf('const setBgMusic ='), source.indexOf('const useBgMusic ='))
const musicSync = source.slice(source.indexOf('const syncDshBgMusic ='), source.indexOf('const setBgMusic ='))
assert(musicSync.includes("action: 'native-audio'"), 'DSH 实时场景音乐必须走独立场景音频控制')
assert(musicSync.includes("type: 'dsh-wallpaper-audio'"), '网页壁纸声音必须同步到沙箱消息桥')
assert(!musicControl.includes("action: 'mute'"), 'DSH 背景音乐开关不得调用 Wallpaper Engine 全局静音接口')
assert(musicControl.includes('stopTranscodePoll()') && musicControl.includes('injectBg(bgStore.item'), '场景开声必须停止无音轨转码升级并切回实时渲染')
assert(source.includes("v.muted = !musicStore.on"), '视频背景必须同步音乐开关')
assert(source.includes("f.setAttribute('sandbox', 'allow-scripts')") && !source.includes('allow-same-origin'), '网页壁纸必须保留跨源沙箱隔离')
assert(source.includes("row('DSH 壁纸声音', musicOn"), '设置页必须提供统一的 DSH 壁纸声音开关')
assert.equal((source.match(/const musicOn = useBgMusic\(\)/g) || []).length, 2, '主面板与设置页必须共用同一声音状态')
assert(source.includes('可能联动桌面声音'), '音乐说明必须明确实时场景的进程级限制')
assert(source.includes("const PLUGIN_VERSION = '" + packageVersion + "'"), '设置页版本说明必须与 package.json 一致')
assert(source.includes("disclosure('启动与声音', true,"), '设置页启动与声音必须可展开收纳')
assert(source.includes("'aria-pressed': musicOn"), '主面板声音按钮必须暴露并同步开关状态')
assert(source.includes("activeTool === 'effects'") && source.includes("activeTool === 'settings'"), '画面与滤镜、设置模块必须互斥展开收纳')
assert(source.includes("id: 'wp-effects-module'") && source.includes("'aria-controls': 'wp-effects-module'"), '悬浮窗必须提供一个关联明确的画面与滤镜模块')
assert(!source.includes('wp-adjust-module') && !source.includes('wp-filter-module'), '旧画面和滤镜模块不得继续重复渲染')
assert((source.match(/disabledReason: filterNote/g) || []).length === 2, '悬浮窗与设置页必须在专属滤镜子组同步说明不支持类型')
assert(source.includes("className: 'wp-module-body wp-module-effects'") && source.includes('.wp-module-effects { flex: 1 1 auto;'), '拉高窗口时合并效果模块必须自适应展开')
assert(source.includes('const FILTER_PRESETS = [') && source.includes("'data-fx-preset': preset.id") && (source.match(/h\(FilterControls/g) || []).length === 2 && (source.match(/h\(BasePictureControls/g) || []).length === 2, '主面板与设置页必须复用同一套画面和滤镜控件')
const filterPresetSource = source.slice(source.indexOf('const FILTER_PRESETS = ['), source.indexOf('try {', source.indexOf('const FILTER_PRESETS = [')))
assert((filterPresetSource.match(/id: '[a-z-]+', name:/g) || []).length >= 8, '滤镜模块至少提供 8 套方案')
for (const key of ['temperature', 'sepia', 'grayscale', 'light', 'lightX', 'lightY', 'lightSize', 'light2', 'light2X', 'light2Y', 'light2Size', 'light3', 'light3X', 'light3Y', 'light3Size', 'vignette', 'grain']) {
  assert(source.includes(key + ':'), '缺少滤镜参数: ' + key)
}
const applyFx = source.slice(source.indexOf('const applyFxNow ='), source.indexOf('let fxTintEl'))
assert(applyFx.includes('finiteOr(bgStore.saturate, 100)'), '饱和度 0 必须保持为 0，不能回退到默认值')
assert(applyFx.includes('fxStore.on && isFilterAvailable(bgStore)') && applyFx.includes('atmosphereStyles(on ? fxStore : null)'), '滤镜、色罩与氛围层必须由当前图片/视频类型统一门控')
const filterSupportSource = source.slice(source.indexOf('const isFilterSupported ='), source.indexOf('const isFilterAvailable ='))
const isFilterSupported = new Function(filterSupportSource + '; return isFilterSupported')()
assert.equal(isFilterSupported({ type: 'image' }), true, '图片必须支持滤镜')
assert.equal(isFilterSupported({ type: 'video' }), true, '视频必须支持滤镜')
for (const type of ['scene', 'web', 'application', 'other']) assert.equal(isFilterSupported({ type }), false, type + ' 不得启用滤镜')
assert.equal(isFilterSupported(null), false, '未注入背景时不得启用滤镜')
assert(source.includes('fx: Object.assign({ color: fx.color, speed: fx.speed }, filterFxSnapshot(fx))'), '自定义方案必须保存完整滤镜、光照及既有视频速度参数')
assert(source.includes("localStorage.getItem('wp-bg-fx-' + k)") && source.includes("localStorage.setItem('wp-bg-fx-' + key"), '曝光、对比、饱和与柔焦必须完整持久化')
assert(source.includes("disclosure('画面与滤镜', false,"), '设置页必须同步提供合并后的画面与滤镜模块')
assert(!source.includes("disclosure('滤镜与光照', false,") && !source.includes("disclosure('动态视频', false,"), '设置页不得保留重复的滤镜或视频速度模块')
assert.equal((source.match(/fxSlider\('speed'/g) || []).length, 1, '视频播放速度只能保留一套共享控件')
const basePictureSource = source.slice(source.indexOf('const BasePictureControls ='), source.indexOf('const FilterControls ='))
for (const key of ['opacity', 'brightness', 'contrast', 'saturate', 'blur']) assert(basePictureSource.includes("['" + key + "'"), '基础画面缺少控件: ' + key)
const filterControlsSource = source.slice(source.indexOf('const FilterControls ='), source.indexOf('// 静态背景'))
assert(!filterControlsSource.includes('data-picture-key'), '滤镜子组不得重复渲染基础画面控件')
assert(filterControlsSource.includes("const videoReady =") && filterControlsSource.includes("fxSlider('speed'"), '视频速度必须在共享滤镜控件内按类型禁用')
const setBgParamsSource = source.slice(source.indexOf('const setBgParams ='), source.indexOf('const filterFxSnapshot ='))
assert(!setBgParamsSource.includes('isFilterAvailable'), '基础画面参数不得被图片/视频滤镜范围门控')
assert(source.includes("id: 'wp-wallpaper-library'") && source.includes("'aria-controls': 'wp-wallpaper-library'"), '壁纸合集开关必须关联侧向抽屉')
assert(source.includes("className: 'wp-pull'"), '收起状态必须使用顶部拉绳入口')
assert(source.includes("'aria-controls': 'wp-wallpaper-panel'"), '顶部拉绳必须关联壁纸面板')
assert(source.includes("localStorage.getItem('wp-pull-pos')") && source.includes('onPointerDown: onPullDown') && source.includes('onClick: onPullClick'), '顶部拉绳必须支持可持久化拖动且拖动不误触展开')
assert(source.includes('@media (prefers-reduced-motion: reduce)'), '拉绳展开动效必须尊重减少动态效果设置')
assert(source.includes("disclosure('v' + PLUGIN_VERSION + ' 使用说明与注意事项', true,"), '设置页必须展示当前版本注意事项')
assert(source.includes('const panelSession = { items: null, cfg: null, folderTags: null, scanned: false }'), '面板数据必须按会话复用')
assert(source.includes('if (!panelSession.items) load()'), '重复展开面板不得重新加载已有列表')
assert(source.includes('if (!panelSession.scanned)'), '订阅扫描每会话只能自动执行一次')
assert(source.includes('React.useState(panelSession.items) // 复用悬浮窗本会话列表'), '设置页背景合集必须复用本会话壁纸列表')

const cleanup = source.slice(source.indexOf('const cleanupScene ='), source.indexOf('const injectBg ='))
assert(cleanup.indexOf("await call({ action: 'native-detach' })") < cleanup.indexOf("windowName ? { action: 'close'"), '必须先恢复宿主界面再关闭旧场景')
assert(cleanup.includes('if (!sceneCleanupPromise)'), '并发切换和取消必须共用同一个场景清理任务')
assert(cleanup.includes('const closedOk =') && cleanup.includes('sceneCleanupNeeded = !closedOk'), '场景关闭失败时必须保留后续重试状态')
const inject = source.slice(source.indexOf('const injectBg ='), source.indexOf('const clearBg ='))
assert(inject.indexOf('const seq = ++injectSeq') < inject.indexOf('await cleanupScene(previousNativeWindow)'), '注入令牌必须先于原生层清理')
assert(inject.includes("call({ action: 'close', window: nativeWindow.window })"), '失效注入必须精确关闭自己的窗口')
assert(inject.indexOf("const sceneStatus = item.type === 'scene'") < inject.indexOf('await cleanupScene(previousNativeWindow)'), '场景状态查询必须与旧场景清理并行')
assert(inject.includes('sceneCleanupNeeded || previousNativeWindow || bgStore.capId'), '仅首次或确有场景窗口时执行原生清理')
assert(inject.includes("const sceneWindowName = 'dsh-we-scene-' + seq"), '并发场景注入必须使用独立窗口名')
assert(inject.includes('insertCapBg(item.id, sceneWindowName)'), '实时捕获必须使用当前场景的精确窗口名')
assert(inject.includes('st && st.ok && st.cached && !musicStore.on'), '静音场景必须优先使用已有转码缓存')
assert(inject.includes('!noTranscode && !musicStore.on'), '开声场景不得启动无音轨自动转码')
assert(inject.includes('st && st.processing && !musicStore.on'), '开声场景不得被后台无音轨缓存升级覆盖')
assert(inject.includes('seq !== injectSeq || musicStore.on'), '转码完成回调必须在开声后失效')
const staleAttachBranch = inject.slice(inject.indexOf('if (seq !== injectSeq)', inject.indexOf("action: 'native-attach'")), inject.indexOf('if (attached && attached.ok)', inject.indexOf("action: 'native-attach'")))
assert(staleAttachBranch.includes("action: 'close', window: nativeWindow.window") && !staleAttachBranch.includes('cleanupScene(') && !staleAttachBranch.includes("action: 'native-detach'"), '失效挂载只能精确关闭自己的窗口，不得全局分离新场景')
assert(staleAttachBranch.includes('sceneCleanupNeeded = true'), '失效窗口关闭失败时必须保留后续清理状态')
const attachedBranch = inject.indexOf('if (attached && attached.ok)', inject.indexOf("action: 'native-attach'"))
const attachedScene = inject.slice(attachedBranch, inject.indexOf('return', attachedBranch))
assert(attachedScene.includes('sceneCleanupNeeded = true'), '原生场景挂载后必须保持后续切换清理锁')
assert(attachedScene.includes('applyFxNow()'), '原生场景首次挂载必须立即清除不支持的滤镜层并同步基础画面状态')
assert(inject.indexOf('await cleanupScene(nativeWindow.window)') < inject.indexOf('if (seq !== injectSeq) return', inject.indexOf('await cleanupScene(nativeWindow.window)')), '原生挂载回退清理后必须再次校验注入令牌')
const videoInject = inject.slice(inject.indexOf("if (item.type === 'video'"), inject.indexOf('// web 壁纸'))
assert(!videoInject.includes("action: 'close'"), '视频切换不得重复关闭不存在的场景窗口')
const sceneFxSync = source.slice(source.indexOf('const syncNativeSceneFx ='), source.indexOf('const injectBg ='))
assert(sceneFxSync.includes('scheduleSceneFxMode') && sceneFxSync.includes('nativeSceneAttached'), '已挂载场景变更基础画面参数时必须重新注入为离屏捕获模式')
const sceneNeedsSource = source.slice(source.indexOf('const sceneNeedsRasterFx ='), source.indexOf('let sceneFxModeTimer'))
const sceneBg = { brightness: 100, contrast: 100, saturate: 100, blur: 0 }
const sceneFx = { on: true, invert: false, mirror: false, hue: 0, temperature: 0, sepia: 0, grayscale: 0, rgbR: 100, rgbG: 100, rgbB: 100, strength: 0, light: 0, light2: 0, light3: 0, vignette: 0, grain: 0 }
const sceneNeedsRasterFx = new Function('finiteOr', 'bgStore', 'fxStore', sceneNeedsSource + '; return sceneNeedsRasterFx')((value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback, sceneBg, sceneFx)
assert.equal(sceneNeedsRasterFx(), false, '中性场景不应额外开启捕获效果链')
sceneFx.light2 = 1
assert.equal(sceneNeedsRasterFx(), false, '图片/视频光源不得让场景进入捕获效果链')
sceneFx.light2 = 0; sceneBg.brightness = 99
assert.equal(sceneNeedsRasterFx(), true, '场景画面参数非中性时必须进入捕获效果链')
const filteredSceneBranch = inject.slice(inject.indexOf('if (nativeWindow && nativeWindow.ok && nativeWindow.window)'), inject.indexOf("action: 'native-attach'"))
assert(filteredSceneBranch.includes('sceneNeedsRasterFx()') && filteredSceneBranch.includes('insertCapBg(item.id, nativeWindow.window)'), '场景基础画面参数非中性时必须在原生挂载前切换为离屏原画捕获')
assert(source.includes('generation !== capGeneration'), '切换场景后旧捕获回调必须失效')
const clear = source.slice(source.indexOf('const clearBg ='), source.indexOf('const carouselCandidates'))
assert(clear.includes('++injectSeq'), '取消背景必须使进行中的注入失效')
assert(clear.includes('await cleanupScene(previousNativeWindow)'), '取消背景必须复用并等待原生层清理')
assert(!clear.includes('desktop-restore'), '取消背景不得强杀并重启 Wallpaper Engine')
const panelSource = source.slice(source.indexOf('const Panel ='), source.indexOf('// 侧边栏底部入口'))
const effectsButtonAt = panelSource.indexOf("'aria-controls': 'wp-effects-module'")
const effectsButtonSource = panelSource.slice(panelSource.lastIndexOf("h('button'", effectsButtonAt), panelSource.indexOf("h('button'", effectsButtonAt + 1))
assert(!effectsButtonSource.includes('disabled:'), '画面与滤镜合并入口不得随背景类型整体禁用')
assert(panelSource.includes('const freePanelLayout = viewport.w > 480') && panelSource.includes('freePanelLayout && winSize') && panelSource.includes('freePanelLayout && pos'), '窄屏时必须暂时忽略桌面端拖拽尺寸和位置')
const drawerLayout = panelSource.slice(panelSource.indexOf('const compactLibrary ='), panelSource.indexOf('return h(React.Fragment'))
assert(!drawerLayout.includes('winSize'), '主面板调整尺寸不得改变壁纸合集窗口的宽高或紧凑模式')
assert(!source.includes('const forceTranscode =') && !panelSource.includes('⚡ 强制转码'), '悬浮窗必须移除强制转码入口')
assert(panelSource.includes("+ PLUGIN_VERSION + ' 使用说明'") && panelSource.includes("'v' + PLUGIN_VERSION + ' 使用说明与注意事项'"), '悬浮窗设置说明必须明确标注当前版本')
assert(source.includes('.wp-effect-scope { grid-template-columns: 1fr; }') && !source.includes('.wp-effect-scope-item span { display: block; overflow: hidden;'), '窄屏效果范围说明必须单列完整显示')
assert.equal((source.match(/'重置滤镜'/g) || []).length, 1, '设置页不得重复渲染滤镜重置动作')

const sceneHostSource = fs.readFileSync(path.join(__dirname, '..', 'we-tools', 'SceneLayerHost.cs'), 'utf8')
assert(sceneHostSource.includes('EnumChildWindows') && sceneHostSource.includes('SetSceneAudio'), '原生音频控制必须能定位挂载后的子窗口并控制其进程会话')
const sceneRestore = sceneHostSource.slice(sceneHostSource.indexOf('static void Restore()'), sceneHostSource.indexOf('// 只匹配 DSH 专用场景窗口'))
assert(sceneRestore.includes('!IsWindow(parent) && IsWindow(scene)') && sceneRestore.includes('PostMessage(scene, WM_CLOSE'), 'DSH 宿主退出时必须关闭其场景窗口，不能还原为孤儿窗口')
const captureSource = fs.readFileSync(path.join(__dirname, '..', 'we-tools', 'capture.cs'), 'utf8')
assert(captureSource.includes('EnumChildWindows') && captureSource.includes('TitleMatches'), '共享捕获效果链必须能定位原生挂载后的场景子窗口')

const weSource = fs.readFileSync(path.join(__dirname, '..', 'we.js'), 'utf8')
const closeSource = weSource.slice(weSource.indexOf('function close('), weSource.indexOf('function simple('))
const closeRuntime = { windows: { 'dsh-we-a': {}, 'dsh-we-b': {} } }
const closeCalls = []
const closeWallpaper = new Function('runtime', 'control', 'saveRuntime', 'WIN_PREFIX', closeSource + '; return close')(
  closeRuntime,
  (args) => { closeCalls.push(args); return { status: args.includes('dsh-we-a') ? 1 : 0, stderr: 'blocked' } },
  () => {},
  'dsh-we-',
)
const closeResult = closeWallpaper(undefined, true)
assert.equal(closeResult.ok, false, '任一窗口关闭失败时 close 必须返回失败')
assert.ok(closeRuntime.windows['dsh-we-a'] && !closeRuntime.windows['dsh-we-b'], '关闭失败的窗口必须保留运行状态以供重试')
assert.deepEqual(closeResult.closed, ['dsh-we-b'], 'close 只能报告实际成功关闭的窗口')
const parseStart = weSource.indexOf('function parseArgs')
const parseEnd = weSource.indexOf('// ---- 常驻服务模式', parseStart)
const parseArgs = new Function(weSource.slice(parseStart, parseEnd) + '; return parseArgs')()
assert.deepEqual(parseArgs(['--no-activate', '--restore-desktop']).opts, { noActivate: true, restoreDesktop: true }, '短横线参数必须映射到驼峰字段')

// 最小 UI smoke：执行插件注册并验证合集按钮能真正展开侧向抽屉。
const uiRenderers = new Map()
let uiHookValues = [], uiHookIndex = 0
const fakeReact = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) { return typeof type === 'function' ? type(props || {}) : { type, props: props || {}, children } },
  useState(initial) {
    const index = uiHookIndex++
    if (!(index in uiHookValues)) uiHookValues[index] = typeof initial === 'function' ? initial() : initial
    return [uiHookValues[index], (value) => { uiHookValues[index] = typeof value === 'function' ? value(uiHookValues[index]) : value }]
  },
  useEffect() {},
  useRef(value) { return { current: value } },
}
const fakeSlots = {
  inject(_name, mount) { mount() },
  register(meta, render) { uiRenderers.set(meta.id, render) },
}
const fakeTimer = { interval() { return () => {} }, timeout() { return () => {} } }
const fakeStorage = { getItem() { return null }, setItem() {} }
const fakeWindow = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1 }
const uiPlugin = new Function('styles', 'React', 'host', 'localStorage', 'window', 'document', 'Image', source)(
  { insert() {} }, fakeReact, { call() { return Promise.resolve({ ok: true }) } },
  fakeStorage, fakeWindow, {}, function Image () {})
uiPlugin.apply({ get(name) { return name === 'slots' ? fakeSlots : name === 'timer' ? fakeTimer : undefined } })
const renderPanel = () => { uiHookIndex = 0; return uiRenderers.get('wallpaper.panel')() }
const findUi = (node, match) => {
  if (Array.isArray(node)) { for (const child of node) { const found = findUi(child, match); if (found) return found } return null }
  if (!node || typeof node !== 'object') return null
  if (match(node)) return node
  return findUi(node.children || [], match)
}
const findAllUi = (node, match, result = []) => {
  if (Array.isArray(node)) { for (const child of node) findAllUi(child, match, result); return result }
  if (!node || typeof node !== 'object') return result
  if (match(node)) result.push(node)
  findAllUi(node.children || [], match, result)
  return result
}
const uiText = (node) => {
  if (Array.isArray(node)) return node.map(uiText).join('')
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  return uiText(node.children || [])
}
let uiTree = renderPanel()
const toolGroup = findUi(uiTree, (node) => node.props && node.props['aria-label'] === '壁纸工具')
const toolButtons = findAllUi(toolGroup, (node) => node.type === 'button')
assert.equal(toolButtons.length, 3, '工具区必须收敛为画面与滤镜、声音、设置三个按钮')
for (const button of toolButtons) {
  assert.equal(button.props.type, 'button', '工具区按钮必须禁止宿主表单默认提交')
  assert.equal(typeof button.props.onClick, 'function', '工具区存在失效按钮')
}
const effectsButton = findUi(uiTree, (node) => node.props && node.props['aria-controls'] === 'wp-effects-module')
assert.ok(effectsButton, '控制面板必须渲染画面与滤镜合并入口')
assert.equal(!!effectsButton.props.disabled, false, '非图片/视频背景仍必须能打开通用画面调整')
effectsButton.props.onClick()
uiTree = renderPanel()
const effectsModule = findUi(uiTree, (node) => node.props && node.props.id === 'wp-effects-module')
assert.ok(effectsModule, '画面与滤镜按钮必须实际展开合并模块')
const pictureInputs = findAllUi(effectsModule, (node) => node.type === 'input' && node.props && node.props['data-picture-key'])
assert.deepEqual(pictureInputs.map((node) => node.props['data-picture-key']).sort(), ['blur', 'brightness', 'contrast', 'opacity', 'saturate'], '合并模块必须只渲染一套完整基础画面控件')
const unavailableEffect = findUi(effectsModule, (node) => node.props && node.props.className === 'wp-filter-unavailable')
assert.ok(unavailableEffect && unavailableEffect.props.role === 'status', '不支持类型时只能禁用滤镜子组并说明原因')
const scopeGuide = findUi(effectsModule, (node) => node.props && node.props['aria-label'] === '效果使用范围与条件')
assert.match(uiText(scopeGuide), /基础画面.*全部背景|图片 · 视频 · 网页 · 场景 · 应用/, '合并模块必须注明基础画面的适用范围')
const libraryButton = findUi(uiTree, (node) => node.props && node.props['aria-controls'] === 'wp-wallpaper-library')
assert.ok(libraryButton, '控制面板必须渲染合集开关')
libraryButton.props.onClick()
uiTree = renderPanel()
assert.ok(findUi(uiTree, (node) => node.props && node.props.id === 'wp-wallpaper-library'), '合集开关必须实际展开侧向合集')
uiHookValues = []; uiHookIndex = 0
const settingsTree = uiRenderers.get('wallpaper.settings')()
const unavailableFilter = findUi(settingsTree, (node) => node.props && node.props.className === 'wp-filter-unavailable')
assert.ok(unavailableFilter && unavailableFilter.props.role === 'status', '设置页必须同步展示可访问的滤镜禁用说明')
const settingsPictureInputs = findAllUi(settingsTree, (node) => node.type === 'input' && node.props && node.props['data-picture-key'])
assert.equal(settingsPictureInputs.length, 5, '设置页合并模块必须同步复用一套基础画面控件')

// 直接运行源码中的清理函数：快速切换/取消时只允许一组 detach → close。
const cleanupFactorySource = "let nativeSceneWindow = 'dsh-we-old'\nlet nativeSceneAttached = true\n" + source.slice(source.indexOf('let sceneCleanupNeeded = true'), source.indexOf('const injectBg =')) + '\nreturn cleanupScene'
const cleanupCalls = []
let releaseDetach
const runtimeCleanup = new Function('call', cleanupFactorySource)((args) => {
  cleanupCalls.push(args)
  if (args.action === 'native-detach') return new Promise((resolve) => { releaseDetach = resolve })
  return Promise.resolve({ ok: true })
})
const firstCleanup = runtimeCleanup('dsh-we-old')
const sharedCleanup = runtimeCleanup('dsh-we-new')
assert.strictEqual(sharedCleanup, firstCleanup, '并发清理必须复用同一 Promise')
assert.deepEqual(cleanupCalls.map((item) => item.action), ['native-detach'], '分离未完成前不得重复清理或提前关闭')
releaseDetach({ ok: true })
Promise.all([firstCleanup, sharedCleanup]).then(() => {
  assert.deepEqual(cleanupCalls, [{ action: 'native-detach' }, { action: 'close', window: 'dsh-we-old' }], '共享清理必须严格先分离再关闭且只执行一次')
  console.log('wallpaper client checks passed')
}).catch((error) => { console.error(error); process.exitCode = 1 })
