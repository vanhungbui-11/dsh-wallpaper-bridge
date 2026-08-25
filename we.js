#!/usr/bin/env node
/**
 * we.js — Wallpaper Engine 桥接 CLI（零依赖）
 *
 * 原理：WE 运行中时，运行 wallpaper32/64.exe -control <命令> 即把控制命令发给
 * 运行中的实例。本工具只通过官方 CLI 控制「窗口模式」壁纸（-playInWindow），
 * 绝不触碰桌面壁纸分配与 Windows 壁纸设置。
 *
 * 所有命令输出 JSON（stdout），供 DSH 插件解析。
 */
'use strict';

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const RUNTIME_FILE = path.join(ROOT, 'runtime.json');
const MANIFEST_FILE = path.join(ROOT, 'wallpapers.json');
const TITLES_FILE = path.join(ROOT, 'titles.json');
const LOCAL_TITLES_FILE = path.join(ROOT, 'titles.local.json');
const CACHE_DIR = path.join(ROOT, 'cache');
const CONFIG_FILE = path.join(ROOT, 'we.config.json');
const CAPTURE_EXE = path.join(ROOT, 'we-tools', 'capture.exe');
const TRANS_WIN_PREFIX = 'dsh-we-trans-';
const APP_ID = '431960';
const WIN_PREFIX = 'dsh-we-';
const CALIB_A = 'dsh-we-calib-a';
const CALIB_B = 'dsh-we-calib-b';
function posterPath(id) { return path.join(CACHE_DIR, 'poster-' + String(id) + '.jpg'); }

// ---- 转码缓存配置（we.config.json，可后期修改；网盘同步 = 把缓存目录指向同步盘）----
// cacheDir: 转码缓存目录（留空 = <仓库>/cache/transcode）
// syncDir : 网盘同步目录（可选，如 OneDrive/坚果云 下的某文件夹）
// sync    : 是否启用网盘同步（true 且 syncDir 非空时缓存写入 syncDir）
function loadConfig() {
  return Object.assign({ cacheDir: '', syncDir: '', sync: false }, readJson(CONFIG_FILE, {}));
}
function saveConfig(cfg) { writeJson(CONFIG_FILE, cfg); }
function effectiveCacheDir(cfg) {
  if (cfg.sync && cfg.syncDir) return String(cfg.syncDir).replace(/[\\/]+$/, '');
  if (cfg.cacheDir) return String(cfg.cacheDir).replace(/[\\/]+$/, '');
  return path.join(CACHE_DIR, 'transcode');
}
function transPath(dir, id, tmp) { return path.join(dir, 'trans-' + String(id) + '.mp4' + (tmp ? '.tmp' : '')); }
// 转码进度文件（transcode-run 每秒更新；transcode-status 读取；完成/失败后删除）
function transProgressPath(dir, id) { return path.join(dir, 'trans-' + String(id) + '.mp4.progress'); }
// ffmpeg 定位：FFMPEG 环境变量 > 常见安装路径 > PATH
let ffmpegCache = undefined;
function ffmpegBin() {
  if (ffmpegCache !== undefined) return ffmpegCache;
  const cands = [];
  if (process.env.FFMPEG) cands.push(String(process.env.FFMPEG));
  for (const root of ['E:\\ffmpeg\\bin', 'C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin', 'C:\\Program Files (x86)\\ffmpeg\\bin', path.join(ROOT, '..', 'ffmpeg', 'bin')]) {
    cands.push(path.join(root, 'ffmpeg.exe'));
  }
  for (const c of cands) {
    try { if (fs.existsSync(c)) { ffmpegCache = c; return c; } } catch (e) { /* next */ }
  }
  ffmpegCache = process.env.FFMPEG || 'ffmpeg'; // fallback 到 PATH
  return ffmpegCache;
}

// ---------------------------------------------------------------- utils

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function normPath(p) { return String(p).replace(/\\/g, '/'); }

const runtime = Object.assign({ calibration: null, windows: {} }, readJson(RUNTIME_FILE, {}));
function saveRuntime() { writeJson(RUNTIME_FILE, runtime); }

// ---------------------------------------------------------------- WE detection

// Steam 根目录缓存（reg 查询 ~60ms/次，列表构建会对每个 item 调用多次，必须缓存）
let steamRootCache = undefined;
function steamRoot() {
  if (steamRootCache !== undefined) return steamRootCache;
  const env = process.env.STEAM_ROOT;
  let result = null;
  if (env) {
    result = String(env).replace(/[\\/]+$/, '');
  } else {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (r.status === 0) {
      const m = String(r.stdout).match(/SteamPath\s+REG_SZ\s+(.+)/i);
      if (m) result = m[1].trim().replace(/[\\/]+$/, '');
    }
  }
  steamRootCache = result; // null 也缓存，避免反复查注册表
  return result;
}

function weDir() {
  const env = process.env.WE_INSTALL_DIR;
  const cands = [];
  if (env) cands.push(env);
  const s = steamRoot();
  if (s) cands.push(path.join(s, 'steamapps', 'common', 'wallpaper_engine'));
  cands.push(
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine',
    'C:\\Program Files\\Steam\\steamapps\\common\\wallpaper_engine',
  );
  for (const c of cands) {
    if (fs.existsSync(path.join(c, 'wallpaper64.exe')) || fs.existsSync(path.join(c, 'wallpaper32.exe'))) return c;
  }
  return null;
}

