/**
 * DSH Host 插件：wallpaper 工具 + 面板 RPC + 预览图路由（薄适配层）
 *
 * 用法：cordis_define 时把本文件内容作为 code.host（函数体，不含 return 包裹）；
 * 所有壁纸逻辑都在仓库 we.js，本插件 spawn node we.js <args> 执行并解析 JSON。
 *
 * 性能优化（2026-08 版）：
 * - we.js 内 steamRoot() 注册表查询已做缓存 + buildListItems 循环外提取
 *   （list 从 ~8s 降到 ~0.12s，60 倍；任意调用方式都生效）
 * - 面板搜索/类型/标签筛选在 Client 本地进行，只全量加载一次（0 重复 RPC）
 * - scan/poster 等慢命令走一次性进程，互不阻塞
 * - 曾尝试常驻 we 服务进程（--serve）进一步省 Node 启动，但 Host 沙箱下
 *   管道事件不可靠且易引发进程异常，已放弃，回退稳定的一次性进程
 */
return {
  apply(ctx) {
    // 仓库路径（we.js 所在目录）。
    // 分享安装：占位符 __DSH_WE_DIR__ 由 dsh/bootstrap.js 自动替换为本机绝对路径，
    // 生成的 plugin.host.ready.js 才用于 cordis_define；不要直接定义含占位符的模板。
    const WALLPAPER_DIR = '__DSH_WE_DIR__'
    const INSTALLED_NODE = '__DSH_NODE_EXE__'
    const WE_JS = WALLPAPER_DIR + '/we.js'
    const NATIVE_BRIDGE_JS = WALLPAPER_DIR + '/native-scene-bridge.js'
    // 转码全局节流：一次只允许一个后台转码任务
    let transcodeBusy = false

    const resolveNode = async () => {
      const subprocess = ctx.get('subprocess')
      if (!subprocess) throw new Error('subprocess 服务不可用')
      let node = null
      if (INSTALLED_NODE && INSTALLED_NODE !== '__DSH_NODE_EXE__') {
        const fs = ctx.get('fs')
        try {
          const target = await fs.resolve(INSTALLED_NODE)
          if (await fs.stat(target)) node = INSTALLED_NODE
        } catch (e) { node = null }
      }
      if (!node) {
        try { node = await subprocess.resolveExecutable('node') } catch (e) { node = null }
      }
      if (!node) {
        const fs = ctx.get('fs')
        if (fs) {
          for (const cand of ['D:/node.js/node.exe', 'C:/Program Files/nodejs/node.exe', 'C:/Program Files (x86)/nodejs/node.exe']) {
            try {
              const target = await fs.resolve(cand)
              const info = await fs.stat(target)
              if (info) { node = cand; break }
            } catch (e) { /* next */ }
          }
        }
      }
      if (!node) throw new Error('无法定位 Node.js（we.js 需要 node 运行）')
      return node
    }

    // 一次性进程执行 we.js 命令（收集 stdout/stderr，解析单行 JSON）
    const runWe = async (args) => {
      const node = await resolveNode()
      const subprocess = ctx.get('subprocess')
      const handle = subprocess.spawn({
        argv: [node, WE_JS, ...args],
        cwd: WALLPAPER_DIR,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 8 * 1024 * 1024 },
          stderr: { maxBytes: 2 * 1024 * 1024 },
        },
        graceMs: 180000,
      })
      const outcome = await handle.done
      const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
      const err = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
      let data = null
      try { data = JSON.parse(out) } catch (e) { /* fallthrough */ }
      if (!data || typeof data !== 'object') {
        throw new Error('we.js 输出异常 (exit ' + String(outcome.exitCode) + '): ' + String(err || out || '').slice(0, 400))
      }
      if (data.ok === false) throw new Error(String(data.error || 'we.js 执行失败'))
      return data
    }
    const runNativeBridge = async (args) => {
      const node = await resolveNode()
      const subprocess = ctx.get('subprocess')
      const handle = subprocess.spawn({ argv: [node, NATIVE_BRIDGE_JS, ...args], cwd: WALLPAPER_DIR, stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 * 1024 }, stderr: { maxBytes: 1024 * 1024 } }, graceMs: 15000 })
      const outcome = await handle.done
      const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
      const err = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
      if (outcome.exitCode !== 0) throw new Error(String(err || out || 'native bridge failed').slice(0, 300))
      return JSON.parse(out || '{}')
    }

    // ---- 预览图路由（只读服务 workshop 内 preview 文件）----
    let catalogMap = null
    let catalogLoading = null
    const loadCatalog = () => {
      if (catalogMap) return Promise.resolve(catalogMap)
      if (catalogLoading) return catalogLoading
      catalogLoading = runWe(['list']).then((data) => {
        const map = {}
        const items = Array.isArray(data.items) ? data.items : []
        for (const it of items) {
          if (it && (it.file || it.preview)) {
            map[it.id] = { type: it.type, mainAbs: it.absFile || null, previewAbs: it.previewAbs || null }
          }
        }
        catalogMap = map
        return map
      }).catch(() => { catalogMap = {}; return catalogMap }).finally(() => { catalogLoading = null })
      return catalogLoading
    }
    const refreshCatalog = () => { catalogMap = null }
    const MIME = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
      '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
      '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
    }
    // web 壁纸在 sandbox iframe 内运行，父页无法直接访问它的媒体元素。
    // 仅向本地壁纸 HTML 注入一个消息桥，接收父窗口的 DSH 背景声音状态。
    const WEB_AUDIO_BRIDGE = `<script data-dsh-wallpaper-audio>(function () {
  var on = false
  var known = new Set()
  var syncOne = function (media) { known.add(media); media.muted = !on }
  var sync = function () {
    document.querySelectorAll('audio,video').forEach(syncOne)
    known.forEach(function (media) { try { media.muted = !on } catch (e) {} })
  }
  var play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () { syncOne(this); return play.apply(this, arguments) }
  addEventListener('message', function (event) {
    if (event.source !== parent || !event.data || event.data.type !== 'dsh-wallpaper-audio') return
    on = !!event.data.on
    sync()
  })
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true })
  sync()
})()</script>`
    const withWebAudioBridge = (bytes, ext) => {
      if (ext !== '.html' && ext !== '.htm') return bytes
      const html = new TextDecoder('utf-8').decode(bytes)
      if (html.indexOf('data-dsh-wallpaper-audio') >= 0) return bytes
      const head = /<head(?:\s[^>]*)?>/i.exec(html)
      const at = head ? head.index + head[0].length : 0
      return html.slice(0, at) + WEB_AUDIO_BRIDGE + html.slice(at)
    }
    const MEDIA_FILE_RE = /\.(mp4|webm|m4v|mov|avi|mkv|png|jpe?g|gif|webp)$/i

    const serveRoute = async (req, res, pathPrefix, pick) => {
      const pathname = String(req.url || '').split('?')[0]
      const id = decodeURIComponent(pathname.slice(pathPrefix.length))
      if (!/^[A-Za-z0-9._-]+$/.test(id)) { res.writeHead(400); res.end('bad id'); return }
      const map = await loadCatalog()
      const entry = map[id]
      const abs = entry ? pick(entry) : null
      if (!abs) { res.writeHead(404); res.end('not found'); return }
      const fs = ctx.get('fs')
      if (!fs) { res.writeHead(503); res.end('fs unavailable'); return }
      const target = await fs.resolve(abs)
      const bytes = await fs.readBytes(target, undefined, 512 * 1024 * 1024)
      const ext = String(abs.slice(abs.lastIndexOf('.'))).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' })
      res.end(bytes)
    }

    // web 壁纸目录静态服务：/wallpaper-web/<id>/<file...>，默认 index.html；防目录穿越
    const serveWebRoute = async (req, res) => {
      const pathname = String(req.url || '').split('?')[0]
      const rest = decodeURIComponent(pathname.slice('/wallpaper-web/'.length))
      const slash = rest.indexOf('/')
      const id = slash >= 0 ? rest.slice(0, slash) : rest
      const file = slash >= 0 ? rest.slice(slash + 1) : ''
      if (!/^[A-Za-z0-9._-]+$/.test(id)) { res.writeHead(400); res.end('bad id'); return }
      const rel = (file || 'index.html').replace(/\\/g, '/')
      if (rel.indexOf('..') >= 0 || rel.indexOf('\0') >= 0) { res.writeHead(400); res.end('bad path'); return }
      const map = await loadCatalog()
      const entry = map[id]
      if (!entry || !entry.mainAbs || entry.type !== 'web') { res.writeHead(404); res.end('not found'); return }
      const dir = entry.mainAbs.slice(0, entry.mainAbs.lastIndexOf('/'))
      const abs = dir + '/' + rel
      if (abs.indexOf(dir) !== 0) { res.writeHead(400); res.end('bad path'); return }
      const fs = ctx.get('fs')
      if (!fs) { res.writeHead(503); res.end('fs unavailable'); return }
      const target = await fs.resolve(abs)
      const info = await fs.stat(target)
      if (!info) { res.writeHead(404); res.end('not found'); return }
      const bytes = await fs.readBytes(target, undefined, 512 * 1024 * 1024)
      const ext = String(abs.slice(abs.lastIndexOf('.'))).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' })
      res.end(withWebAudioBridge(bytes, ext))
    }

    const webServer = ctx.get('webServer')
    if (webServer) {
      // 用 ctx.effect 包裹使路由随 fiber 自动清理；若路径已被旧运行残留占用则复用（自愈）
      try {
        ctx.effect(() => webServer.register({
          kind: 'prefix',
          path: '/wallpaper-preview',
          async handler(req, res) {
            try {
              await serveRoute(req, res, '/wallpaper-preview/', (entry) => entry.previewAbs)
            } catch (e) {
              try { res.writeHead(500); res.end('error') } catch (err) { /* ignore */ }
            }
          },
        }))
      } catch (e) {
        console.log('wallpaper: 预览路由已存在（可能为旧运行残留），沿用现有路由: ' + (e && e.message ? e.message : String(e)))
      }
      // 背景媒体路由：video/image 类型返回主文件（mp4/webm/原图），其余返回预览图
      try {
        ctx.effect(() => webServer.register({
          kind: 'prefix',
          path: '/wallpaper-media',
          async handler(req, res) {
            try {
              await serveRoute(req, res, '/wallpaper-media/', (entry) => {
                if ((entry.type === 'video' || entry.type === 'image') && entry.mainAbs && MEDIA_FILE_RE.test(entry.mainAbs)) return entry.mainAbs
                return entry.previewAbs
              })
            } catch (e) {
              try { res.writeHead(500); res.end('error') } catch (err) { /* ignore */ }
            }
          },
        }))
      } catch (e) {
        console.log('wallpaper: 媒体路由已存在（可能为旧运行残留），沿用现有路由: ' + (e && e.message ? e.message : String(e)))
      }
      // 视频海报帧路由：ffmpeg 抽取高清帧（缓存 cache/poster-<id>.jpg）；低频慢命令，一次性进程
      try {
        ctx.effect(() => webServer.register({
          kind: 'prefix',
          path: '/wallpaper-poster',
          async handler(req, res) {
            try {
              const pathname = String(req.url || '').split('?')[0]
              const id = decodeURIComponent(pathname.slice('/wallpaper-poster/'.length))
              if (!/^[A-Za-z0-9._-]+$/.test(id)) { res.writeHead(400); res.end('bad id'); return }
              const p = await runWe(['poster', id])
              const abs = p && p.poster
              if (!abs) { res.writeHead(404); res.end('not found'); return }
              const fs = ctx.get('fs')
              if (!fs) { res.writeHead(503); res.end('fs unavailable'); return }
              const target = await fs.resolve(abs)
              const bytes = await fs.readBytes(target, undefined, 64 * 1024 * 1024)
              res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' })
              res.end(bytes)
            } catch (e) {
              try { res.writeHead(500); res.end('error') } catch (err) { /* ignore */ }
            }
          },
        }))
      } catch (e) {
        console.log('wallpaper: 海报路由已存在（可能为旧运行残留），沿用现有路由: ' + (e && e.message ? e.message : String(e)))
      }
      // web 壁纸目录静态服务（iframe 原画质注入用）
      try {
        ctx.effect(() => webServer.register({
          kind: 'prefix',
          path: '/wallpaper-web',
          async handler(req, res) {
            try {
              await serveWebRoute(req, res)
            } catch (e) {
              try { res.writeHead(500); res.end('error') } catch (err) { /* ignore */ }
            }
          },
        }))
      } catch (e) {
        console.log('wallpaper: web 路由已存在（可能为旧运行残留），沿用现有路由: ' + (e && e.message ? e.message : String(e)))
      }
      // 场景壁纸引擎渲染捕获：WE 用 playInWindow 原画质渲染到窗口（藏在 DSH 后面），
      // 这里调 we-tools/capture.exe（PrintWindow + PW_RENDERFULLCONTENT）抓取 GPU 合成后的窗口画面，
      // 输出 JPEG 喂给浏览器做动态背景。每帧先 -bottom 置底，保证窗口始终在 DSH 之下不可见。
      const CAPTURE_EXE = WALLPAPER_DIR + '/we-tools/capture.exe'
      try {
        ctx.effect(() => webServer.register({
          kind: 'prefix',
          path: '/wallpaper-capture',
          async handler(req, res) {
            try {
              const requestUrl = String(req.url || '')
              const queryAt = requestUrl.indexOf('?')
              const pathname = queryAt < 0 ? requestUrl : requestUrl.slice(0, queryAt)
              const id = decodeURIComponent(pathname.slice('/wallpaper-capture/'.length))
              if (!/^[A-Za-z0-9._-]+$/.test(id)) { res.writeHead(400); res.end('bad id'); return }
              const windowParam = (queryAt < 0 ? '' : requestUrl.slice(queryAt + 1)).match(/(?:^|&)window=([^&]*)/)
              const windowName = windowParam ? decodeURIComponent(windowParam[1].replace(/\+/g, ' ')) : ('dsh-we-' + id)
              if (!/^dsh-we-[A-Za-z0-9._-]+$/.test(windowName)) { res.writeHead(400); res.end('bad window'); return }
              const fs = ctx.get('fs')
              const subprocess = ctx.get('subprocess')
              if (!fs || !subprocess) { res.writeHead(503); res.end('unavailable'); return }
              const out = WALLPAPER_DIR + '/cache/cap-' + id + '.jpg'
              const handle = subprocess.spawn({
                argv: [CAPTURE_EXE, '-title', windowName, '-bottom', out, '80'],
                cwd: WALLPAPER_DIR,
                stdio: {
                  stdin: 'ignore',
                  stdout: { maxBytes: 4096 },
                  stderr: { maxBytes: 4096 },
                },
                graceMs: 30000,
              })
              const outcome = await handle.done
              if (outcome.exitCode !== 0) { res.writeHead(404); res.end('capture failed'); return }
              const target = await fs.resolve(out)
              const bytes = await fs.readBytes(target, undefined, 64 * 1024 * 1024)
              res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' })
              res.end(bytes)
            } catch (e) {
              console.error('wallpaper: 场景捕获失败: ' + (e && e.stack ? e.stack : String(e)))
              try { res.writeHead(500); res.end('error') } catch (err) { /* ignore */ }
            }
          },
        }))
      } catch (e) {
        console.log('wallpaper: 捕获路由已存在（可能为旧运行残留），沿用现有路由: ' + (e && e.message ? e.message : String(e)))
      }
      // 转码缓存视频路由：场景壁纸预转码 mp4（WE 引擎渲染录制成视频缓存），浏览器直接播放（60fps 容器、零捕获开销）
      try {
        ctx.effect(() => webServer.register({
          kind: 'prefix',
          path: '/wallpaper-transcode',
          async handler(req, res) {
            try {
              const pathname = String(req.url || '').split('?')[0]
              const id = decodeURIComponent(pathname.slice('/wallpaper-transcode/'.length))
              if (!/^[A-Za-z0-9._-]+$/.test(id)) { res.writeHead(400); res.end('bad id'); return }
              const st = await runWe(['transcode-status', id])
              const abs = st && st.cached && st.file
              if (!abs) { res.writeHead(404); res.end('not found'); return }
              const fs = ctx.get('fs')
              if (!fs) { res.writeHead(503); res.end('fs unavailable'); return }
              const target = await fs.resolve(abs)
              const bytes = await fs.readBytes(target, undefined, 512 * 1024 * 1024)
              res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=3600' })
              res.end(bytes)
            } catch (e) {
              try { res.writeHead(500); res.end('error') } catch (err) { /* ignore */ }
            }
          },
        }))
      } catch (e) {
        console.log('wallpaper: 转码路由已存在（可能为旧运行残留），沿用现有路由: ' + (e && e.message ? e.message : String(e)))
      }
    }

    // ---- 工具注册辅助 ----
    const slimItem = (it) => ({
      id: it.id, title: it.title, type: it.type, source: it.source,
      tags: Array.isArray(it.tags) ? it.tags : [],
      missing: !!it.missing,
      compat: it.compat || null, // 场景壁纸兼容性：'audio'(音频响应)|'time'(时间显示)|null(可转码)
      previewUrl: it.id ? '/wallpaper-preview/' + it.id : null,
      mediaUrl: it.id ? '/wallpaper-media/' + it.id : null,
      posterUrl: it.type === 'video' ? '/wallpaper-poster/' + it.id : null,
      webUrl: it.type === 'web' ? '/wallpaper-web/' + it.id + '/' : null,
    })
    const define = (name, description, parameters, outputSchema, execute) => {
      // 归一化：对象类型 schema 必须显式声明 additionalProperties（DSH schema 校验要求）
      const normObject = (s) => {
        if (!s || typeof s !== 'object') return s
        if (s.type === 'object' && !Object.prototype.hasOwnProperty.call(s, 'additionalProperties')) s.additionalProperties = true
        if (s.type === 'array' && s.items) normObject(s.items)
        if (s.properties) for (const k of Object.keys(s.properties)) normObject(s.properties[k])
        return s
      }
      normObject(parameters)
      normObject(outputSchema)
      const tool = harness.defineTool({
        name, description, parameters,
        output: {
          schema: outputSchema,
          render: (_args, value) => {
            const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
            return [{ type: 'text', text }]
          },
        },
        execute,
      })
      // 工具注册走进程级全局表：dev-plugins-bootstrap 会给每个会话自动挂载本插件，
      // 同进程内第一个激活的会话已注册全部 wallpaper_* 工具，其余会话重复注册会抛
      // 「tool X is already registered」导致 host 半区整体失败。工具实现完全相同且对
      // 当前 Agent 全局可见，这里捕获冲突并跳过注册即可（面板/RPC/路由不受影响）。
      try {
        harness.registerTool(ctx, tool)
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e)
        if (msg.indexOf('already registered') >= 0) {
          console.log('wallpaper: 工具 ' + name + ' 已由其他会话注册（进程级全局表），跳过重复注册')
        } else {
          throw e
        }
      }
    }
    const strProps = (p, desc) => Object.assign({ type: 'string', description: desc }, p)

    // 1) wallpaper_list
    define('wallpaper_list', '列出 Wallpaper Engine 订阅壁纸清单（workshop + 本地），支持按关键词/类型/标签过滤。',
      {
        type: 'object',
        properties: {
          query: strProps({}, '关键词过滤（标题或 ID）'),
          type: strProps({ enum: ['scene', 'video', 'web', 'image', 'application', 'other'] }, '类型过滤'),
          tag: strProps({}, '标签过滤（如 星空/喜欢/动画人物）'),
        },
      },
      { type: 'object', properties: { count: { type: 'number' }, items: { type: 'array' } } },
      async (args) => {
        const flags = []
        if (args.query) flags.push('--q', String(args.query))
        if (args.type) flags.push('--type', String(args.type))
        if (args.tag) flags.push('--tag', String(args.tag))
        const data = await runWe(['list', ...flags])
        const items = Array.isArray(data.items) ? data.items : []
        return { count: items.length, items: items.map(slimItem) }
      })

    // 2) wallpaper_apply
    define('wallpaper_apply', '在独立窗口中播放指定壁纸（默认无边框全屏，绝不改动桌面壁纸设置）。应用新壁纸会替换上一个 dsh-we 窗口。',
      {
        type: 'object',
        properties: {
          target: strProps({}, '壁纸 ID（来自 wallpaper_list）或文件路径'),
          preset: strProps({ enum: ['full', 'right-half', 'right-twothirds', 'left-half', 'small'] }, '窗口几何预设（full=全屏，right-half=右半屏避开 DSH 界面，等）'),
          width: { type: 'number', description: '自定义窗口宽度（逻辑像素）' },
          height: { type: 'number', description: '自定义窗口高度' },
          x: { type: 'number', description: '自定义窗口 X（逻辑像素）' },
          y: { type: 'number', description: '自定义窗口 Y' },
          monitor: { type: 'number', description: '（多显示器扩展）指定显示器索引，占用该屏壁纸槽' },
        },
        required: ['target'],
      },
      { type: 'object', properties: { ok: { type: 'boolean' }, window: { type: 'string' }, title: { type: 'string' }, geometry: { type: 'object' } } },
      async (args) => {
        const flags = []
        if (args.preset) flags.push('--preset', String(args.preset))
        if (args.width) flags.push('--width', String(args.width))
        if (args.height) flags.push('--height', String(args.height))
        if (args.x) flags.push('--x', String(args.x))
        if (args.y) flags.push('--y', String(args.y))
        if (args.monitor !== undefined) flags.push('--monitor', String(args.monitor))
        const data = await runWe(['apply', String(args.target), ...flags])
        return { ok: true, window: data.window, title: data.title, geometry: data.geometry }
      })

    // 3) wallpaper_geometry
    define('wallpaper_geometry', '调整已打开壁纸窗口的位置与尺寸（原位更新）。',
      {
        type: 'object',
        properties: {
          width: { type: 'number', description: '窗口宽度（逻辑像素）' },
          height: { type: 'number', description: '窗口高度' },
          x: { type: 'number', description: '窗口 X' },
          y: { type: 'number', description: '窗口 Y' },
          window: strProps({}, '窗口名（默认当前唯一 dsh-we 窗口）'),
        },
        required: ['width', 'height'],
      },
      { type: 'object', properties: { ok: { type: 'boolean' }, window: { type: 'string' }, geometry: { type: 'object' } } },
      async (args) => {
        const data = await runWe(['geometry', args.window || 'dsh-we', String(args.width), String(args.height), String(args.x || 0), String(args.y || 0)])
        return { ok: true, window: data.window, geometry: data.geometry }
      })

    // 4) wallpaper_control
    define('wallpaper_control', '控制壁纸播放：pause 暂停 / play 播放 / mute 静音 / unmute 取消静音 / next 下一张 / prev 上一张 / close 关闭壁纸窗口 / stop 全局停止（连带桌面壁纸，慎用）。',
      {
        type: 'object',
        properties: {
          action: strProps({ enum: ['pause', 'play', 'mute', 'unmute', 'next', 'prev', 'close', 'stop'] }, '控制动作'),
          window: strProps({}, '窗口名（next/prev/close 可用；close 缺省关闭全部 dsh-we 窗口）'),
        },
        required: ['action'],
      },
      { type: 'object', properties: { ok: { type: 'boolean' }, action: { type: 'string' } } },
      async (args) => {
        const action = String(args.action)
        if (action === 'close') {
          const data = args.window ? await runWe(['close', String(args.window)]) : await runWe(['close', '--all'])
          return { ok: true, action: 'close', closed: data.closed }
        }
        if (action === 'next' || action === 'prev') {
          const flags = args.window ? [String(args.window)] : []
          const data = await runWe([action, ...flags])
          return { ok: true, action: action, window: data.window, title: data.title }
        }
        if (action === 'stop') {
          await runWe(['stop', '--global'])
          return { ok: true, action: 'stop' }
        }
        const data = await runWe([action])
        return { ok: true, action: data.action || action }
      })

    // 5) wallpaper_state
    define('wallpaper_state', '查询 Wallpaper Engine 运行状态与当前打开的壁纸窗口。',
      { type: 'object', properties: {} },
      { type: 'object', properties: { running: { type: 'boolean' }, windows: { type: 'array' } } },
      async () => {
        const data = await runWe(['state'])
        return { running: !!data.running, windows: Array.isArray(data.windows) ? data.windows : [] }
      })

    // 6) wallpaper_scan
    define('wallpaper_scan', '重新扫描订阅壁纸，刷新 wallpapers.json 清单。',
      { type: 'object', properties: {} },
      { type: 'object', properties: { count: { type: 'number' }, items: { type: 'array' } } },
      async () => {
        const scanned = await runWe(['scan'])
        refreshCatalog() // Host 端预览图路由缓存失效
        const data = await runWe(['list'])
        const items = Array.isArray(data.items) ? data.items : []
        return { count: scanned.count || items.length, items: items.map(slimItem) }
      })

    // 7) wallpaper_props
    define('wallpaper_props', '读取（action=schema）或设置（action=set + json）指定壁纸的可调参数（如 rate/schemecolor/音量类滑块）。',
      {
        type: 'object',
        properties: {
          target: strProps({}, '壁纸 ID'),
          action: strProps({ enum: ['schema', 'set'] }, 'schema=读取参数列表；set=应用参数'),
          json: strProps({}, 'set 时传入参数 JSON，如 {"rate":10}'),
          window: strProps({}, '目标窗口名（默认 dsh-we-<id>）'),
        },
        required: ['target'],
      },
      { type: 'object', properties: { ok: { type: 'boolean' } } },
      async (args) => {
        if (args.action === 'set') {
          if (!args.json) throw new Error('action=set 需要 json 参数')
          const flags = args.window ? ['--window', String(args.window)] : []
          const data = await runWe(['props-set', String(args.target), String(args.json), ...flags])
          return { ok: true, window: data.window, applied: data.applied }
        }
        const data = await runWe(['props-schema', String(args.target)])
        return {
          ok: true, id: data.id, title: data.title, type: data.type,
          hasProperties: !!data.hasProperties, properties: data.properties || [],
        }
      })

    // ---- 面板通用 RPC（Client→Host）----
    harness.handle('we-call', async (args) => {
      try {
        return await weCallDispatch(args)
      } catch (e) {
        // 任何错误都转为面板可显示的 {ok:false,error}，避免运行卡片报错
        return { ok: false, error: e && e.message ? e.message : String(e) }
      }
    })
    const weCallDispatch = async (args) => {
      args = args && typeof args === 'object' ? args : {}
      const action = String(args.action || '')
      switch (action) {
        case 'list': {
          const flags = []
          if (args.query) flags.push('--q', String(args.query))
          if (args.type) flags.push('--type', String(args.type))
          if (args.tag) flags.push('--tag', String(args.tag))
          const data = await runWe(['list', ...flags])
          return { ok: true, items: (data.items || []).map(slimItem) }
        }
        case 'apply': {
          if (!args.target) return { ok: false, error: '缺少 target' }
          const flags = []
          if (args.preset) flags.push('--preset', String(args.preset))
          if (args.width) flags.push('--width', String(args.width))
          if (args.height) flags.push('--height', String(args.height))
          if (args.x) flags.push('--x', String(args.x))
          if (args.y) flags.push('--y', String(args.y))
          if (args.window) flags.push('--window', String(args.window))
          if (args.noActivate) flags.push('--no-activate') // 注入背景用：不抢前台，窗口放屏幕外
          if (args.restoreDesktop) flags.push('--restore-desktop') // 注入背景用：openWallpaper 后恢复/清空桌面壁纸，防止覆盖桌面
          const data = await runWe(['apply', String(args.target), ...flags])
          return { ok: true, window: data.window, title: data.title, geometry: data.geometry }
        }
        case 'close': {
          const flags = args.window ? ['close', String(args.window)] : ['close', '--all']
          return { ok: true, closed: (await runWe(flags)).closed }
        }
        case 'state': {
          const d = await runWe(['state'])
          return { ok: true, running: !!d.running, windows: Array.isArray(d.windows) ? d.windows : [] }
        }
        case 'native-attach': {
          if (!args.window) return { ok: false, error: '缺少场景窗口名' }
          return await runNativeBridge(['attach', String(args.window)])
        }
        case 'native-detach':
          return await runNativeBridge(['detach'])
        case 'native-audio': {
          if (!args.window || typeof args.on !== 'boolean') return { ok: false, error: '缺少场景窗口或音乐状态' }
          return await runNativeBridge(['audio', String(args.window), args.on ? 'on' : 'off'])
        }
        case 'pause': case 'play': case 'mute': case 'unmute':
          await runWe([action])
          return { ok: true }
        case 'next': {
          const data = await runWe(['next'])
          return { ok: true, title: data.title }
        }
        case 'prev': {
          const data = await runWe(['prev'])
          return { ok: true, title: data.title }
        }
        case 'props-schema': {
          if (!args.target) return { ok: false, error: '缺少 target' }
          return await runWe(['props-schema', String(args.target)])
        }
        case 'props-set': {
          if (!args.target || !args.json) return { ok: false, error: '缺少 target 或 json' }
          const flags = args.window ? ['--window', String(args.window)] : []
          const data = await runWe(['props-set', String(args.target), String(args.json), ...flags])
          return { ok: true, window: data.window, applied: data.applied }
        }
        case 'scan': {
          await runWe(['scan'])
          refreshCatalog()
          runWe(['cache-clean']).catch(() => {}) // scan 后清理孤儿转码缓存（取消订阅的壁纸）
          const data = await runWe(['list'])
          return { ok: true, items: (data.items || []).map(slimItem) }
        }
        case 'transcode': {
          // 场景壁纸预转码：后台任务，立即返回不阻塞（转码期间 client 轮询 transcode-status）
          // width/height 为 DSH 主界面物理尺寸——转码视频按此比例定制，注入 cover 不裁切
          if (!args.target) return { ok: false, error: '缺少 target' }
          if (transcodeBusy) return { ok: true, started: false, busy: true, message: '已有转码任务进行中' }
          const flags = []
          if (args.width) flags.push('--width', String(args.width))
          if (args.height) flags.push('--height', String(args.height))
          if (args.force) flags.push('--force') // 音频响应/时间显示壁纸强制转码（用户已知晓会丢失音乐律动/时间）
          transcodeBusy = true
          runWe(['transcode', String(args.target), ...flags]).then(() => { transcodeBusy = false }).catch(() => { transcodeBusy = false })
          return { ok: true, started: true }
        }
        case 'transcode-status': {
          if (!args.target) return { ok: false, error: '缺少 target' }
          return await runWe(['transcode-status', String(args.target)])
        }
        case 'cache-clean':
          return await runWe(['cache-clean'])
        case 'desktop-restore':
          return await runWe(['desktop-restore'])
        case 'config-get':
          return await runWe(['config-get'])
        case 'config-set': {
          if (!args.json) return { ok: false, error: '缺少 json' }
          return await runWe(['config-set', String(args.json)])
        }
        case 'tags':
          return await runWe(['tags'])
        default:
          return { ok: false, error: '未知动作: ' + action }
      }
    }
  },
}