function runningBitness() {
  for (const bit of ['32', '64']) {
    const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq wallpaper${bit}.exe`, '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (r.status === 0 && new RegExp(`wallpaper${bit}\\.exe`, 'i').test(String(r.stdout))) return bit;
  }
  return null;
}

function weExePath() {
  const d = weDir();
  if (!d) throw new Error('未找到 Wallpaper Engine（可设置 WE_INSTALL_DIR 指向安装目录）');
  const bit = runningBitness() || process.env.WE_BITNESS || '32';
  return path.join(d, bit === '64' ? 'wallpaper64.exe' : 'wallpaper32.exe');
}

function control(args) {
  const exe = weExePath();
  const r = spawnSync(exe, ['-control', ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (r.error) throw new Error('控制命令执行失败: ' + r.error.message);
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

// ---------------------------------------------------------------- monitor / calibration

const PS_WIN = path.join(os.tmpdir(), 'dsh-we-win.ps1');
const PS_WIN_SRC = `param([string]$Needle)
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public class WEWin {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  public struct RECT { public int L,T,R,B; }
  public static string Find(string needle) {
    string result = "";
    EnumWindows((h,l) => {
      if (result != "") return true;
      if (IsWindowVisible(h)) {
        int n = GetWindowTextLength(h);
        if (n > 0) {
          var sb = new StringBuilder(n + 1);
          GetWindowText(h, sb, n + 1);
          if (sb.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) {
            RECT r; GetWindowRect(h, out r);
            result = r.L + "," + r.T + "," + r.R + "," + r.B;
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
"@
[WEWin]::Find($Needle)
`;

function measureWindowRect(name) {
  try {
    if (!fs.existsSync(PS_WIN)) fs.writeFileSync(PS_WIN, PS_WIN_SRC, 'utf8');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_WIN, name],
      { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    if (r.status === 0) {
      const t = String(r.stdout).trim();
      const parts = t.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        return { x: parts[0], y: parts[1], w: parts[2] - parts[0], h: parts[3] - parts[1] };
      }
    }
  } catch { /* fallthrough */ }
  return null;
}

function monitorPhysical() {
  const script = '(Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentHorizontalResolution } | Select-Object -First 1 CurrentHorizontalResolution,CurrentVerticalResolution | ConvertTo-Json -Compress)';
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (r.status === 0) {
    try {
      const j = JSON.parse(String(r.stdout));
      if (j && j.CurrentHorizontalResolution) return { w: Number(j.CurrentHorizontalResolution), h: Number(j.CurrentVerticalResolution) };
    } catch { /* fallthrough */ }
  }
  return null;
}

function defaultScene() {
  const d = weDir();
  const p = d && path.join(d, 'projects', 'defaultprojects', 'deep_space', 'scene.json');
  return p && fs.existsSync(p) ? p : null;
}

async function calibrate() {
  if (!defaultScene()) throw new Error('缺少校准用默认壁纸 deep_space');
  // A: 800x600 @ (0,0)  B: 400x300 @ (0,0)
  control(['openWallpaper', '-file', defaultScene(), '-playInWindow', CALIB_A, '-width', '800', '-height', '600', '-x', '0', '-y', '0', '-borderless']);
  await sleep(2600);
  const ra = measureWindowRect(CALIB_A);
  control(['closeWallpaper', '-location', CALIB_A]);
  if (!ra) throw new Error('校准窗口 A 测量失败（是否被遮挡？）');

  control(['openWallpaper', '-file', defaultScene(), '-playInWindow', CALIB_B, '-width', '400', '-height', '300', '-x', '0', '-y', '0', '-borderless']);
  await sleep(2600);
  const rb = measureWindowRect(CALIB_B);
  control(['closeWallpaper', '-location', CALIB_B]);
  if (!rb) throw new Error('校准窗口 B 测量失败');

  // 线性模型: rect = pass/scale + offset  =>  scale = dPass/dRect, offset = rect - pass/scale
  const scaleW = 400 / (ra.w - rb.w);
  const scaleH = 300 / (ra.h - rb.h);
  const scale = Math.round(((scaleW + scaleH) / 2) * 1000) / 1000;
  const offW = Math.round((ra.w - 800 / scale) * 100) / 100;
  const offH = Math.round((ra.h - 600 / scale) * 100) / 100;
  if (!(scale > 0.5 && scale < 3)) throw new Error('校准结果异常: ' + JSON.stringify({ scale, offW, offH }));
  runtime.calibration = { scale, offW, offH, at: new Date().toISOString() };
  saveRuntime();
  return runtime.calibration;
}

async function ensureCalibration() {
  if (runtime.calibration) return runtime.calibration;
  console.error('首次使用，执行窗口几何校准（将短暂弹出两个小窗口）');
  return calibrate();
}

function toPass(geom, cal) {
  return {
    x: geom.x * cal.scale,
    y: geom.y * cal.scale,
    w: (geom.w - cal.offW) * cal.scale,
    h: (geom.h - cal.offH) * cal.scale,
  };
}

function logicalScreen(cal) {
  const mon = monitorPhysical() || { w: 1920, h: 1080 };
  return { w: Math.round(mon.w / cal.scale), h: Math.round(mon.h / cal.scale) };
}

function presetRect(label, cal) {
  const s = logicalScreen(cal);
  switch (label) {
    case 'full': return { x: 0, y: 0, w: s.w, h: s.h, label };
    case 'right-half': return { x: Math.round(s.w / 2), y: 0, w: Math.round(s.w / 2), h: s.h, label };
    case 'right-twothirds': return { x: Math.round(s.w / 3), y: 0, w: Math.round((2 * s.w) / 3), h: s.h, label };
    case 'left-half': return { x: 0, y: 0, w: Math.round(s.w / 2), h: s.h, label };
    case 'small': {
      const w = Math.round(s.w / 2), h = Math.round(s.h / 2);
      return { x: s.w - w - 40, y: 40, w, h, label };
    }
    default: throw new Error('未知几何预设: ' + label);
  }
}

// ---------------------------------------------------------------- config / titles

function configGeneral() {
  const d = weDir();
  if (!d) return null;
  const p = path.join(d, 'config.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const user = process.env.USERNAME;
    const sec = (user && j[user]) || Object.keys(j).find((k) => k !== '?installdirectory');
    return sec && sec.general ? sec.general : null;
  } catch { return null; }
}

function recentTitleMap() {
  const g = configGeneral();
  const m = {};
  if (g && Array.isArray(g.wallpaperconfigrecent)) {
    for (const e of g.wallpaperconfigrecent) {
      if (e && e.title && e.config && e.config.selectedwallpapers) {
        for (const mon of Object.keys(e.config.selectedwallpapers)) {
          const f = e.config.selectedwallpapers[mon].file;
          if (f) m[normPath(f).toLowerCase()] = e.title;
        }
      }
    }
  }
  return m;
}

function folderTags() {
  const g = configGeneral();
  const map = {};
  if (g && g.browser && Array.isArray(g.browser.folders)) {
    for (const f of g.browser.folders) {
      if (f && f.title && f.items) for (const id of Object.keys(f.items)) (map[id] = map[id] || []).push(f.title);
    }
  }
  return map;
}

function titlesOverrides() { return Object.assign({}, readJson(TITLES_FILE, {}), readJson(LOCAL_TITLES_FILE, {})); }

// ---------------------------------------------------------------- scan

const VIDEO_RE = /\.(mp4|webm|m4v|mov|avi|mkv)$/i;
const IMAGE_RE = /\.(png|jpe?g|bmp|gif|webp)$/i;
const WEB_RE = /\.(html?|swf)$/i;

function detectType(mainFile) {
  const ext = path.extname(mainFile).toLowerCase();
  if (ext === '.pkg' || ext === '.json') return 'scene';
  if (VIDEO_RE.test(mainFile)) return 'video';
  if (WEB_RE.test(mainFile)) return 'web';
  if (IMAGE_RE.test(mainFile)) return 'image';
  if (ext === '.exe') return 'application';
  return 'other';
}

function rel(base, p) { return normPath(path.relative(base, p)); }

function buildItem(steam, itemDir, id, source, relBase, recentMap, tagsMap, overrides) {
  let project = null;
  const pjPath = path.join(itemDir, 'project.json');
  if (fs.existsSync(pjPath)) {
    try { project = JSON.parse(fs.readFileSync(pjPath, 'utf8')); } catch { project = null; }
  }
  // 主文件：project.json.file 字段优先，否则目录内最大非 preview 文件
  let mainFile = null;
  if (project && project.file) {
    const cand = path.join(itemDir, String(project.file));
    if (fs.existsSync(cand)) mainFile = cand;
  }
  if (!mainFile) {
    let best = null;
    for (const f of fs.readdirSync(itemDir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      if (/^preview\./i.test(f.name)) continue;
      if (f.name === 'project.json') continue;
      const full = path.join(itemDir, f.name);
      if (!best || f.name.length > best.name.length) best = { name: f.name, full };
    }
    if (best) mainFile = best.full;
  }
  if (!mainFile && project) mainFile = pjPath; // 仅 project.json 的场景

  const mainRel = mainFile ? rel(steam, mainFile) : null;
  const type = mainFile ? detectType(mainFile) : 'other';

  // 预览（jpg/png 优先于 gif——gif 动画预览通常分辨率极低）
  let previewRel = null;
  if (project && project.preview) {
    const cand = path.join(itemDir, String(project.preview));
    if (fs.existsSync(cand)) previewRel = rel(steam, cand);
  }
  if (!previewRel) {
    const files = fs.readdirSync(itemDir, { withFileTypes: true });
    for (const pref of [/(jpe?g|png)$/i, /\.gif$/i, /\.webp$/i]) {
      const hit = files.find((f) => f.isFile() && /^preview\./i.test(f.name) && pref.test(f.name));
      if (hit) { previewRel = rel(steam, path.join(itemDir, hit.name)); break; }
    }
  }

  // 标题
  let title = null;
  if (overrides[id]) title = overrides[id];
  if (!title && mainRel && recentMap[normPath(path.join(steam, mainRel)).toLowerCase()]) title = recentMap[normPath(path.join(steam, mainRel)).toLowerCase()];
  if (!title && mainFile && (type === 'video' || type === 'image' || type === 'web')) title = path.basename(mainFile, path.extname(mainFile));
  if (!title) title = id;

  return {
    id, source, type, title,
    file: mainRel,
    preview: previewRel,
    tags: tagsMap[id] || [],
    missing: false,
    compat: compatOf(itemDir, type), // 场景壁纸兼容性：'audio'|'time'|null（清单持久化，list 零开销）
  };
}

function scanAll() {
  const steam = steamRoot();
  if (!steam) throw new Error('未找到 Steam（设置 STEAM_ROOT 或确认注册表 SteamPath）');
  const recentMap = recentTitleMap();
  const tagsMap = folderTags();
  const overrides = titlesOverrides();

  const items = [];
  // workshop
  const wsDir = path.join(steam, 'steamapps', 'workshop', 'content', APP_ID);
  if (fs.existsSync(wsDir)) {
    for (const d of fs.readdirSync(wsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const relBase = path.join('steamapps', 'workshop', 'content', APP_ID, d.name);
      items.push(buildItem(steam, path.join(wsDir, d.name), d.name, 'workshop', relBase, recentMap, tagsMap, overrides));
    }
  }
  // myprojects / defaultprojects
  const we = weDir();
  if (we) {
    for (const sub of ['projects', 'myprojects']) {
      const base = we && sub === 'projects' ? path.join(we, 'projects', 'defaultprojects') : path.join(we, 'projects', 'myprojects');
      if (!fs.existsSync(base)) continue;
      for (const d of fs.readdirSync(base, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const abs = path.join(base, d.name);
        if (!fs.existsSync(path.join(abs, 'project.json')) && !fs.existsSync(path.join(abs, 'scene.json'))) continue;
        const id = 'local-' + d.name;
        const relBase = path.relative(steam, abs);
        const it = buildItem(steam, abs, id, 'local', relBase, recentMap, tagsMap, overrides);
        if (!it.title || it.title === id) it.title = d.name;
        items.push(it);
      }
    }
  }
  return { steam, items };
}

function writeManifest() {
  const { items } = scanAll();
  const manifest = {
    appId: APP_ID,
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
  writeJson(MANIFEST_FILE, manifest);
  return manifest;
}

function loadManifest() {
  const m = readJson(MANIFEST_FILE, null);
  if (!m || !Array.isArray(m.items)) throw new Error('wallpapers.json 不存在，请先运行: node we.js scan');
  return m;
}

function manifestAbs(file) {
  const steam = steamRoot();
  return steam ? path.join(steam, file) : file;
}

// ---------------------------------------------------------------- resolve target

function resolveTarget(target) {
  const m = loadManifest();
  const item = m.items.find((i) => i.id === target);
  if (item) {
    return { id: item.id, title: item.title, type: item.type, absFile: manifestAbs(item.file), previewAbs: item.preview ? manifestAbs(item.preview) : null, item };
  }
  // 直接路径
  if (fs.existsSync(target)) {
    const ext = path.extname(target);
    const id = 'path-' + path.basename(target, ext);
    return { id, title: path.basename(target, ext), type: detectType(target), absFile: target, previewAbs: null, item: null };
  }
  throw new Error('未找到壁纸: ' + target + '（运行 node we.js list 查看可用 id，或传文件路径）');
}

// ---------------------------------------------------------------- WE actions

async function ensure() {
  if (runningBitness()) return { started: false };
  const exe = weExePath();
  // -silent：静默启动到托盘，不弹出 WE 主窗口（注入场景时绝不在桌面拉起遮挡窗口）
  spawn(exe, ['-silent'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  await sleep(5000);
  if (runningBitness()) return { started: true };
  throw new Error('Wallpaper Engine 启动失败（请手动打开后重试）');
}

async function apply(target, opts) {
  const resolved = resolveTarget(target);
  if (!fs.existsSync(resolved.absFile)) throw new Error('壁纸文件不存在: ' + resolved.absFile);

  const useMonitor = opts.monitor !== undefined && opts.monitor !== null;
  const windowName = opts.window || WIN_PREFIX + resolved.id;
  // 安全约束：未指定窗口/显示器时默认窗口全屏（playInWindow，不触桌面壁纸分配）

  // --restore-desktop（注入背景专用）：openWallpaper 会顺带把壁纸应用到桌面壁纸槽，
  // 这里先记录注入前的桌面壁纸，注入完成后恢复/清空，保证桌面不被注入壁纸覆盖
  let preDesktop = null;
  if (opts.restoreDesktop && !useMonitor) {
    try {
      const g = configGeneral();
      const rec = g && g.wallpaperconfigrecent && g.wallpaperconfigrecent[0];
      const m0 = rec && rec.config && rec.config.selectedwallpapers && rec.config.selectedwallpapers.Monitor0;
      if (m0 && m0.file) preDesktop = m0.file;
    } catch (e) { /* ignore */ }
  }

  const cal = await ensureCalibration();

  let geom = null;
  let pass = null;
  if (useMonitor) {
    // 多显示器扩展：直接给 monitor 索引（会占用该显示器壁纸槽，需用户明确）
  } else {
    geom = opts.preset && opts.preset !== 'custom' ? presetRect(opts.preset, cal)
      : (opts.width ? { x: opts.x || 0, y: opts.y || 0, w: opts.width, h: opts.height || Math.round(opts.width * 9 / 16), label: 'custom' }
        : presetRect('full', cal));
    pass = toPass(geom, cal);
  }

  await ensure();

  // 关闭同名旧窗口（单窗切换 + 几何原位更新）
  if (runtime.windows[windowName]) control(['closeWallpaper', '-location', windowName]);

  const args = ['openWallpaper', '-file', resolved.absFile];
  if (useMonitor) {
    args.push('-monitor', String(opts.monitor));
  } else {
    args.push('-playInWindow', windowName);
    args.push('-width', String(Math.round(pass.w)), '-height', String(Math.round(pass.h)),
      '-x', String(Math.round(pass.x)), '-y', String(Math.round(pass.y)), '-borderless');
    // 默认激活抢前台；--no-activate 时不激活（注入背景用：窗口不覆盖用户界面，由 capture 置底隐藏）
    if (!opts.noActivate) args.push('-activate');
  }
  const r = control(args);
  await sleep(1500);

  // 注入完成 → 尽快恢复桌面壁纸：openWallpaper 会把注入壁纸应用到桌面（config 不一定同步，故无条件恢复）
  // 原桌面壁纸文件有效则恢复原壁纸，否则清空桌面壁纸槽（桌面回系统壁纸，绝不留注入壁纸）
  if (opts.restoreDesktop && !useMonitor) {
    await sleep(2000); // 必须等 openWallpaper 完成桌面槽应用（~1.5-2s）再恢复，过早则恢复无效
    try {
      if (preDesktop && fs.existsSync(preDesktop)) {
        control(['openWallpaper', '-file', preDesktop, '-monitor', '0']);
      } else {
        control(['stopWallpaper', '-monitor', '0']);
      }
    } catch (e) { /* ignore */ }
  }

  runtime.windows[windowName] = {
    id: resolved.id, title: resolved.title, type: resolved.type, file: resolved.absFile,
    mode: useMonitor ? 'monitor' : 'window', geometry: geom, windowName,
    appliedAt: new Date().toISOString(),
  };
  saveRuntime();

  return { ok: true, window: windowName, geometry: geom, pass, controlStatus: r.status, id: resolved.id, title: resolved.title, type: resolved.type };
}

async function geometry(windowName, w, h, x, y) {
  const win = runtime.windows[windowName];
  if (!win) throw new Error('窗口不存在: ' + windowName + '（请先 apply）');
  if (win.mode !== 'window') throw new Error('仅支持窗口模式几何调整');
  const cal = await ensureCalibration();
  const geom = { x, y, w, h, label: 'custom' };
  const pass = toPass(geom, cal);
  control(['openWallpaper', '-file', win.file, '-playInWindow', windowName,
    '-width', String(Math.round(pass.w)), '-height', String(Math.round(pass.h)),
    '-x', String(Math.round(pass.x)), '-y', String(Math.round(pass.y)), '-borderless', '-activate']);
  win.geometry = geom;
  saveRuntime();
  return { ok: true, window: windowName, geometry: geom };
}

function close(name, all) {
  const targets = all
    ? Object.keys(runtime.windows).filter((n) => n.startsWith(WIN_PREFIX))
    : (name ? [name] : Object.keys(runtime.windows).filter((n) => n.startsWith(WIN_PREFIX)));
  if (!targets.length) return { ok: true, closed: [] };
  const closed = [], failed = [];
  for (const n of targets) {
    try {
      const result = control(['closeWallpaper', '-location', n]);
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'closeWallpaper failed');
      delete runtime.windows[n];
      closed.push(n);
    } catch (error) {
      failed.push({ window: n, error: String(error && error.message || error) });
    }
  }
  saveRuntime();
  return failed.length ? { ok: false, closed, failed, error: '壁纸窗口关闭失败' } : { ok: true, closed };
}

function simple(action) {
  control([action]);
  return { ok: true, action };
}

async function cycleWallpaper(windowName, dir) {
  const names = windowName
    ? [windowName]
    : Object.keys(runtime.windows).filter((n) => n.startsWith(WIN_PREFIX));
  if (!names.length) throw new Error('没有已打开的壁纸窗口');
  const win = runtime.windows[names[0]];
  const m = loadManifest();
  const idx = m.items.findIndex((i) => i.id === win.id);
  if (idx === -1) throw new Error('当前壁纸不在清单中，无法切换');
  const n = m.items.length;
  const nextItem = m.items[(((idx + dir) % n) + n) % n];
  return apply(nextItem.id, { window: names[0], preset: win.geometry ? win.geometry.label : 'full', width: win.geometry && win.geometry.label === 'custom' ? win.geometry.w : undefined, height: win.geometry && win.geometry.label === 'custom' ? win.geometry.h : undefined, x: win.geometry ? win.geometry.x : undefined, y: win.geometry ? win.geometry.y : undefined });
}

async function nextWallpaper(windowName) { return cycleWallpaper(windowName, 1); }
async function prevWallpaper(windowName) { return cycleWallpaper(windowName, -1); }

// ---------------------------------------------------------------- props

function normalizeProps(project) {
  const props = project && project.general && project.general.properties;
  if (!props || typeof props !== 'object') return [];
  return Object.keys(props).map((key) => {
    const p = props[key] || {};
    return { key, type: p.type || 'text', label: p.text || key, value: p.value, order: p.order, min: p.min, max: p.max, options: p.options };
  }).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function propsSchema(target) {
  const resolved = resolveTarget(target);
  // 读 project.json（workshop 场景或本地项目）
  const dir = path.dirname(resolved.absFile);
  const pjPath = path.join(dir, 'project.json');
  let project = null;
  try { project = JSON.parse(fs.readFileSync(pjPath, 'utf8')); } catch { project = null; }
  const schema = normalizeProps(project);
  // 当前值（config wproperties）
  const g = configGeneral();
  let current = {};
  if (g && g.wproperties) {
    const targetKey = normPath(resolved.absFile).toLowerCase();
    const entryKey = Object.keys(g.wproperties).find((k) => k.toLowerCase() === targetKey);
    const entry = entryKey ? g.wproperties[entryKey] : null;
    if (entry) {
      const monKey = Object.keys(entry).find((k) => k.startsWith('Monitor'));
      if (monKey) current = entry[monKey] || {};
    }
  }
  const merged = schema.map((p) => ({ ...p, value: p.key in current ? current[p.key] : p.value }));
  return { ok: true, id: resolved.id, title: resolved.title, type: resolved.type, properties: merged, hasProperties: schema.length > 0 };
}

async function propsSet(target, json, windowName) {
  const resolved = resolveTarget(target);
  json = String(json).replace(/^\uFEFF/, '').trim();
  let payload;
  try { payload = JSON.parse(json); } catch { throw new Error('props 必须是合法 JSON: ' + json); }
  const winName = windowName || WIN_PREFIX + resolved.id;
  // 确保窗口已打开（未开则按默认全屏先应用）
  if (!runtime.windows[winName]) {
    await apply(target, { window: winName, preset: 'full' });
  }
  const r = control(['applyProperties', '-properties', 'RAW~(' + JSON.stringify(payload) + ')~END', '-location', winName]);
  return { ok: true, window: winName, applied: payload, controlStatus: r.status };
}

// ---------------------------------------------------------------- poster (视频原画质帧)

function probeVideoDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.status !== 0) return null;
  const d = parseFloat(String(r.stdout).trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

async function poster(target, opts) {
  const resolved = resolveTarget(target);
  if (resolved.type !== 'video') throw new Error('仅视频壁纸支持海报帧提取: ' + target);
  const out = posterPath(resolved.id);
  if (fs.existsSync(out) && !opts.force) return { ok: true, id: resolved.id, poster: out, cached: true };
  const ff = process.env.FFMPEG || 'ffmpeg';
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = out + '.tmp.jpg';
  // 取 10% 处帧（避开片头黑帧/淡入），全原生分辨率 + 近无损 jpg（保持原画质，不缩放不降质）
  const dur = probeVideoDuration(resolved.absFile);
  const t = Math.max(1, Math.floor((dur || 20) * 0.1));
  const r = spawnSync(ff, ['-y', '-ss', String(t), '-i', resolved.absFile, '-frames:v', '1', '-q:v', '1', tmp],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (r.status !== 0 || !fs.existsSync(tmp)) throw new Error('海报帧提取失败: ' + String(r.stderr || r.error || '').slice(0, 300));
  fs.renameSync(tmp, out);
  return { ok: true, id: resolved.id, poster: out, cached: false };
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const nv = argv[i + 1];
      if (nv !== undefined && !nv.startsWith('--')) {
        if (nv === 'true') opts[key] = true;
        else if (nv === 'false') opts[key] = false;
        else if (/^-?\d+(\.\d+)?$/.test(nv)) opts[key] = Number(nv);
        else opts[key] = nv;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { opts, rest };
}

// ---- 常驻服务模式（--serve）：进程内缓存 + 行协议，省去每次命令的 Node 启动 ----
let listCache = null;

function buildListItems() {
  const m = loadManifest();
  const steam = steamRoot(); // 一次查询，缓存复用
  const wsDir = steam && path.join(steam, 'steamapps', 'workshop', 'content', APP_ID);
  const existing = new Set(fs.existsSync(wsDir) ? fs.readdirSync(wsDir) : []);
  return m.items.map((it) => {
    const miss = it.source === 'workshop' ? !existing.has(it.id) : !fs.existsSync(it.file ? path.join(steam || '', it.file) : '');
    // 旧清单可能没有 compat：scene 时按项目目录动态检测（仅一次，listCache 缓存）
    let compat = it.compat;
    if (compat === undefined) {
      compat = (it.type === 'scene' && it.file) ? compatOf(path.dirname(path.join(steam || '', it.file)), 'scene') : null;
    }
    return { ...it, missing: miss, compat, absFile: it.file ? path.join(steam || '', it.file) : null, previewAbs: it.preview ? path.join(steam || '', it.preview) : null };
  });
}

// ---------------------------------------------------------------- 场景壁纸预转码

// 场景壁纸兼容性检测：音频响应（general.supportsaudioprocessing）和时间显示（props 含 time/clock/date 等）的
// 壁纸转码会丢失音乐律动/实时时间，禁止转码，永远走实时渲染捕获
// 返回 'audio' | 'time' | null
function compatOf(itemDir, type) {
  if (type !== 'scene') return null;
  const pj = path.join(itemDir, 'project.json');
  let project = null;
  try { project = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch (e) { project = null; }
  if (!project) return null;
  if (project.general && project.general.supportsaudioprocessing === true) return 'audio';
  const props = (project.general && project.general.properties) || {};
  const keys = Object.keys(props).join(',').toLowerCase();
  if (['time', 'clock', 'date', '日历', '时间', '时钟', '日期'].some((k) => keys.includes(k))) return 'time';
  return null;
}
function sceneFlags(resolved) {
  const c = compatOf(path.dirname(resolved.absFile), 'scene');
  return { audioResponsive: c === 'audio', timeDisplay: c === 'time' };
}

// transcode-run：实际转码（独立进程执行；同步等待，完成后写缓存 mp4）
// 流程：开独立命名转码窗口(1920x1080) → capture.exe --record 录制 45s(10fps) → ffmpeg 编码 mp4 → 关窗。
// 转码窗口用 dsh-we-trans-<id> 命名，与用户注入/播放窗口完全隔离；录制期间全局静音，结束恢复。
async function transcodeRun(id, opts) {
  const resolved = resolveTarget(id);
  if (resolved.type !== 'scene') return { ok: false, error: '仅场景壁纸支持转码（当前类型: ' + resolved.type + '）' };
  const cfg = loadConfig();
  const dir = effectiveCacheDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  const outTmp = transPath(dir, id, true);
  const outFinal = transPath(dir, id, false);
  if (fs.existsSync(outFinal)) return { ok: true, cached: true, file: outFinal };
  if (fs.existsSync(outTmp)) return { ok: true, processing: true, message: '已有转码任务进行中' };

  const winName = TRANS_WIN_PREFIX + resolved.id;
  // 尺寸强制偶数（x264 yuv420p 要求宽高为偶数，否则 ffmpeg 拒绝输出）
  const W = (Number(opts.width) || 1920) & ~1;
  const H = (Number(opts.height) || 1080) & ~1;
  const DUR = Number(opts.duration) || 45;
  const FPS = Number(opts.fps) || 10;
  // 转码进度（纯时间轴线性，避免多计时器竞争跳变）：
  //   0→8%   准备阶段（apply 开窗 + 等引擎渲染，约 5s）
  //   8→90%  录制阶段（实时录制 DUR 秒，瓶颈在此）
  //   90→100% 编码阶段（ffmpeg veryfast 通常数秒内完成）
  const progressPath = transProgressPath(dir, id);
  const writeProgress = (pct, phase) => {
    try { fs.writeFileSync(progressPath, JSON.stringify({ pct, phase })); } catch (e) { /* ignore */ }
  };
  let progressTimer = null;
  const PREP_MS = 5000; // 准备阶段预算（apply + 渲染等待）
  try {
    // 写入 tmp 占位（并发锁：同 id 只有一个转码进程），并立即开始进度计时——
    // 点击注入后第一时间就有进度，不再长时间停留在 0%
    fs.writeFileSync(outTmp, '');
    const stageStart = Date.now();
    writeProgress(1, 'prep');
    progressTimer = setInterval(() => {
      const el = (Date.now() - stageStart) / 1000;
      let pct;
      if (el < PREP_MS / 1000) {
        pct = Math.round((el / (PREP_MS / 1000)) * 8);          // 0→8% 准备
      } else {
        pct = Math.min(90, Math.round(8 + ((el - PREP_MS / 1000) / DUR) * 82)); // 8→90% 录制
      }
      writeProgress(pct, el < PREP_MS / 1000 ? 'prep' : 'record');
    }, 500);
    // 静音，避免转码窗口出声打扰
    try { control(['mute']); } catch (e) { /* ignore */ }
    // 打开转码窗口（独立命名窗口，放屏幕外不可见 + 不激活不抢焦点，绝不覆盖桌面/界面；
    // restoreDesktop：转码 openWallpaper 也会把壁纸应用到桌面，完成后恢复/清空，防止桌面残留壁纸）
    const applied = await apply(resolved.id, { window: winName, width: W, height: H, x: -W - 300, y: 0, noActivate: true, restoreDesktop: true });
    // 关键：窗口实际物理尺寸 = toPass 换算结果（逻辑 × scale），capture/ffmpeg 必须用物理尺寸，
    // 否则 PrintWindow 按传参小尺寸捕获会裁剪窗口画面（右下内容缺失、规格缩水）
    const PW = Math.max(2, Math.round(applied.pass.w)) & ~1;
    const PH = Math.max(2, Math.round(applied.pass.h)) & ~1;
    await sleep(4000); // 等引擎渲染完成（避免录到加载淡入黑屏段）
    // 录制 + 编码（capture.exe raw 帧 → ffmpeg；首尾各 0.4s 淡入淡出，循环衔接不闪黑）
    const ffPath = ffmpegBin();
    const cap = spawn(CAPTURE_EXE, ['-title', winName, '-record', PW + 'x' + PH, String(FPS), String(DUR)],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let ff;
    let ffErr = '';
    const fadeOutSt = Math.max(0, DUR - 0.4);
    try {
      ff = spawn(ffPath, ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', PW + 'x' + PH, '-r', String(FPS),
        '-i', 'pipe:0', '-vf', 'fade=t=in:st=0:d=0.4,fade=t=out:st=' + fadeOutSt.toFixed(1) + ':d=0.4',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        // 关键帧对齐（每秒一个 I 帧）：默认 x264 keyint=250（10fps 下 25s 才一个关键帧），
        // 视频 loop 循环跳转到开头时必须解码到下一个关键帧才出帧 → 循环点卡顿；
        // -g <fps> 保证循环点（0s）与任意跳转位置 1s 内出帧，衔接顺滑
        '-g', String(FPS), '-keyint_min', String(FPS), '-sc_threshold', '0',
        '-pix_fmt', 'yuv420p', '-an', '-f', 'mp4', outTmp],
        { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      ff.stderr.on('data', (d) => { ffErr = String(d).slice(-1500); });
    } catch (e) {
      try { cap.kill(); } catch (err) { /* ignore */ }
      throw new Error('无法启动 ffmpeg（' + ffPath + '）——转码需要 ffmpeg，请安装或设置 FFMPEG 环境变量');
    }
    cap.stdout.pipe(ff.stdin);
    // ff 退出（无论成败）都强制结束 cap，避免 capture 阻塞在无人读取的 stdout 管道上
    const capClose = new Promise((r) => cap.on('close', r));
    const ffClose = new Promise((r) => ff.on('close', (code) => { try { cap.kill(); } catch (e) { /* ignore */ } r(code); }));
    const done = Promise.all([capClose, ffClose]);
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('转码超时')), DUR * 1000 + 60000));
    await Promise.race([done, timeout]);
    if (!fs.existsSync(outTmp) || fs.statSync(outTmp).size < 10000) {
      try { fs.unlinkSync(outTmp); } catch (e) { /* ignore */ }
      return { ok: false, error: '转码失败（无有效输出）' + (ffErr ? ' ffmpeg: ' + ffErr : '') };
    }
    writeProgress(100, 'done');
    fs.renameSync(outTmp, outFinal);
    return { ok: true, file: outFinal, size: fs.statSync(outFinal).size, duration: DUR };
  } catch (e) {
    try { fs.unlinkSync(outTmp); } catch (err) { /* ignore */ }
    throw e;
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    try { fs.unlinkSync(progressPath); } catch (e) { /* ignore */ }
    try { close(winName, false); } catch (e) { /* ignore */ }
    try { control(['unmute']); } catch (e) { /* ignore */ }
    saveRuntime();
  }
}

// transcode：转码入口（有缓存直接返回；有锁返回 processing；否则同步执行转码并等待完成）
// 音频响应/时间显示壁纸默认禁止转码（转码会丢失音乐律动/实时时间），--force 可强制转码（用户已知晓失真）
async function transcode(id, opts) {
  const resolved = resolveTarget(id);
  if (resolved.type !== 'scene') return { ok: false, error: '仅场景壁纸支持转码' };
  const flags = sceneFlags(resolved);
  if ((flags.audioResponsive || flags.timeDisplay) && !opts.force) {
    return {
      ok: false, skipped: true, audioResponsive: flags.audioResponsive, timeDisplay: flags.timeDisplay,
      error: '该壁纸为' + (flags.audioResponsive ? '音频响应' : '') + (flags.timeDisplay ? '时间显示' : '') +
        '壁纸，转码会丢失' + (flags.audioResponsive ? '音乐律动' : '') + (flags.timeDisplay ? '实时时间' : '') + '，自动走实时渲染（可用 --force 强制转码）',
    };
  }
  const cfg = loadConfig();
  const dir = effectiveCacheDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  const outFinal = transPath(dir, id, false);
  const outTmp = transPath(dir, id, true);
  if (fs.existsSync(outFinal)) return { ok: true, cached: true, file: outFinal };
  if (fs.existsSync(outTmp)) return { ok: true, processing: true, message: '转码进行中' };
  return await transcodeRun(id, opts);
}

function transcodeStatus(id) {
  const resolved = resolveTarget(id);
  const flags = resolved.type === 'scene' ? sceneFlags(resolved) : { audioResponsive: false, timeDisplay: false };
  const cfg = loadConfig();
  const dir = effectiveCacheDir(cfg);
  const outFinal = transPath(dir, id, false);
  const outTmp = transPath(dir, id, true);
  // 转码进度（0-100）：转码进程每秒写入；完成/失败后文件删除
  let progress = null;
  try {
    const raw = fs.readFileSync(transProgressPath(dir, id), 'utf8');
    const p = JSON.parse(raw);
    if (p && typeof p.pct === 'number') progress = p.pct;
  } catch (e) { /* 无进度文件 */ }
  if (fs.existsSync(outFinal)) {
    const st = fs.statSync(outFinal);
    return { ok: true, cached: true, file: outFinal, size: st.size, processing: false, progress: 100, audioResponsive: flags.audioResponsive, timeDisplay: flags.timeDisplay };
  }
  // progress 仅在真正转码中返回（孤儿进度文件 + 无 tmp 锁 = 上次转码被中断，按未开始处理）
  const processing = fs.existsSync(outTmp);
  return { ok: true, cached: false, processing, progress: processing ? progress : null, audioResponsive: flags.audioResponsive, timeDisplay: flags.timeDisplay };
}

// desktop-restore：恢复桌面壁纸（取消背景时调用，窗口已关闭故重启 WE 安全）
// 实测：openWallpaper 会把壁纸应用到 WE 桌面壁纸渲染层，且 stopWallpaper/再次 openWallpaper 均无法清除该层，
// 唯一可靠恢复 = 重启 WE（-silent 静默），重启后 WE 层清空，桌面回到 Windows 壁纸（用户原本设置）
async function desktopRestore() {
  try {
    if (runningBitness()) {
      for (const bit of ['32', '64']) {
        try { spawnSync('taskkill', ['/F', '/IM', 'wallpaper' + bit + '.exe'], { windowsHide: true }); } catch (e) { /* ignore */ }
      }
      await sleep(1500);
    }
    const exe = weExePath();
    spawn(exe, ['-silent'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    await sleep(2000);
  } catch (e) { /* ignore */ }
  return { ok: true };
}

// cache-clean：清理孤儿缓存（清单中已不存在的壁纸的转码文件 + 过期实时捕获帧）
function cacheClean() {
  const cfg = loadConfig();
  const m = loadManifest();
  const ids = new Set((m.items || []).map((i) => i.id));
  const removed = [];
  const dirs = [];
  const main = effectiveCacheDir(cfg);
  if (main) dirs.push(main);
  if (cfg.sync && cfg.syncDir && String(cfg.syncDir).replace(/[\\/]+$/, '') !== main) dirs.push(String(cfg.syncDir).replace(/[\\/]+$/, ''));
  if (CACHE_DIR && !dirs.includes(CACHE_DIR)) dirs.push(CACHE_DIR); // 实时捕获帧 cap-*.jpg / 海报 poster-*.jpg 在 cache 根
  const now = Date.now();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let names = [];
    try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of names) {
      const m2 = /^trans-(.+)\.mp4(\.tmp)?$/.exec(f);
      if (m2 && !ids.has(m2[1])) {
        try { fs.unlinkSync(path.join(dir, f)); removed.push(f); } catch (e) { /* ignore */ }
        continue;
      }
      // 孤儿转码进度文件（与对应的 tmp/最终文件同时清理）
      const m3 = /^trans-(.+)\.mp4\.progress$/.exec(f);
      if (m3 && !ids.has(m3[1])) {
        try { fs.unlinkSync(path.join(dir, f)); removed.push(f); } catch (e) { /* ignore */ }
        continue;
      }
      if (/^cap-.*\.jpg$/.test(f) || /^poster-.*\.jpg$/.test(f)) {
        try { const st = fs.statSync(path.join(dir, f)); if (now - st.mtimeMs > 3600000) { fs.unlinkSync(path.join(dir, f)); removed.push(f); } } catch (e) { /* ignore */ }
      }
    }
  }
  return { ok: true, removed };
}

function configGet() {
  const cfg = loadConfig();
  return { ok: true, config: cfg, cacheDir: effectiveCacheDir(cfg) };
}
function configSet(json) {
  let next;
  try { next = JSON.parse(json); } catch { throw new Error('config-set 需要 JSON，如 {"sync":true,"syncDir":"D:/OneDrive/we-cache"}'); }
  if (next === null || typeof next !== 'object' || Array.isArray(next)) throw new Error('配置必须是对象');
  const cfg = Object.assign(loadConfig(), next);
  for (const k of ['cacheDir', 'syncDir']) if (cfg[k] !== undefined && typeof cfg[k] !== 'string') throw new Error(k + ' 必须是字符串路径');
  if (cfg.sync !== undefined && typeof cfg.sync !== 'boolean') throw new Error('sync 必须是布尔值');
  saveConfig(cfg);
  return { ok: true, config: cfg, cacheDir: effectiveCacheDir(cfg) };
}

async function dispatch(argv) {
  const { opts, rest } = parseArgs(argv);
  const cmd = rest.shift() || 'help';
  let result;

  switch (cmd) {
    case 'detect': {
      const d = weDir();
      const bit = runningBitness();
      const mon = monitorPhysical();
      result = {
        ok: !!d, installDir: d, exe: d ? weExePath() : null, running: !!bit, bitness: bit,
        monitor: mon, steamRoot: steamRoot(),
        calibration: runtime.calibration,
      };
      break;
    }
    case 'scan': result = writeManifest(); listCache = null; break;
    case 'list': {
      if (!listCache) listCache = buildListItems();
      let items = listCache;
      if (opts.q) { const q = String(opts.q).toLowerCase(); items = items.filter((i) => (i.title || '').toLowerCase().includes(q) || i.id.includes(q)); }
      if (opts.type) items = items.filter((i) => i.type === opts.type);
      if (opts.tag) items = items.filter((i) => (i.tags || []).includes(opts.tag));
      result = { ok: true, count: items.length, items };
      break;
    }
    case 'apply': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js apply <id|路径> [--preset full|right-half|right-twothirds|left-half|small] [--width W --height H --x X --y Y] [--window 名称] [--monitor N]');
      result = await apply(target, opts);
      break;
    }
    case 'geometry': {
      const win = rest[0];
      if (!win || rest.length < 3) throw new Error('用法: node we.js geometry <窗口名> <宽> <高> <x> <y>');
      result = await geometry(win, Number(rest[1]), Number(rest[2]), Number(rest[3]) || 0, Number(rest[4]) || 0);
      break;
    }
    case 'close': result = close(rest[0], !!opts.all); break;
    case 'state': {
      result = {
        ok: true, running: !!runningBitness(),
        windows: Object.values(runtime.windows).map((w) => ({ windowName: w.windowName, id: w.id, title: w.title, type: w.type, mode: w.mode, geometry: w.geometry, appliedAt: w.appliedAt })),
      };
      break;
    }
    case 'pause': result = simple('pause'); break;
    case 'play': result = simple('play'); break;
    case 'mute': result = simple('mute'); break;
    case 'unmute': result = simple('unmute'); break;
    case 'stop':
      if (!opts.global) throw new Error('stop 会连桌面壁纸一起停止，需显式 --global');
      result = simple('stop');
      break;
    case 'next': result = await nextWallpaper(rest[0]); break;
    case 'prev': result = await prevWallpaper(rest[0]); break;
    case 'ensure': result = await ensure(); break;
    case 'calibrate': result = { ok: true, calibration: await calibrate() }; break;
    case 'poster': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js poster <id> [--force]');
      result = await poster(target, opts);
      break;
    }
    case 'props-schema': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js props-schema <id>');
      result = propsSchema(target);
      break;
    }
    case 'props-set': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js props-set <id> <json> [--window 名称] 或 --file <json文件>');
      let json;
      if (opts.file) {
        try { json = fs.readFileSync(String(opts.file), 'utf8'); } catch { throw new Error('无法读取 props 文件: ' + opts.file); }
      } else {
        json = rest[1];
      }
      if (!json) throw new Error('缺少 props JSON');
      result = await propsSet(target, json, opts.window);
      break;
    }
    case 'tags': {
      // 已订阅文件夹标签（实时读 WE config.json browser.folders，启动时刷新用）
      const g = configGeneral();
      const folders = [];
      if (g && g.browser && Array.isArray(g.browser.folders)) {
        for (const f of g.browser.folders) {
          if (f && f.title && !folders.includes(f.title)) folders.push(f.title);
        }
      }
      result = { ok: true, folders };
      break;
    }
    case 'transcode': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js transcode <id> [--width 1920 --height 1080 --duration 45 --fps 10] [--force]');
      result = await transcode(target, opts);
      break;
    }
    case 'transcode-run': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js transcode-run <id>');
      result = await transcodeRun(target, opts);
      break;
    }
    case 'transcode-status': {
      const target = rest[0];
      if (!target) throw new Error('用法: node we.js transcode-status <id>');
      result = transcodeStatus(target);
      break;
    }
    case 'cache-clean': result = cacheClean(); break;
    case 'desktop-restore': result = await desktopRestore(); break;
    case 'config-get': result = configGet(); break;
    case 'config-set': {
      const json = rest[0];
      if (!json) throw new Error('用法: node we.js config-set <json>');
      result = configSet(json);
      break;
    }
    case 'help':
    default:
      result = {
        ok: true,
        commands: {
          detect: '探测 WE 安装与运行状态', scan: '扫描订阅壁纸生成 wallpapers.json', list: '列出壁纸 [--q 关键词 --type 类型 --tag 标签]',
          apply: '窗口播放壁纸 [--preset full|right-half|right-twothirds|left-half|small] [--width --height --x --y] [--window 名]',
          geometry: '调整窗口几何 <窗口名> <宽> <高> <x> <y>', close: '关闭窗口 [--all]', state: '当前状态',
          pause: '暂停', play: '播放', mute: '静音', unmute: '取消静音', next: '切换下一张', prev: '切换上一张', stop: '全局停止（需 --global）',
          ensure: '确保 WE 运行', calibrate: '窗口几何校准', poster: '提取视频壁纸高清海报帧 <id> [--force]', 'props-schema': '读取壁纸属性 schema <id>', 'props-set': '应用属性 <id> <json|--file 文件> [--window 名]',
          transcode: '场景壁纸预转码（引擎渲染录制成 mp4 缓存）<id> [--width --height --duration --fps]', 'transcode-status': '查询转码缓存状态 <id>', 'cache-clean': '清理孤儿转码缓存', 'config-get': '读取 we.config.json 配置', 'config-set': '修改配置 <json>（cacheDir/syncDir/sync）',
          serve: '常驻服务模式：stdin 每行 {"id":n,"args":[...]}，stdout 回 {"id":n,"result":{...}}',
        },
      };
  }
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const { opts, rest } = parseArgs(argv);

  if (opts.serve) {
    // 常驻模式：逐行读取 JSON 请求，执行后写回 JSON 行（保留：CLI 用户可手动使用）
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on('line', async (line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed) return;
      let req = null;
      try { req = JSON.parse(trimmed); } catch (e) { return; }
      if (!req || typeof req !== 'object') return;
      if (req.exit) { process.exit(0); return; }
      let result;
      try { result = await dispatch(Array.isArray(req.args) ? req.args : []); }
      catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
      try { process.stdout.write(JSON.stringify({ id: req.id, result }) + '\n'); }
      catch (e) { process.exit(0); }
    });
    rl.on('close', () => process.exit(0));
    return;
  }

  let result;
  try {
    result = await dispatch(argv);
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
  process.exitCode = 1;
});
