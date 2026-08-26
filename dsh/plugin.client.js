/**
 * DSH Client 插件：壁纸控制面板（仿 Wallpaper Engine 浏览器）
 * 侧边栏底部「壁纸」入口 + 浮动面板：预览图网格、搜索/类型/收藏筛选、
 * 选中详情（仅名字 + 注入/取消背景）、背景注入（视频播视频、场景播预览）。
 * 数据全部经 host.call('we-call', ...) 与 Host 通信。
 */
return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    const timer = ctx.get('timer')
    if (slots === undefined || timer === undefined) return

    styles.insert(`
/* 磨砂强度变量（fxStore.glass 0-100 控制；作用于所有带磨砂的界面边框内部区域） */
:root { --wp-glass-blur: 22px; --wp-ui-glass-blur: 0px; --wp-ui-glass-surface: 90%; --wp-ui-material-strength: 0; --wp-ui-tint-surface: .15; }
/* 宿主界面磨砂：仅限侧栏、Cordis 面板、设置弹窗和输入框；其余界面保持宿主原样。 */
/* 侧栏不使用 backdrop-filter：它包含固定定位的 Cordis/设置弹窗，滤镜会将弹窗裁剪到侧栏内。 */
html[data-wp-ui-glass] .hHd-Xa_root { background-color: color-mix(in srgb, #1b1e25 var(--wp-ui-glass-surface), transparent) !important; background-image: var(--wp-ui-tint-layer, none), var(--wp-ui-material-layer, none) !important; border-color: var(--wp-ui-material-border, color-mix(in srgb, var(--dsw-alias-border-l2, #596070) 70%, rgba(255,255,255,.35))) !important; }
html[data-wp-ui-glass] :is(.VOzbGW_panel, .Nqubda_panel, .uV2eYG_card) { background-color: color-mix(in srgb, #1b1e25 var(--wp-ui-glass-surface), transparent) !important; background-image: var(--wp-ui-tint-layer, none), var(--wp-ui-material-layer, none) !important; border-color: var(--wp-ui-material-border, color-mix(in srgb, var(--dsw-alias-border-l2, #596070) 70%, rgba(255,255,255,.35))) !important; backdrop-filter: var(--wp-ui-material-filter, blur(var(--wp-ui-glass-blur)) saturate(155%)) !important; -webkit-backdrop-filter: var(--wp-ui-material-filter, blur(var(--wp-ui-glass-blur)) saturate(155%)) !important; }
html[data-wp-ui-glass] .Nqubda_panel :is(.Nqubda_header, .Nqubda_row) { background-color: color-mix(in srgb, #1b1e25 var(--wp-ui-glass-surface), transparent) !important; background-image: var(--wp-ui-tint-layer, none), var(--wp-ui-material-layer, none) !important; }
/* 柔雾：低饱和柔光，像隔着一层薄雾看背景。 */
html[data-wp-ui-material="mist"] :is(.hHd-Xa_root, .VOzbGW_panel, .Nqubda_panel, .uV2eYG_card) { --wp-ui-material-layer: radial-gradient(135% 95% at 12% -14%, rgb(239 247 255 / calc(.08 + var(--wp-ui-material-strength) * .16)), transparent 61%), linear-gradient(145deg, rgb(190 211 238 / calc(.04 + var(--wp-ui-material-strength) * .10)), transparent 62%); --wp-ui-material-filter: blur(calc(var(--wp-ui-glass-blur) * .58)) saturate(108%) brightness(1.08) contrast(.96); --wp-ui-material-border: rgb(204 223 248 / calc(.24 + var(--wp-ui-material-strength) * .18)); }
/* 磨砂：低对比度白雾、颗粒散射和厚玻璃模糊，不用条纹假纹理。 */
html[data-wp-ui-material="frosted"] :is(.hHd-Xa_root, .VOzbGW_panel, .Nqubda_panel, .uV2eYG_card) { --wp-ui-material-layer: radial-gradient(135% 98% at 8% -18%, rgb(255 255 255 / calc(.12 + var(--wp-ui-material-strength) * .24)), transparent 59%), radial-gradient(95% 78% at 95% 108%, rgb(167 201 241 / calc(.05 + var(--wp-ui-material-strength) * .15)), transparent 65%), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='96' height='96' filter='url(%23n)' opacity='.055'/></svg>"), linear-gradient(128deg, rgb(245 249 255 / calc(.07 + var(--wp-ui-material-strength) * .13)), rgb(189 209 236 / calc(.03 + var(--wp-ui-material-strength) * .08))); --wp-ui-material-filter: blur(calc(var(--wp-ui-glass-blur) * .95)) saturate(108%) brightness(1.16) contrast(.84); --wp-ui-material-border: rgb(232 241 255 / calc(.30 + var(--wp-ui-material-strength) * .22)); }
/* 暗幕：深蓝黑层次，压低亮部，保留冷色反射。 */
html[data-wp-ui-material="noir"] :is(.hHd-Xa_root, .VOzbGW_panel, .Nqubda_panel, .uV2eYG_card) { --wp-ui-material-layer: radial-gradient(125% 92% at 92% -12%, rgb(94 129 181 / calc(.08 + var(--wp-ui-material-strength) * .18)), transparent 58%), linear-gradient(155deg, rgb(4 8 16 / calc(.34 + var(--wp-ui-material-strength) * .24)), rgb(24 34 52 / calc(.10 + var(--wp-ui-material-strength) * .14))); --wp-ui-material-filter: blur(calc(var(--wp-ui-glass-blur) * .82)) saturate(105%) brightness(.80) contrast(.94); --wp-ui-material-border: rgb(111 138 181 / calc(.26 + var(--wp-ui-material-strength) * .20)); }
/* 设置弹窗原本无显式边框；注入背景后仍固定保留边界，避免和壁纸融在一起。 */
html[data-wp-ui-glass] .VOzbGW_panel { border: 1px solid var(--dsw-alias-border-l2, #596070) !important; }
html[data-wp-ui-tint] :is(.hHd-Xa_root, .VOzbGW_panel, .Nqubda_panel, .uV2eYG_card), html[data-wp-ui-tint] .Nqubda_panel :is(.Nqubda_header, .Nqubda_row) { --wp-ui-tint-layer: linear-gradient(color-mix(in srgb, var(--wp-ui-tint) var(--wp-ui-tint-strength, 12%), transparent), color-mix(in srgb, var(--wp-ui-tint) var(--wp-ui-tint-strength, 12%), transparent)); }
html[data-wp-ui-tint]:not([data-wp-ui-glass]):not([data-wp-ui-tint-all]) :is(.hHd-Xa_root, .VOzbGW_panel, .Nqubda_panel, .uV2eYG_card), html[data-wp-ui-tint]:not([data-wp-ui-glass]):not([data-wp-ui-tint-all]) .Nqubda_panel :is(.Nqubda_header, .Nqubda_row) { background-image: var(--wp-ui-tint-layer) !important; }
/* 全界面染色只改变半透明表面，不改按钮/滑块的交互色，避免与壁纸效果状态混淆。 */
html[data-wp-ui-tint-all] body {
  --dsw-alias-bg-base: color-mix(in srgb, var(--wp-ui-tint) var(--wp-ui-tint-strength), rgb(13 15 20 / var(--wp-ui-tint-surface))) !important;
  --dsw-alias-bg-layer-1: color-mix(in srgb, var(--wp-ui-tint) var(--wp-ui-tint-strength), rgb(15 17 22 / calc(var(--wp-ui-tint-surface) + .05))) !important;
  --dsw-alias-bg-layer-2: color-mix(in srgb, var(--wp-ui-tint) var(--wp-ui-tint-strength), rgb(17 19 24 / calc(var(--wp-ui-tint-surface) + .05))) !important;
  --dsw-alias-bg-layer-3: color-mix(in srgb, var(--wp-ui-tint) var(--wp-ui-tint-strength), rgb(19 21 26 / calc(var(--wp-ui-tint-surface) + .05))) !important;
  --dsw-alias-bg-module-platform: var(--dsw-alias-bg-layer-3) !important;
  --dsw-alias-bg-multi-select: var(--dsw-alias-bg-layer-2) !important;
  --dsw-alias-bg-overlay: var(--dsw-alias-bg-layer-3) !important;
  --dsw-alias-markdown-code-block: var(--dsw-alias-bg-base) !important;
  --dsw-alias-markdown-code-block-banner: var(--dsw-alias-bg-layer-2) !important;
  --dsw-alias-markdown-inline-code: var(--dsw-alias-bg-layer-2) !important;
  --dsw-specific-sidebar-fill: var(--dsw-alias-bg-base) !important;
  --dsw-specific-input-major: var(--dsw-alias-bg-layer-2) !important;
  --dsw-specific-bubble: var(--dsw-alias-bg-layer-2) !important;
  --dsw-specific-menu: var(--dsw-alias-bg-layer-3) !important;
  --dsw-specific-selector: var(--dsw-alias-bg-layer-2) !important;
  --dsw-specific-tip: var(--dsw-alias-bg-layer-2) !important;
}
/* 主题：黑白双主题通过 .wp-theme-* 切换；--wp-a 为面板背景透明度（映射 0.35~0.75，磨砂始终可见、优先级高于透明度） */
.wp-root { position: fixed; right: 14px; top: 80px; width: 400px; min-width: 300px; max-width: calc(100vw - 28px); height: auto; max-height: calc(100vh - 110px); display: flex; flex-direction: column; border-radius: 14px; background: var(--wp-bg, #17181c); border: 1px solid rgba(255,255,255,.16); color: var(--wp-fg, #e8e8ea); box-shadow: 0 12px 40px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 12px; z-index: 9000; overflow: hidden; pointer-events: auto; backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%) brightness(1.06); -webkit-backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%) brightness(1.06); }
.wp-root-drop { animation: wp-panel-drop .22s cubic-bezier(.2,.8,.2,1); transform-origin: top right; }
@keyframes wp-panel-drop { from { opacity: 0; transform: translateY(-24px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
/* 磨砂玻璃质感层：柔和漫反射光斑 + 细微霜状噪点纹理（位于背景之上、内容之下） */
.wp-root::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit;
  background:
    radial-gradient(140% 90% at 15% -10%, rgba(255,255,255,.10), transparent 55%),
    radial-gradient(120% 80% at 92% 15%, rgba(150,185,255,.07), transparent 50%),
    radial-gradient(100% 70% at 50% 110%, rgba(255,255,255,.05), transparent 55%),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='0.045'/></svg>"); }
.wp-theme-dark { --wp-bg: rgba(23,24,28,var(--wp-a,1)); --wp-fg: #e8e8ea; --wp-mut: #9aa0ad; --wp-border: #3a3d45; --wp-border2: #4a4d55; --wp-input: rgba(30,33,42,.52); --wp-chip-bg: rgba(35,38,46,.6); --wp-chip-fg: #e8eaef; --wp-chip-bd: #3d4250; --wp-accent: #3d6ef2; --wp-accent-fg: #fff; }
.wp-theme-light { --wp-bg: rgba(246,247,249,var(--wp-a,1)); --wp-fg: #1e2228; --wp-mut: #6a7280; --wp-border: #d8dbe1; --wp-border2: #c2c6ce; --wp-input: rgba(255,255,255,.62); --wp-chip-bg: rgba(236,238,242,.7); --wp-chip-fg: #2a2f36; --wp-chip-bd: #c8ccd4; --wp-accent: #2f6bff; --wp-accent-fg: #fff; }
.wp-pull { position: fixed; right: 28px; top: 0; z-index: 9000; width: 58px; height: 80px; display: flex; flex-direction: column; align-items: center; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary, #eee); cursor: grab; user-select: none; touch-action: none; pointer-events: auto; }
.wp-pull-cord { width: 2px; height: 36px; flex: none; background: linear-gradient(90deg, #596170, #e0e5ed 48%, #616a78); box-shadow: 0 1px 5px rgba(0,0,0,.45); transform-origin: top; transition: transform .16s ease; }
.wp-pull-handle { min-width: 48px; height: 27px; display: flex; align-items: center; justify-content: center; padding: 0 9px; border: 1px solid rgba(255,255,255,.22); border-radius: 7px 7px 13px 13px; background: color-mix(in srgb, var(--dsw-alias-bg-overlay, #1f1f1f) 88%, transparent); box-shadow: 0 6px 16px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.12); backdrop-filter: blur(12px) saturate(145%); -webkit-backdrop-filter: blur(12px) saturate(145%); font-size: 10px; font-weight: 600; letter-spacing: .08em; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
.wp-pull-hint { margin-top: 3px; color: var(--dsw-alias-label-secondary, #9aa); font-size: 9px; line-height: 12px; opacity: .78; }
.wp-pull:hover .wp-pull-cord { transform: scaleY(1.08); }
.wp-pull:hover .wp-pull-handle { transform: translateY(3px); border-color: var(--dsw-alias-brand-primary, #4c9aff); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4c9aff) 18%, var(--dsw-alias-bg-overlay, #1f1f1f)); }
.wp-pull:active { cursor: grabbing; }
.wp-pull:active .wp-pull-handle { transform: translateY(7px); }
.wp-pull:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4c9aff); outline-offset: 2px; border-radius: 8px; }
@media (max-width: 480px) { .wp-pull { right: 14px; } }
@media (prefers-reduced-motion: reduce) { .wp-root-drop { animation: none; } .wp-pull-cord, .wp-pull-handle { transition: none; } }
.wp-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,.1); flex: none; cursor: grab; user-select: none; touch-action: none; }
.wp-head:active { cursor: grabbing; }
.wp-title { font-weight: 600; font-size: 13px; flex: none; }
.wp-status { font-size: 10px; color: var(--wp-mut, #9aa); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wp-btn { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); color: var(--wp-mut, #c8c8cc); border-radius: 8px; padding: 3px 11px; cursor: pointer; font-size: 11px; line-height: 20px; flex: none; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: background .15s ease, color .15s ease, border-color .15s ease; }
.wp-btn:hover { color: var(--wp-fg, #fff); border-color: rgba(255,255,255,.3); background: rgba(255,255,255,.09); }
.wp-btn:disabled { opacity: .45; cursor: default; }
.wp-btn-on { background: var(--wp-accent, #4c9aff); border-color: transparent; color: var(--wp-accent-fg, #fff); }
.wp-btn-on:hover { background: var(--wp-accent, #4c9aff); color: var(--wp-accent-fg, #fff); }
.wp-btn-primary { background: linear-gradient(135deg, var(--wp-accent, #3d6ef2), #4c9aff); border-color: transparent; color: var(--wp-accent-fg, #fff); font-weight: 600; box-shadow: 0 1px 6px rgba(61,110,242,.35); }
.wp-btn-primary:hover { background: linear-gradient(135deg, var(--wp-accent, #335fd8), #3d8df0); color: var(--wp-accent-fg, #fff); border-color: transparent; }
.wp-chip-audio { border-color: #d98a3d !important; color: #e8b57a !important; }
.wp-chip-audio.wp-chip-on { background: #d98a3d !important; color: #fff !important; }
.wp-chip-time { border-color: #3da8d9 !important; color: #7ac8e8 !important; }
.wp-chip-time.wp-chip-on { background: #3da8d9 !important; color: #fff !important; }
.wp-chip-ok { border-color: #4dbb6d !important; color: #8adba5 !important; }
.wp-chip-ok.wp-chip-on { background: #4dbb6d !important; color: #fff !important; }
.wp-search { flex: 1; min-width: 120px; background: var(--wp-input, rgba(30,33,42,.52)); border: 1px solid rgba(255,255,255,.12); color: var(--wp-fg, #eee); border-radius: 8px; padding: 5px 10px; font-size: 12px; outline: none; backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%); -webkit-backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
.wp-chips { display: flex; gap: 5px; padding: 5px 10px; flex: none; flex-wrap: wrap; min-height: 0; max-height: 72px; overflow-y: auto; }
.wp-chip { border: 1px solid var(--wp-chip-bd, #3d4250); background: var(--wp-chip-bg, #23262e) !important; color: var(--wp-chip-fg, #e8eaef) !important; border-radius: 999px; padding: 2px 11px; font-size: 11px; cursor: pointer; white-space: nowrap; flex: none; line-height: 16px; }
.wp-chip:hover { border-color: var(--wp-accent, #4c9aff); color: #fff !important; }
.wp-chip-on { background: var(--wp-accent, #3d6ef2) !important; border-color: transparent; color: #fff !important; font-weight: 600; }
.wp-grid { flex: 1; min-height: 90px; overflow-y: auto; padding: 10px 12px 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 8px; align-content: start; }
.wp-card { position: relative; padding: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--wp-border, #333); color: inherit; text-align: left; font: inherit; cursor: pointer; background: var(--wp-input, #20222a); aspect-ratio: 16/10; }
.wp-card:hover { border-color: var(--wp-accent, #4c9aff); }
.wp-card:focus-visible { outline: 2px solid var(--wp-accent, #4c9aff); outline-offset: 2px; }
.wp-card-on { border-color: var(--wp-accent, #4c9aff); box-shadow: 0 0 0 1px var(--wp-accent, #4c9aff); }
.wp-thumb { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1); transition: transform .22s ease; will-change: transform; image-rendering: auto; }
.wp-card:hover .wp-thumb { transform: scale(1.18); }
.wp-hover-preview { position: fixed; z-index: 9500; pointer-events: none; width: 260px; max-width: calc(100vw - 16px); max-height: 200px; border-radius: 10px; overflow: hidden; background: var(--dsw-alias-bg-overlay, #1f1f1f); border: 1px solid rgba(255,255,255,.18); box-shadow: 0 14px 36px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.35); opacity: 0; transform: scale(.92); transform-origin: top left; transition: opacity .14s ease, transform .14s ease; }
.wp-hover-preview-on { opacity: 1; transform: scale(1); }
.wp-hover-preview img { width: 100%; height: 148px; object-fit: contain; display: block; background: #090b10; image-rendering: auto; }
.wp-hover-preview-name { padding: 4px 8px 3px; font-size: 10px; color: var(--dsw-alias-label-primary, #eee); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wp-hover-preview-meta { padding: 0 8px 5px; font-size: 9px; color: var(--dsw-alias-label-secondary, #9aa); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wp-card-miss { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #888); font-size: 10px; }
.wp-card-name { position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 5px; font-size: 10px; background: linear-gradient(transparent, rgba(0,0,0,.75)); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wp-type { position: absolute; top: 4px; left: 4px; font-size: 9px; padding: 0 5px; border-radius: 999px; background: rgba(0,0,0,.55); color: #ddd; }
.wp-detail { flex: none; border-top: 1px solid var(--wp-border, #333); padding: 8px 10px 10px; max-height: 46%; min-height: 0; overflow-y: auto; }
.wp-detail-name { font-weight: 600; font-size: 12px; margin-bottom: 8px; word-break: break-all; }
.wp-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.wp-err { color: var(--dsw-alias-state-error-primary, #e57373); font-size: 11px; padding: 4px 10px; }
.wp-empty { color: var(--dsw-alias-label-secondary, #888); padding: 16px 10px; text-align: center; font-size: 11px; grid-column: 1 / -1; }
.wp-trigger { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; background: var(--wp-input, #20222a); border: 1px solid var(--wp-border, #3a3d45); color: var(--wp-mut, #ccc); cursor: pointer; padding: 6px 8px; font-size: 12px; border-radius: 6px; margin: 2px 0; }
.wp-trigger:hover { color: var(--wp-fg, #fff); border-color: var(--dsw-alias-brand-primary, #4c9aff); }
.wp-trigger-on { color: var(--dsw-alias-brand-primary, #4c9aff); border-color: var(--dsw-alias-brand-primary, #4c9aff); }
.wp-controls { display: grid; gap: 2px; padding: 8px 12px 7px; flex: none; }
.wp-control-group { display: grid; grid-template-columns: 48px minmax(0,1fr); align-items: center; gap: 7px; padding: 6px 0; }
.wp-control-group + .wp-control-group { border-top: 1px solid rgba(255,255,255,.08); }
.wp-control-label { color: var(--wp-mut, #9aa); font-size: 9px; font-weight: 700; letter-spacing: .08em; }
.wp-control-buttons { display: flex; align-items: center; gap: 6px; min-width: 0; }
.wp-control-buttons .wp-btn { flex: 1 1 0; min-width: 0; padding-left: 8px; padding-right: 8px; white-space: nowrap; }
.wp-control-note { grid-column: 2; color: var(--wp-mut, #9aa); font-size: 9px; line-height: 14px; }
.wp-module-body { flex: none; max-height: min(360px, calc(100vh - 270px)); overflow-y: auto; border-top: 1px solid var(--wp-border,#333); padding: 8px 10px 10px; }
.wp-module-effects { flex: 1 1 auto; min-height: 0; max-height: none; }
.wp-filter-controls-compact { min-height: 0; }
.wp-effect-scope { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 5px; margin-bottom: 8px; }
.wp-effect-scope-item { min-width: 0; padding: 6px 8px; border: 1px solid rgba(255,255,255,.09); border-radius: 8px; background: rgba(255,255,255,.025); }
.wp-effect-scope-item strong { display: block; color: var(--wp-fg, #eee); font-size: 9px; line-height: 13px; }
.wp-effect-scope-item span { display: block; color: var(--wp-mut, #9aa); font-size: 8px; line-height: 12px; }
.wp-effect-condition { grid-column: 1 / -1; margin: 0; color: var(--wp-mut, #9aa); font-size: 9px; line-height: 14px; }
.wp-effect-section { margin-top: 6px; border: 1px solid rgba(255,255,255,.10); border-radius: 9px; background: rgba(255,255,255,.02); overflow: hidden; }
.wp-effect-section > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 9px; color: var(--wp-fg, #eee); cursor: pointer; font-size: 10px; font-weight: 700; list-style: none; user-select: none; }
.wp-effect-section > summary::-webkit-details-marker { display: none; }
.wp-effect-section > summary::after { content: '⌄'; color: var(--wp-mut, #9aa); font-size: 13px; transition: transform .15s ease; }
.wp-effect-section:not([open]) > summary::after { transform: rotate(-90deg); }
.wp-effect-section > summary small { margin-left: auto; color: var(--wp-mut, #9aa); font-size: 8px; font-weight: 400; }
.wp-effect-section-body { padding: 2px 0 8px; border-top: 1px solid rgba(255,255,255,.07); }
.wp-filter-status { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 7px 8px; border: 1px solid color-mix(in srgb, var(--wp-accent, #4c9aff) 34%, transparent); border-radius: 9px; background: color-mix(in srgb, var(--wp-accent, #4c9aff) 9%, transparent); }
.wp-filter-status strong { flex: 1; min-width: 0; font-size: 10px; color: var(--wp-fg, #eee); }
.wp-filter-status small { color: var(--wp-mut, #9aa); font-size: 9px; white-space: nowrap; }
.wp-filter-unavailable { box-sizing: border-box; width: 100%; align-self: flex-start; padding: 10px 11px; border: 1px solid rgba(255,183,77,.28); border-radius: 9px; background: rgba(255,183,77,.08); color: var(--wp-mut, #bbb); line-height: 16px; }
.wp-filter-unavailable strong { display: block; margin-bottom: 2px; color: var(--wp-fg, #eee); font-size: 10px; }
.wp-filter-unavailable span { font-size: 9px; }
.wp-filter-scope-note { margin: 7px 10px 4px; color: var(--wp-mut, #9aa); font-size: 9px; line-height: 14px; }
.wp-filter-presets { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 5px; }
.wp-filter-preset { min-width: 0; min-height: 42px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 5px 6px; border: 1px solid rgba(255,255,255,.13); border-radius: 8px; background: rgba(255,255,255,.045); color: var(--wp-mut, #bbb); cursor: pointer; text-align: left; }
.wp-filter-preset:hover, .wp-filter-preset-on { color: var(--wp-fg, #fff); border-color: var(--wp-accent, #4c9aff); background: color-mix(in srgb, var(--wp-accent, #4c9aff) 18%, transparent); }
.wp-filter-preset b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 13px; }
.wp-filter-preset small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: inherit; opacity: .7; font-size: 8px; line-height: 11px; }
.wp-filter-block { margin-top: 9px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.09); }
.wp-filter-block-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px 4px; color: var(--wp-fg, #eee); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.wp-filter-block-title small { color: var(--wp-mut, #9aa); font-size: 8px; font-weight: 400; letter-spacing: 0; }
.wp-filter-color { display: flex; align-items: center; gap: 8px; padding: 3px 10px; }
.wp-filter-color span { width: 44px; flex: none; color: var(--wp-mut, #ccc); font-size: 11px; }
.wp-filter-color input[type=color] { width: 34px; height: 24px; padding: 0; border: 1px solid rgba(255,255,255,.22); border-radius: 7px; background: transparent; cursor: pointer; }
.wp-filter-color small { flex: 1; color: var(--wp-mut, #9aa); font-size: 9px; line-height: 13px; }
.wp-light-source { margin: 5px 8px 0; border: 1px solid rgba(255,255,255,.09); border-radius: 8px; background: rgba(255,255,255,.025); overflow: hidden; }
.wp-light-source-head, .wp-light-source > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; color: var(--wp-fg, #eee); font-size: 10px; font-weight: 600; }
.wp-light-source > summary { cursor: pointer; user-select: none; }
.wp-light-source-head small, .wp-light-source > summary small { color: var(--wp-mut, #9aa); font-size: 8px; font-weight: 400; }
.wp-light-source > summary::marker { color: var(--wp-accent, #4c9aff); }
.wp-light-controls { padding-bottom: 5px; }
.wp-filter-switches { display: flex; flex-wrap: wrap; gap: 5px; padding: 3px 10px; }
.wp-filter-switches .wp-btn { flex: 1 1 70px; }
.wp-sect-title { font-size: 10px; color: var(--wp-mut, #9aa); user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wp-library-drawer { position: fixed; z-index: 9010; display: flex; flex-direction: column; min-width: 280px; overflow: hidden; border-radius: 14px; color: var(--wp-fg, #e8e8ea); background: var(--wp-bg, rgba(23,24,28,.94)); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 18px 46px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%); -webkit-backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%); pointer-events: auto; animation: wp-library-in .18s ease-out; }
@keyframes wp-library-in { from { opacity: 0; transform: translateX(16px) scale(.99); } to { opacity: 1; transform: translateX(0) scale(1); } }
.wp-library-compact { box-shadow: 0 20px 54px rgba(0,0,0,.72); }
.wp-library-head { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-bottom: 1px solid rgba(255,255,255,.10); flex: none; }
.wp-library-title { flex: 1; min-width: 0; font-size: 12px; font-weight: 700; }
.wp-library-count { color: var(--wp-mut, #9aa); font-size: 9px; font-variant-numeric: tabular-nums; }
.wp-library-search { display: flex; gap: 6px; padding: 9px 11px 5px; flex: none; }
.wp-library-filter { display: grid; grid-template-columns: 42px minmax(0,1fr); gap: 5px; align-items: start; padding: 3px 11px; flex: none; }
.wp-library-filter-label { padding-top: 3px; color: var(--wp-mut, #9aa); font-size: 9px; font-weight: 700; }
.wp-library-filter .wp-chips { padding: 0; max-height: 64px; }
.wp-library-tags { margin: 3px 11px 5px; flex: none; }
.wp-library-tags > summary { color: var(--wp-mut, #9aa); cursor: pointer; font-size: 9px; user-select: none; }
.wp-library-tags .wp-chips { padding: 6px 0 0; max-height: 82px; }
.wp-library-drawer .wp-grid { border-top: 1px solid rgba(255,255,255,.08); }
@media (max-width: 480px) { .wp-root { right: 8px; width: calc(100vw - 16px); min-width: 0; max-width: none; max-height: calc(100dvh - 88px); } .wp-control-group { grid-template-columns: 1fr; } .wp-control-note { grid-column: 1; } }
.wp-slider-row { display: flex; align-items: center; gap: 8px; padding: 1px 10px; flex: none; }
.wp-slider-row span { width: 44px; flex: none; font-size: 11px; color: var(--wp-mut, #ccc); }
.wp-slider-row input { flex: 1; min-width: 0; }
.wp-slider-row b { width: 38px; flex: none; text-align: right; font-size: 10px; color: var(--wp-mut, #bbb); font-weight: 400; font-variant-numeric: tabular-nums; }
.wp-resize { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; z-index: 10; opacity: .5; }
.wp-resize::after { content: ''; position: absolute; right: 3px; bottom: 3px; width: 8px; height: 8px; border-right: 2px solid var(--wp-mut, #888); border-bottom: 2px solid var(--wp-mut, #888); border-radius: 0 0 3px 0; }
.wp-resize:hover { opacity: 1; }
/* 8 方向拖拽手柄（边框/四角放大缩小拉伸） */
.wp-rz { position: absolute; z-index: 12; touch-action: none; }
.wp-rz-n { top: -2px; left: 10px; right: 10px; height: 6px; cursor: ns-resize; }
.wp-rz-s { bottom: -2px; left: 10px; right: 10px; height: 6px; cursor: ns-resize; }
.wp-rz-e { right: -2px; top: 10px; bottom: 10px; width: 6px; cursor: ew-resize; }
.wp-rz-w { left: -2px; top: 10px; bottom: 10px; width: 6px; cursor: ew-resize; }
.wp-rz-ne { top: -3px; right: -3px; width: 13px; height: 13px; cursor: nesw-resize; }
.wp-rz-nw { top: -3px; left: -3px; width: 13px; height: 13px; cursor: nwse-resize; }
.wp-rz-se { bottom: -3px; right: -3px; width: 15px; height: 15px; cursor: nwse-resize; }
.wp-rz-sw { bottom: -3px; left: -3px; width: 13px; height: 13px; cursor: nesw-resize; }
/* 背景注入提示条（overlay 层，背景本体在 body 底层） */
.wp-bg-tip { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 8900; font-size: 10px; color: var(--dsw-alias-label-secondary, #ccc); background: rgba(0,0,0,.55); padding: 3px 12px; border-radius: 999px; pointer-events: none; white-space: nowrap; max-width: 80vw; overflow: hidden; text-overflow: ellipsis; }
/* 合并效果模块的分组行 */
.wp-fx-row { display: flex; align-items: center; gap: 5px; padding: 3px 10px 1px; flex: none; flex-wrap: wrap; }
.wp-fx-label { width: 44px; flex: none; font-size: 11px; color: var(--wp-mut, #ccc); }
.wp-fx-material-grid { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.wp-fx-material-grid .wp-material { min-height: 34px; padding: 4px 6px; border-radius: 7px; }
.wp-fx-material-grid .wp-material b { font-size: 10px; line-height: 13px; }
.wp-fx-material-grid .wp-material small { display: none; }
.wp-fx-rgb { display: flex; align-items: center; gap: 6px; padding: 1px 10px; flex: none; }
.wp-fx-rgb .wp-fx-label { width: 20px; font-size: 10px; }
.wp-fx-rgb input { flex: 1; min-width: 0; }
.wp-fx-rgb b { width: 30px; flex: none; text-align: right; font-size: 10px; color: var(--wp-mut, #bbb); font-weight: 400; font-variant-numeric: tabular-nums; }
/* 设置页控件（与 DSH 设置风格一致：行式 + 底部分隔线 + 右侧控件） */
.wp-set-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; font-size: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #333); }
.wp-set-row > span:first-child { flex: 1; color: var(--dsw-alias-label-primary, #e8e8ea); }
.wp-set-hint { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
.wp-release-note { display: flex; align-items: flex-start; gap: 9px; margin: 2px 0 8px; padding: 8px 10px; border: 1px solid rgba(76,154,255,.22); border-radius: 9px; background: rgba(76,154,255,.06); }
.wp-release-note b { flex: none; color: var(--wp-accent, #4c9aff); font-size: 11px; line-height: 16px; }
.wp-release-note span { min-width: 0; color: var(--wp-mut, #aaa); font-size: 10px; line-height: 16px; }
.wp-version-notes { display: grid; gap: 7px; margin: 0; padding-left: 20px; color: var(--dsw-alias-label-secondary, #9aa); font-size: 10px; line-height: 16px; }
.wp-version-notes li::marker { color: var(--wp-accent, #4c9aff); font-weight: 700; }
.wp-set-range { width: 170px; accent-color: var(--dsw-alias-brand-primary, #4c9aff); }
.wp-set-num { width: 42px; flex: none; text-align: right; font-size: 11px; color: var(--dsw-alias-label-primary, #e8e8ea); font-variant-numeric: tabular-nums; }
.wp-set-number { width: 72px; padding: 4px 6px; color: var(--dsw-alias-label-primary, #e8e8ea); background: var(--wp-input, rgba(30,33,42,.52)); border: 1px solid var(--dsw-alias-border-l1, #444); border-radius: 6px; font: inherit; text-align: right; }
.wp-set-color { width: 34px; height: 24px; padding: 0; border: 1px solid var(--dsw-alias-border-l1, #444); border-radius: 6px; background: transparent; cursor: pointer; }
.wp-set-color::-webkit-color-swatch-wrapper { padding: 2px; }
.wp-set-color::-webkit-color-swatch { border: none; border-radius: 4px; }
.wp-set-seg { display: flex; gap: 4px; }
.wp-set-seg button { background: transparent; border: 1px solid var(--dsw-alias-border-l1, #444); color: var(--dsw-alias-label-secondary, #9aa); border-radius: 6px; padding: 2px 10px; font-size: 11px; cursor: pointer; line-height: 18px; }
.wp-set-seg button:hover { color: var(--dsw-alias-label-primary, #eee); }
.wp-set-seg button.wp-seg-on { background: var(--dsw-alias-brand-primary, #4c9aff); border-color: transparent; color: #fff; font-weight: 600; }
.wp-set-group { margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #15171c) 52%, transparent); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%); -webkit-backdrop-filter: blur(var(--wp-glass-blur, 22px)) saturate(160%); box-shadow: 0 8px 26px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06); }
.wp-set-group-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary, #e8e8ea); padding-bottom: 4px; }
.wp-set-group-sub { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); padding-bottom: 4px; }
.wp-set-section { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.10); }
.wp-set-section-title { color: var(--dsw-alias-label-primary, #e8e8ea); font-size: 11px; font-weight: 600; margin-bottom: 6px; }
.wp-set-disclosure > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; list-style: none; user-select: none; }
.wp-set-disclosure > summary::-webkit-details-marker { display: none; }
.wp-set-disclosure > summary::after { content: '⌄'; color: var(--dsw-alias-label-secondary, #9aa); font-size: 14px; transition: transform .15s ease; }
.wp-set-disclosure:not([open]) > summary::after { transform: rotate(-90deg); }
.wp-set-section-body { padding-top: 8px; }
.wp-materials { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 6px; }
.wp-material { min-height: 42px; text-align: left; color: var(--dsw-alias-label-secondary, #bbb); background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.13); border-radius: 9px; padding: 6px 8px; cursor: pointer; }
.wp-material:hover { color: var(--dsw-alias-label-primary, #fff); border-color: rgba(255,255,255,.32); background: rgba(255,255,255,.08); }
.wp-material.wp-material-on { color: #fff; border-color: var(--wp-accent, #4c9aff); background: color-mix(in srgb, var(--wp-accent, #4c9aff) 30%, transparent); }
.wp-material b, .wp-material small { display: block; }
.wp-material b { font-size: 11px; font-weight: 600; line-height: 16px; }
.wp-material small { color: inherit; opacity: .74; font-size: 9px; line-height: 13px; }
.wp-tone-picker { display: flex; align-items: center; gap: 8px; padding: 6px 0 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, #333); }
.wp-tone-picker > span { flex: 1; color: var(--dsw-alias-label-primary, #e8e8ea); }
.wp-tone-color { width: 34px; height: 26px; flex: none; padding: 0; border: 1px solid rgba(255,255,255,.22); border-radius: 8px; background: transparent; cursor: pointer; }
.wp-tone-swatches { display: flex; flex-wrap: wrap; gap: 5px; }
.wp-tone-swatch { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,.18); border-radius: 999px; padding: 0; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.22); }
.wp-tone-swatch:hover, .wp-tone-swatch.wp-tone-swatch-on { border-color: #fff; transform: scale(1.12); }
.wp-preset-actions { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.wp-preset-actions span { flex: 1; color: var(--dsw-alias-label-secondary, #9aa); font-size: 10px; }
.wp-preset-list { display: flex; flex-wrap: wrap; gap: 6px; }
.wp-preset-item { display: flex; align-items: center; gap: 2px; max-width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 2px; }
.wp-preset-load, .wp-preset-delete { color: var(--dsw-alias-label-secondary, #bbb); background: transparent; border: 0; border-radius: 6px; cursor: pointer; font: inherit; }
.wp-preset-load { max-width: 168px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 7px; font-size: 10px; }
.wp-preset-delete { padding: 3px 6px; font-size: 12px; }
.wp-preset-load:hover, .wp-preset-delete:hover { color: #fff; background: rgba(255,255,255,.10); }
/* 背景效果预览卡片（大幅壁纸预览：光晕边框 + 内高光，色彩鲜明细节丰富；悬停合集卡片时放大显示候选背景） */
.wp-fx-preview { position: relative; margin-bottom: 10px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,.16); box-shadow: 0 10px 30px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08); aspect-ratio: 16/9; background: #0b0d12; transition: transform .18s ease, box-shadow .18s ease; }
.wp-fx-preview-zoom { transform: scale(1.02); box-shadow: 0 14px 38px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.22), inset 0 1px 0 rgba(255,255,255,.1); }
.wp-fx-preview img, .wp-fx-preview video { width: 100%; height: 100%; object-fit: cover; display: block; }
.wp-fx-preview-overlay { position: absolute; inset: 0; pointer-events: none; }
.wp-fx-preview-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #9aa); font-size: 11px; text-align: center; padding: 0 12px; line-height: 18px; }
.wp-fx-preview-tag { position: absolute; left: 8px; bottom: 8px; font-size: 9px; padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.55); color: #ddd; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 背景合集区域（设置页：位于背景效果预览图正下方，垂直排列） */
.wp-set-coll { margin-top: 2px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.12); }
.wp-set-coll-head { display: flex; align-items: center; gap: 8px; padding-bottom: 6px; }
.wp-set-coll-title { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-primary, #e8e8ea); flex: 1; }
.wp-set-coll-body { padding-top: 2px; }
.wp-set-coll-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 6px; max-height: 208px; overflow-y: auto; padding: 2px; }
.wp-set-coll-card { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); cursor: pointer; background: rgba(30,33,42,.4); aspect-ratio: 16/10; }
.wp-set-coll-card:hover { border-color: var(--wp-accent, #4c9aff); }
.wp-set-coll-card img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s ease; image-rendering: auto; }
.wp-set-coll-card:hover img { transform: scale(1.16); }
.wp-set-coll-card-name { position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 4px; font-size: 9px; background: linear-gradient(transparent, rgba(0,0,0,.75)); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wp-set-coll-card-miss { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #888); font-size: 10px; }
.wp-coll-card-on { border-color: var(--wp-accent, #4c9aff); box-shadow: 0 0 0 1px var(--wp-accent, #4c9aff); }
.wp-coll-card-picked { border-color: color-mix(in srgb, var(--wp-accent, #4c9aff) 74%, #fff) !important; }
.wp-coll-select { position: absolute; z-index: 2; top: 5px; right: 5px; width: 18px; height: 18px; padding: 0; border-radius: 5px; border: 1px solid rgba(255,255,255,.62); background: rgba(8,12,20,.68); color: transparent; cursor: pointer; font-size: 13px; font-weight: 700; line-height: 16px; box-shadow: 0 1px 5px rgba(0,0,0,.35); }
.wp-coll-select:hover { border-color: #fff; background: rgba(20,31,49,.88); }
.wp-coll-select.wp-coll-select-on { color: #fff; border-color: transparent; background: var(--wp-accent, #4c9aff); }
.wp-coll-empty { color: var(--dsw-alias-label-secondary, #888); padding: 16px 10px; text-align: center; font-size: 11px; grid-column: 1 / -1; }
@media (max-width: 480px) { .wp-filter-presets { grid-template-columns: repeat(2, minmax(0,1fr)); } .wp-effect-scope { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .wp-thumb, .wp-hover-preview, .wp-set-disclosure > summary::after, .wp-effect-section > summary::after, .wp-fx-preview, .wp-set-coll-card img { transition: none; } .wp-library-drawer { animation: none; } }
`)

    // 侧栏按钮 ↔ 面板 共享开关状态
    const store = { open: false, subs: new Set() }
    const setOpen = (v) => { store.open = v; store.subs.forEach((f) => f(v)) }
    const useOpen = () => {
      const [v, setV] = React.useState(store.open)
      React.useEffect(() => { store.subs.add(setV); return () => store.subs.delete(setV) }, [])
      return v
    }
    // 启动设置（localStorage 持久化）：enabled=插件总开关；autostart=随 DSH 启动自动展开面板；restoreBg=启动时以上次注入的壁纸载入背景
    const bootStore = {
      enabled: (() => { try { return localStorage.getItem('wp-enabled') !== '0' } catch (e) { return true } })(),
      autostart: (() => { try { return localStorage.getItem('wp-autostart') !== '0' } catch (e) { return true } })(),
      restoreBg: (() => { try { return localStorage.getItem('wp-restore-bg') === '1' } catch (e) { return false } })(),
      subs: new Set(),
    }
    const setEnabled = (v) => { bootStore.enabled = v; try { localStorage.setItem('wp-enabled', v ? '1' : '0') } catch (e) { /* ignore */ } scheduleCarousel(); bootStore.subs.forEach((f) => f(bootStore.enabled)) }
    const setAutostart = (v) => { bootStore.autostart = v; try { localStorage.setItem('wp-autostart', v ? '1' : '0') } catch (e) { /* ignore */ } bootStore.subs.forEach((f) => f(bootStore.autostart)) }
    const setRestoreBg = (v) => { bootStore.restoreBg = v; try { localStorage.setItem('wp-restore-bg', v ? '1' : '0') } catch (e) { /* ignore */ } bootStore.subs.forEach((f) => f(bootStore.restoreBg)) }
    const useBoot = () => {
      const [v, setV] = React.useState({ enabled: bootStore.enabled, autostart: bootStore.autostart, restoreBg: bootStore.restoreBg })
      React.useEffect(() => { const fn = () => setV({ enabled: bootStore.enabled, autostart: bootStore.autostart, restoreBg: bootStore.restoreBg }); bootStore.subs.add(fn); return () => bootStore.subs.delete(fn) }, [])
      return v
    }
    // 随 DSH 自启：插件激活时若开启且启用，自动展开面板
    if (bootStore.autostart && bootStore.enabled) setOpen(true)
    const h = React.createElement
    const call = (args) => host.call('we-call', args)
    const PLUGIN_VERSION = '0.3.1'
    const MUSIC_SCOPE_NOTE = '统一控制 DSH 当前可用音轨：视频、网页和实时场景；图片、应用预览及转码缓存本身无音轨，开声时场景会自动切回实时渲染。视频/网页仅在 DSH 内控制；实时场景按 Wallpaper Engine 窗口所属音频进程控制，若引擎复用同一进程可能联动桌面声音。'
    // 悬停预览独立于 .wp-root 渲染；面板滤镜会形成包含块，不能把 fixed 预览放在其内部。
    const hoverStore = { value: null, subs: new Set() }
    const setHover = (value) => { hoverStore.value = value; hoverStore.subs.forEach((f) => f(value)) }
    const useHover = () => {
      const [v, setV] = React.useState(hoverStore.value)
      React.useEffect(() => { hoverStore.subs.add(setV); return () => hoverStore.subs.delete(setV) }, [])
      return v
    }

    // 背景轮播：仅按用户勾选的清单切换；筛选只用于在合集里定位需要勾选的壁纸。
    let carouselSaved = null
    try { carouselSaved = JSON.parse(localStorage.getItem('wp-carousel') || 'null') } catch (e) { /* ignore */ }
    const carouselStore = Object.assign({ on: false, mode: 'sequential', interval: 30, selectedIds: [], lastId: null, subs: new Set() }, carouselSaved || {})
    carouselStore.mode = carouselStore.mode === 'random' ? 'random' : 'sequential'
    carouselStore.interval = Math.min(1440, Math.max(1, Number(carouselStore.interval) || 30))
    carouselStore.selectedIds = Array.isArray(carouselStore.selectedIds) ? [...new Set(carouselStore.selectedIds.filter((id) => typeof id === 'string' && id))] : []
    if (!carouselStore.selectedIds.length) carouselStore.on = false
    let carouselTimer = null
    let carouselBusy = false
    const persistCarousel = () => { try { localStorage.setItem('wp-carousel', JSON.stringify({ on: carouselStore.on, mode: carouselStore.mode, interval: carouselStore.interval, selectedIds: carouselStore.selectedIds, lastId: carouselStore.lastId })) } catch (e) { /* ignore */ } }
    const publishCarousel = () => { const snap = Object.assign({}, carouselStore, { selectedIds: carouselStore.selectedIds.slice() }); carouselStore.subs.forEach((f) => f(snap)) }
    const useCarousel = () => {
      const [v, setV] = React.useState(() => Object.assign({}, carouselStore, { selectedIds: carouselStore.selectedIds.slice() }))
      React.useEffect(() => { carouselStore.subs.add(setV); return () => carouselStore.subs.delete(setV) }, [])
      return v
    }
    const markCarouselItem = (item) => { if (item && item.id) { carouselStore.lastId = item.id; persistCarousel(); publishCarousel() } }
    const setCarousel = (patch) => {
      if (patch.interval !== undefined) patch.interval = Math.min(1440, Math.max(1, Number(patch.interval) || 1))
      if (patch.selectedIds !== undefined) patch.selectedIds = Array.isArray(patch.selectedIds) ? [...new Set(patch.selectedIds.filter((id) => typeof id === 'string' && id))] : []
      if (patch.mode !== undefined) patch.mode = patch.mode === 'random' ? 'random' : 'sequential'
      Object.assign(carouselStore, patch)
      if (!carouselStore.selectedIds.length) carouselStore.on = false
      persistCarousel()
      publishCarousel()
      scheduleCarousel()
    }

    // ---- 背景注入状态：静态图/视频/网页/场景捕获统一为 body 负 z-index 背景元素（filter 可统一作用）----
    // opacity: 表面不透明度（0~100%，默认 15，界面全透明、背景完全呈现）——控制「界面内容 vs 背景」的平衡
    // contrast/saturate: 背景画面 对比度/饱和度（%，100=原始）
    const bgStore = { on: false, item: null, region: 'full', scale: 1, fit: null, videoUrl: null, webUrl: null, capId: null, staticUrl: null, opacity: 0.15, contrast: 100, saturate: 100, brightness: 100, blur: 0, subs: new Set() }
    const isFilterSupported = (item) => !!(item && (item.type === 'image' || item.type === 'video'))
    const isFilterAvailable = (state) => !!(state && state.on && isFilterSupported(state.item))
    // 注意：必须传新对象（浅拷贝）给订阅者——React 用 Object.is 比较，传同一引用不会触发重渲染
    const setBg = (on, item) => {
      bgStore.on = on
      bgStore.item = item || null
      const snap = Object.assign({}, bgStore)
      bgStore.subs.forEach((f) => f(snap))
    }
    const useBg = () => {
      const [v, setV] = React.useState(bgStore)
      React.useEffect(() => { bgStore.subs.add(setV); return () => bgStore.subs.delete(setV) }, [])
      return v
    }
    // 音乐偏好独立于画面效果：默认保持既有的静音注入行为，用户主动开启后才恢复声音。
    const musicStore = { on: false, subs: new Set() }
    let nativeSceneWindow = null
    let nativeSceneAttached = false
    try { musicStore.on = localStorage.getItem('wp-bg-music-on') === '1' } catch (e) { /* ignore */ }
    const syncDshBgMusic = () => {
      if (videoBgEl) videoBgEl.muted = !musicStore.on
      try {
        if (webBgEl && webBgEl.contentDocument) {
          for (const media of webBgEl.contentDocument.querySelectorAll('audio,video')) media.muted = !musicStore.on
        }
      } catch (e) { /* 网页背景跨域时无法读取，但绝不降级为桌面级静音 */ }
      try {
        if (webBgEl && webBgEl.contentWindow) webBgEl.contentWindow.postMessage({ type: 'dsh-wallpaper-audio', on: musicStore.on }, '*')
      } catch (e) { /* iframe 尚未就绪，load 后会再次同步 */ }
      if (nativeSceneWindow) return call({ action: 'native-audio', window: nativeSceneWindow, on: musicStore.on }).catch(() => null)
    }
    const setBgMusic = (on) => {
      musicStore.on = !!on
      try { localStorage.setItem('wp-bg-music-on', musicStore.on ? '1' : '0') } catch (e) { /* ignore */ }
      syncDshBgMusic()
      musicStore.subs.forEach((f) => f(musicStore.on))
      // 场景转码缓存无音轨；开声时终止等待并切回实时场景，避免完成回调再次覆盖为静音缓存。
      if (musicStore.on && bgStore.item && bgStore.item.type === 'scene' && !nativeSceneWindow) {
        stopTranscodePoll()
        setTransProg(null)
        injectBg(bgStore.item, bgStore.region || 'full', bgStore.scale || 1).catch(() => {})
      }
    }
    const useBgMusic = () => {
      const [v, setV] = React.useState(musicStore.on)
      React.useEffect(() => { musicStore.subs.add(setV); return () => musicStore.subs.delete(setV) }, [])
      return v
    }
    // 转码进度（注入按钮实时显示）：{ id, pct } | null；仅「需要转码的非视频输入源（场景壁纸）」设置
    const transProgStore = { prog: null, subs: new Set() }
    const setTransProg = (p) => { transProgStore.prog = p; transProgStore.subs.forEach((f) => f(p)) }
    const useTransProg = () => {
      const [v, setV] = React.useState(transProgStore.prog)
      React.useEffect(() => { transProgStore.subs.add(setV); return () => transProgStore.subs.delete(setV) }, [])
      return v
    }
    // 背景效果 store（设置页 + 面板双向实时调整，localStorage 持久化，即时生效预览）：
    //   on      效果总开关（关闭时镜像/反转/RGB/色调/动画速度全部失效，画面调整参数不受影响）
    //   strength 色调强度 0-100（叠加所选颜色的浓度；0 = 无色罩）
    //   color   色调颜色（#rrggbb）
    //   opacity 背景透明度 0-100（与 bgStore.opacity 同步：0=全透明，100=完全不透明）
    //   speed   动画速度 0-100（滑块；映射视频播放速率 0.5x~1.5x，50=1.0x 正常）
    //   mirror  水平镜像；invert 反色；rgbR/rgbG/rgbB 通道增益 0-100（100=原始，0=该通道全黑）
    //   glass   磨砂强度 0-100（控制插件自身面板/设置卡片的模糊程度；50=默认）
    //   uiGlass 宿主界面磨砂强度 0-100（侧栏、Cordis 面板、设置弹窗、对话输入框；0=关闭）
    //   uiTint/uiTintAll/uiTintStrength 界面染色开关、范围和独立强度（不参与壁纸效果链）
    //   hue/temperature/sepia/grayscale 色彩滤镜；light* 光源；vignette/grain 氛围层
    //   material 记录当前界面材质预设（独立于壁纸滤镜）
    const FILTER_FX_DEFAULTS = {
      on: true, strength: 0, mirror: false, invert: false, rgbR: 100, rgbG: 100, rgbB: 100, hue: 0, temperature: 0, sepia: 0, grayscale: 0,
      light: 0, lightColor: '#ffd6a3', lightX: 32, lightY: 22, lightSize: 68,
      light2: 0, light2Color: '#8fc8ff', light2X: 72, light2Y: 30, light2Size: 64,
      light3: 0, light3Color: '#f2a7ff', light3X: 50, light3Y: 82, light3Size: 54,
      vignette: 0, grain: 0,
    }
    const FILTER_BG_DEFAULTS = { brightness: 100, contrast: 100, saturate: 100, blur: 0 }
    const fxDefaults = Object.assign({ color: '#4c9aff', opacity: 15, speed: 50, glass: 50, uiGlass: 0, uiTint: false, uiTintAll: false, uiTintStrength: 30, material: 'clear' }, FILTER_FX_DEFAULTS)
    const fxStore = Object.assign({ subs: new Set() }, fxDefaults)
    // 界面材质预设：只作用于侧栏、Cordis 面板、设置弹窗和输入框，不改壁纸画面参数。
    const BG_MATERIALS = [
      { id: 'clear', name: '原片', hint: '关闭界面材质', uiGlass: 0 },
      { id: 'mist', name: '柔雾', hint: '轻度通透', uiGlass: 34 },
      { id: 'frosted', name: '磨砂', hint: '标准磨砂', uiGlass: 72 },
      { id: 'noir', name: '暗幕', hint: '深色玻璃', uiGlass: 50 },
    ]
    // 图片/视频视觉方案：只改壁纸滤镜，不碰音乐、轮播、启动设置和界面材质。
    const FILTER_PRESETS = [
      { id: 'original', name: '原片', hint: '中性还原', fx: Object.assign({}, FILTER_FX_DEFAULTS), bg: Object.assign({}, FILTER_BG_DEFAULTS) },
      { id: 'cinema', name: '影院', hint: '沉稳胶片', fx: Object.assign({}, FILTER_FX_DEFAULTS, { temperature: 12, sepia: 5, vignette: 36, grain: 12, light: 10, light3: 8, light3Color: '#ffb36b' }), bg: { brightness: 94, contrast: 118, saturate: 88, blur: 0 } },
      { id: 'neon-night', name: '霓虹夜', hint: '冷光高彩', fx: Object.assign({}, FILTER_FX_DEFAULTS, { temperature: -28, hue: -8, light: 38, lightColor: '#6d7cff', lightX: 72, lightY: 24, light2: 28, light2Color: '#ff4fc8', light2X: 22, light2Y: 52, light3: 16, light3Color: '#3cf3ff', vignette: 44, grain: 8 }), bg: { brightness: 94, contrast: 128, saturate: 148, blur: 0 } },
      { id: 'golden-hour', name: '暖阳', hint: '柔暖侧光', fx: Object.assign({}, FILTER_FX_DEFAULTS, { temperature: 48, sepia: 10, light: 46, lightColor: '#ffd08a', lightX: 24, lightY: 18, lightSize: 78, light2: 14, light2Color: '#a7cbff', light2X: 82, light2Y: 48, vignette: 12 }), bg: { brightness: 108, contrast: 103, saturate: 112, blur: 0 } },
      { id: 'cool-mist', name: '冷雾', hint: '低饱和蓝调', fx: Object.assign({}, FILTER_FX_DEFAULTS, { temperature: -46, grayscale: 8, light: 28, lightColor: '#b8dcff', lightX: 48, lightY: 16, lightSize: 92, light2: 12, light2Color: '#d9b8ff', light2X: 18, light2Y: 68, vignette: 18 }), bg: { brightness: 102, contrast: 92, saturate: 78, blur: 1 } },
      { id: 'vintage', name: '旧时光', hint: '褪色颗粒', fx: Object.assign({}, FILTER_FX_DEFAULTS, { temperature: 36, sepia: 32, vignette: 30, grain: 28, light: 14, lightColor: '#f3c58b' }), bg: { brightness: 98, contrast: 108, saturate: 72, blur: 0 } },
      { id: 'silver', name: '银盐', hint: '黑白硬调', fx: Object.assign({}, FILTER_FX_DEFAULTS, { grayscale: 100, vignette: 46, grain: 32 }), bg: { brightness: 100, contrast: 126, saturate: 0, blur: 0 } },
      { id: 'dream', name: '梦境', hint: '柔焦漫光', fx: Object.assign({}, FILTER_FX_DEFAULTS, { hue: 14, light: 40, lightColor: '#e6b8ff', lightX: 62, lightY: 24, lightSize: 90, light2: 24, light2Color: '#89e8ff', light2X: 18, light2Y: 62, light3: 18, light3Color: '#ffd0e5', vignette: 10, grain: 5 }), bg: { brightness: 110, contrast: 90, saturate: 136, blur: 2 } },
    ]
    try {
      for (const k of Object.keys(fxDefaults)) {
        const v = localStorage.getItem('wp-fx-' + k)
        if (v === null) continue
        if (typeof fxDefaults[k] === 'boolean') fxStore[k] = v === '1'
        else if (typeof fxDefaults[k] === 'number') { const n = Number(v); if (isFinite(n)) fxStore[k] = n }
        else fxStore[k] = v
      }
      for (const k of Object.keys(FILTER_BG_DEFAULTS)) {
        const stored = localStorage.getItem('wp-bg-fx-' + k)
        const value = Number(stored)
        if (stored !== null && Number.isFinite(value)) bgStore[k] = value
      }
    } catch (e) { /* ignore */ }
    // 旧版调节会持久化 custom，但它不是实际材质预设，恢复为可渲染的默认磨砂。
    if (!BG_MATERIALS.some((material) => material.id === fxStore.material)) fxStore.material = fxStore.uiGlass ? 'frosted' : 'clear'
    const persistFx = (p) => { try { for (const k of Object.keys(p)) localStorage.setItem('wp-fx-' + k, String(fxStore[k])) } catch (e) { /* ignore */ } }
    // 初始化同步：持久化的透明度（0-100）→ bgStore.opacity（0-1）
    bgStore.opacity = Math.min(1, Math.max(0, fxStore.opacity / 100))
    // 初始化同步：持久化的磨砂强度 → CSS 变量 --wp-glass-blur（12px~40px）
    try {
      const g = Math.min(100, Math.max(0, fxStore.glass))
      document.documentElement.style.setProperty('--wp-glass-blur', Math.round(12 + (g / 100) * 28) + 'px')
    } catch (e) { /* ignore */ }
    const syncUiGlass = () => {
      try {
        const level = Math.min(100, Math.max(0, Number(fxStore.uiGlass) || 0))
        const root = document.documentElement
        root.style.setProperty('--wp-ui-glass-blur', Math.round(4 + level * .44) + 'px')
        // 强度同时控制雾化、透光和高光：低值保持可读，高值才能看出玻璃的通透感。
        root.style.setProperty('--wp-ui-glass-surface', Math.max(68, 92 - level * .24) + '%')
        root.style.setProperty('--wp-ui-material-strength', (level / 100).toFixed(2))
        root.style.setProperty('--wp-ui-tint', fxStore.color)
        root.style.setProperty('--wp-ui-tint-strength', Math.max(0, Math.min(40, (Number(fxStore.uiTintStrength) || 0) * .4)) + '%')
        root.style.setProperty('--wp-ui-tint-surface', Math.min(1, Math.max(0, Number(bgStore.opacity) || 0)).toFixed(2))
        if (level) root.setAttribute('data-wp-ui-glass', '')
        else root.removeAttribute('data-wp-ui-glass')
        if (level && fxStore.material && fxStore.material !== 'clear') root.setAttribute('data-wp-ui-material', fxStore.material)
        else root.removeAttribute('data-wp-ui-material')
        if (fxStore.uiTint) root.setAttribute('data-wp-ui-tint', '')
        else root.removeAttribute('data-wp-ui-tint')
        if (fxStore.uiTint && fxStore.uiTintAll) root.setAttribute('data-wp-ui-tint-all', '')
        else root.removeAttribute('data-wp-ui-tint-all')
      } catch (e) { /* ignore */ }
    }
    syncUiGlass()
    const setFx = (p) => {
      Object.assign(fxStore, p)
      persistFx(p)
      // 透明度与 bgStore.opacity 同步（0-100 ↔ 0-1）
      if (p.opacity !== undefined) { bgStore.opacity = Math.min(1, Math.max(0, p.opacity / 100)); if (bgStore.on) enableBgCss(bgStore.opacity) }
      // 磨砂强度（0-100）→ CSS 变量 --wp-glass-blur（12px~40px）
      if (p.glass !== undefined) {
        const blurPx = Math.round(12 + (Math.min(100, Math.max(0, p.glass)) / 100) * 28)
        try { document.documentElement.style.setProperty('--wp-glass-blur', blurPx + 'px') } catch (e) { /* ignore */ }
      }
      if (p.uiGlass !== undefined || p.uiTint !== undefined || p.uiTintAll !== undefined || p.uiTintStrength !== undefined || p.color !== undefined || p.opacity !== undefined || p.material !== undefined) syncUiGlass()
      applyFxNow()
      syncNativeSceneFx()
      fxStore.subs.forEach((f) => f(Object.assign({}, fxStore)))
    }
    const resetFx = () => { setFx(Object.assign({}, fxDefaults)) }
    const useFx = () => {
      const [v, setV] = React.useState(Object.assign({}, fxStore))
      React.useEffect(() => { const fn = () => setV(Object.assign({}, fxStore)); fxStore.subs.add(fn); return () => fxStore.subs.delete(fn) }, [])
      return v
    }
    const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
    const clamp = (value, min, max) => Math.min(max, Math.max(min, finiteOr(value, min)))
    const hexRgb = (value) => {
      const match = /^#([0-9a-f]{6})$/i.exec(String(value || ''))
      return match ? [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)] : [255, 214, 163]
    }
    const atmosphereStyles = (state) => {
      const enabled = !!(state && state.on)
      const lights = enabled ? [
        ['light', 'lightColor', 'lightX', 'lightY', 'lightSize'],
        ['light2', 'light2Color', 'light2X', 'light2Y', 'light2Size'],
        ['light3', 'light3Color', 'light3X', 'light3Y', 'light3Size'],
      ].map(([strengthKey, colorKey, xKey, yKey, sizeKey]) => ({
        strength: clamp(state[strengthKey], 0, 100),
        rgb: hexRgb(state[colorKey]),
        x: clamp(state[xKey], 0, 100),
        y: clamp(state[yKey], 0, 100),
        size: clamp(state[sizeKey], 20, 120),
      })).filter((light) => light.strength > 0) : []
      const vignette = enabled ? clamp(state.vignette, 0, 100) : 0
      const grain = enabled ? clamp(state.grain, 0, 100) : 0
      const noiseAlpha = (grain * .0018).toFixed(3)
      return {
        active: !!(lights.length || vignette || grain),
        light: {
          background: lights.map((light) => 'radial-gradient(circle at ' + light.x + '% ' + light.y + '%, rgba(' + light.rgb.join(',') + ',' + (light.strength * .006).toFixed(3) + ') 0%, rgba(' + light.rgb.join(',') + ',' + (light.strength * .0015).toFixed(3) + ') ' + Math.round(light.size * .45) + '%, transparent ' + light.size + '%)').join(','),
          backgroundBlendMode: 'screen', mixBlendMode: 'screen', opacity: lights.length ? 1 : 0,
        },
        vignette: { background: 'radial-gradient(ellipse at 50% 48%, transparent ' + Math.round(64 - vignette * .22) + '%, rgba(0,0,0,' + (vignette * .0075).toFixed(3) + ') 100%)', opacity: vignette ? 1 : 0 },
        grain: { backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'128\' height=\'128\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'.78\' numOctaves=\'4\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'128\' height=\'128\' filter=\'url(%23n)\' opacity=\'' + noiseAlpha + '\'/></svg>")', backgroundSize: '128px 128px', mixBlendMode: 'soft-light', opacity: grain ? 1 : 0 },
      }
    }
    // 应用效果到当前背景元素（filter 链 + transform + 视频速率 + 色调层）；无背景时只准备 SVG 滤镜
    const applyFxNow = () => {
      try {
        const on = !!(fxStore.on && isFilterAvailable(bgStore))
        // 滤镜链：基础画面 + 色温/通道矩阵 + 可调色彩滤镜。
        const parts = []
        if (on) {
          if (fxStore.invert) parts.push('invert(100%)')
          if (finiteOr(fxStore.sepia, 0)) parts.push('sepia(' + clamp(fxStore.sepia, 0, 100) + '%)')
          if (finiteOr(fxStore.grayscale, 0)) parts.push('grayscale(' + clamp(fxStore.grayscale, 0, 100) + '%)')
          if (fxStore.rgbR !== 100 || fxStore.rgbG !== 100 || fxStore.rgbB !== 100 || finiteOr(fxStore.temperature, 0)) {
            // RGB 通道与色温共用一个 SVG 矩阵，避免叠加多个 SVG filter。
            try {
              let mat = document.getElementById('dsh-wp-rgbmat')
              if (!mat) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute'
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
                const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
                filter.setAttribute('id', 'dsh-wp-rgbfilter')
                filter.setAttribute('color-interpolation-filters', 'sRGB')
                mat = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
                mat.setAttribute('id', 'dsh-wp-rgbmat')
                mat.setAttribute('type', 'matrix')
                filter.appendChild(mat); defs.appendChild(filter); svg.appendChild(defs)
                document.body.appendChild(svg)
              }
              const temperature = clamp(fxStore.temperature, -100, 100) / 100
              const r = clamp(fxStore.rgbR, 0, 200) / 100 * (1 + temperature * .18)
              const g = clamp(fxStore.rgbG, 0, 200) / 100 * (1 + temperature * .03)
              const b = clamp(fxStore.rgbB, 0, 200) / 100 * (1 - temperature * .18)
              mat.setAttribute('values', r + ' 0 0 0 0  0 ' + g + ' 0 0 0  0 0 ' + b + ' 0 0  0 0 0 1 0')
              parts.push('url(#dsh-wp-rgbfilter)')
            } catch (e) { /* ignore */ }
          }
        }
        const f = 'brightness(' + finiteOr(bgStore.brightness, 100) + '%) contrast(' + finiteOr(bgStore.contrast, 100) + '%) saturate(' + finiteOr(bgStore.saturate, 100) + '%)' + (on && fxStore.hue ? ' hue-rotate(' + fxStore.hue + 'deg)' : '') + (finiteOr(bgStore.blur, 0) > 0 ? ' blur(' + bgStore.blur + 'px)' : '')
        const full = parts.length ? parts.join(' ') + ' ' + f : f
        for (const el of [bgStaticEl, videoBgEl, webBgEl, capBgEl]) {
          if (el) { try { el.style.filter = full } catch (e) { /* ignore */ } }
        }
        // 设置页背景预览卡片 + 背景合集小窗预览：同步应用滤镜（实时预览效果）
        for (const pid of ['wp-fx-preview-img']) {
          try {
            const pv = document.getElementById(pid)
            if (pv) pv.style.filter = full
          } catch (e) { /* ignore */ }
        }
        // 水平镜像（transform 不参与 filter，单独应用）
        const mirror = on && fxStore.mirror ? 'scaleX(-1)' : ''
        for (const el of [bgStaticEl, videoBgEl, webBgEl, capBgEl]) {
          if (el) { try { el.style.transform = mirror } catch (e) { /* ignore */ } }
        }
        for (const pid of ['wp-fx-preview-img']) {
          try {
            const pv = document.getElementById(pid)
            if (pv) pv.style.transform = mirror
          } catch (e) { /* ignore */ }
        }
        // 动画速度（视频元素播放速率：滑块 0-100 → 0.5x~1.5x；图片/网页/捕获无法变速）
        if (videoBgEl) {
          try { videoBgEl.playbackRate = on ? 0.5 + (fxStore.speed / 100) : 1 } catch (e) { /* ignore */ }
        }
        // 色调叠加层（固定层：所选颜色 + 强度控制透明度；z-index:-1 置于内容之下、背景画面之上）
        if (on && fxStore.strength > 0 && bgStore.on) {
          if (!fxTintEl) {
            try {
              fxTintEl = document.createElement('div')
              fxTintEl.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;'
              document.body.appendChild(fxTintEl)
            } catch (e) { /* ignore */ }
          }
          if (fxTintEl) {
            try {
              fxTintEl.style.background = fxStore.color
              fxTintEl.style.opacity = String(Math.min(1, Math.max(0, fxStore.strength / 100)))
            } catch (e) { /* ignore */ }
          }
        } else if (fxTintEl) {
          try { fxTintEl.parentNode.removeChild(fxTintEl) } catch (e) { /* ignore */ }
          fxTintEl = null
        }
        // 光源、暗角和颗粒仅覆盖图片/视频；切换到其他类型时移除透明层。
        const atmosphere = atmosphereStyles(on ? fxStore : null)
        if (atmosphere.active && bgStore.on) {
          if (!fxAtmosphereEl) {
            fxAtmosphereEl = document.createElement('div')
            fxAtmosphereEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;'
            for (var layerIndex = 0; layerIndex < 3; layerIndex++) {
              const layer = document.createElement('div')
              layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
              fxAtmosphereEl.appendChild(layer)
            }
            document.body.appendChild(fxAtmosphereEl)
          }
          Object.assign(fxAtmosphereEl.children[0].style, atmosphere.light)
          Object.assign(fxAtmosphereEl.children[1].style, atmosphere.vignette)
          Object.assign(fxAtmosphereEl.children[2].style, atmosphere.grain)
        } else if (fxAtmosphereEl) {
          try { fxAtmosphereEl.parentNode.removeChild(fxAtmosphereEl) } catch (e) { /* ignore */ }
          fxAtmosphereEl = null
        }
      } catch (e) { /* ignore */ }
    }
    let fxTintEl = null
    let fxAtmosphereEl = null
    let bgCssDisposer = null
    // 背景显示区域预设（% 尺寸 + 位置），scale 为缩放倍数
    const BG_REGION = {
      full: { w: 100, h: 100, pos: 'center center', smart: true },
      'right-half': { w: 50, h: 100, pos: 'right center', smart: false },
      'right-twothirds': { w: 66.67, h: 100, pos: 'right center', smart: false },
      'left-half': { w: 50, h: 100, pos: 'left center', smart: false },
      small: { w: 50, h: 50, pos: 'center center', smart: false },
    }
    // 只注入表面半透明变量（背景本体一律走 body 负 z-index 背景元素，filter 可统一作用）
    const buildBgCss = (opacity) => {
      const o = (typeof opacity === 'number' && opacity >= 0 && opacity <= 1) ? opacity : 0.15
      const A = (d) => Math.min(o + d, 0.95)
      return `
body, body[data-ds-dark-theme] {
  background: transparent !important;
  --dsw-alias-bg-base: rgba(13,15,20,${o.toFixed(2)}) !important;
  --dsw-alias-bg-layer-1: rgba(15,17,22,${A(0.05).toFixed(2)}) !important;
  --dsw-alias-bg-layer-2: rgba(17,19,24,${A(0.05).toFixed(2)}) !important;
  --dsw-alias-bg-layer-3: rgba(19,21,26,${A(0.05).toFixed(2)}) !important;
  --dsw-alias-bg-module-platform: rgba(17,19,24,${A(0.05).toFixed(2)}) !important;
  --dsw-alias-bg-multi-select: rgba(17,19,24,${A(0.05).toFixed(2)}) !important;
  --dsw-alias-bg-skeleton: rgba(255,255,255,${Math.min(0.12 + o * 0.2, 0.3).toFixed(2)}) !important;
  --dsw-alias-markdown-code-block: rgba(10,12,16,${A(0.15).toFixed(2)}) !important;
  --dsw-specific-sidebar-fill: rgba(13,15,20,${A(0.10).toFixed(2)}) !important;
  --dsw-specific-input-major: rgba(15,17,22,${A(0.05).toFixed(2)}) !important;
  --dsw-specific-bubble: rgba(20,22,28,${A(0.10).toFixed(2)}) !important;
  --dsw-specific-tip: rgba(15,17,22,${A(0.05).toFixed(2)}) !important;
}
html, #root, #root > * { background-color: transparent !important; }
.VOzbGW_panel {
  border: 1px solid rgba(255,255,255,.20) !important;
  box-shadow: var(--dsw-shadow-lv3), 0 0 0 1px rgba(0,0,0,.32) !important;
}
`
    }
    const enableBgCss = (opacity) => {
      try {
        if (bgCssDisposer) { try { bgCssDisposer() } catch (e) { /* ignore */ } }
        bgCssDisposer = styles.insert(buildBgCss(opacity))
      } catch (e) { /* css insert failed */ }
    }
    const disableBgCss = () => { if (bgCssDisposer) { try { bgCssDisposer() } catch (e) { /* ignore */ } bgCssDisposer = null } }
    // 背景画面滤镜：亮度/对比度/饱和度/模糊 + 效果链（镜像/反转/RGB/色调/速度）统一应用
    const applyBgFilter = () => { applyFxNow() }
    // 调整背景参数（透明度/对比度/饱和度/亮度/模糊）并即时重应用
    const setBgParams = (p) => {
      if (p.opacity !== undefined) {
        bgStore.opacity = p.opacity
        // 与效果 store 透明度（0-100）双向同步
        fxStore.opacity = Math.round(Math.min(1, Math.max(0, p.opacity)) * 100)
        try { localStorage.setItem('wp-fx-opacity', String(fxStore.opacity)) } catch (e) { /* ignore */ }
      }
      if (p.contrast !== undefined) bgStore.contrast = p.contrast
      if (p.saturate !== undefined) bgStore.saturate = p.saturate
      if (p.brightness !== undefined) bgStore.brightness = p.brightness
      if (p.blur !== undefined) bgStore.blur = p.blur
      try { for (const key of Object.keys(FILTER_BG_DEFAULTS)) if (p[key] !== undefined) localStorage.setItem('wp-bg-fx-' + key, String(bgStore[key])) } catch (e) { /* ignore */ }
      if (p.opacity !== undefined) syncUiGlass()
      if (bgStore.on && bgStore.item) {
        enableBgCss(bgStore.opacity)
        applyBgFilter()
        syncNativeSceneFx()
      }
      setBg(bgStore.on, bgStore.item)
    }
    const filterFxSnapshot = (source) => Object.keys(FILTER_FX_DEFAULTS).reduce((result, key) => { result[key] = source[key]; return result }, {})
    const filterPresetActive = (preset, fx, bg) => Object.keys(preset.fx).every((key) => fx[key] === preset.fx[key]) && Object.keys(preset.bg).every((key) => bg[key] === preset.bg[key])
    const applyFilterPreset = (preset) => { if (isFilterAvailable(bgStore)) { setFx(Object.assign({}, preset.fx)); setBgParams(Object.assign({}, preset.bg)) } }
    const resetFilters = () => applyFilterPreset(FILTER_PRESETS[0])
    const BasePictureControls = ({ bg, compact }) => {
      const rows = [
        ['opacity', '透明度', 0, 100, Math.round((bg && bg.opacity != null ? bg.opacity : .15) * 100), (value) => setBgParams({ opacity: value / 100 }), '%'],
        ['brightness', '亮度', 40, 200, bg && bg.brightness != null ? bg.brightness : 100, (value) => setBgParams({ brightness: value }), '%'],
        ['contrast', '对比度', 40, 200, bg && bg.contrast != null ? bg.contrast : 100, (value) => setBgParams({ contrast: value }), '%'],
        ['saturate', '饱和度', 0, 200, bg && bg.saturate != null ? bg.saturate : 100, (value) => setBgParams({ saturate: value }), '%'],
        ['blur', '模糊', 0, 20, bg && bg.blur != null ? bg.blur : 0, (value) => setBgParams({ blur: value }), 'px'],
      ]
      return h('div', { className: 'wp-base-controls' }, rows.map(([key, label, min, max, value, set, suffix]) =>
        h('div', { key, className: compact ? 'wp-slider-row' : 'wp-set-row' },
          h('span', {}, label),
          h('input', { className: compact ? '' : 'wp-set-range', type: 'range', min, max, value, 'data-picture-key': key, 'aria-label': label, onChange: (e) => set(Number(e.target.value)) }),
          h('b', { className: compact ? '' : 'wp-set-num' }, String(value) + suffix))))
    }
    const FilterControls = ({ fx, bg, compact, disabled, disabledReason }) => {
      if (disabled) return h('div', { className: 'wp-filter-unavailable', role: 'status' },
        h('strong', {}, '当前背景不可使用滤镜'),
        h('span', {}, disabledReason))
      const slider = (key, label, value, min, max, set, suffix, disabled) => h('div', { className: compact ? 'wp-slider-row' : 'wp-set-row' },
        h('span', {}, label),
        h('input', { className: compact ? '' : 'wp-set-range', type: 'range', min, max, value, disabled: !!disabled, 'data-fx-key': key, 'aria-label': label, onChange: (e) => set(Number(e.target.value)) }),
        h('b', { className: compact ? '' : 'wp-set-num' }, String(value) + (suffix || '')))
      const fxSlider = (key, label, min, max, suffix, disabled) => slider(key, label, fx[key], min, max, (value) => setFx({ [key]: value }), suffix, disabled)
      const lightControls = (suffix, hint) => {
        const base = 'light' + suffix
        const colorKey = base + 'Color'
        return h('div', { className: 'wp-light-controls' },
          h('div', { className: 'wp-filter-color' },
            h('span', {}, '光色'),
            h('input', { type: 'color', value: fx[colorKey], 'data-fx-key': colorKey, 'aria-label': hint + '颜色', onChange: (e) => setFx({ [colorKey]: e.target.value }) }),
            h('small', {}, hint)),
          fxSlider(base, '强度', 0, 100, '%'),
          fxSlider(base + 'X', '横向', 0, 100, '%'),
          fxSlider(base + 'Y', '纵向', 0, 100, '%'),
          fxSlider(base + 'Size', '范围', 20, 120, '%'))
      }
      const mirrorOn = !!(fx.on && fx.mirror)
      const invertOn = !!(fx.on && fx.invert)
      const videoReady = !!(bg && bg.on && bg.item && bg.item.type === 'video')
      return h('div', { className: 'wp-filter-controls' + (compact ? ' wp-filter-controls-compact' : '') },
        h('div', { className: 'wp-filter-status' },
          h('strong', {}, '图片 / 视频视觉链'),
          h('small', {}, '仅图片 · 视频'),
          h('button', { type: 'button', className: 'wp-btn', onClick: resetFilters, title: '只重置壁纸滤镜，不改变界面材质、声音和轮播', style: { fontSize: 9 } }, '重置滤镜')),
        h('div', { className: 'wp-filter-scope-note' }, '预设会联动基础画面参数；亮度、对比度、饱和度和模糊只在“基础画面”保留一套控件。'),
        h('div', { className: 'wp-filter-presets', role: 'group', 'aria-label': '滤镜方案' }, FILTER_PRESETS.map((preset) =>
          h('button', { key: preset.id, type: 'button', className: 'wp-filter-preset' + (filterPresetActive(preset, fx, bg) ? ' wp-filter-preset-on' : ''), 'data-fx-preset': preset.id, 'aria-pressed': filterPresetActive(preset, fx, bg), onClick: () => applyFilterPreset(preset) },
            h('b', {}, preset.name), h('small', {}, preset.hint)))),
        h('div', { className: 'wp-filter-block' },
          h('div', { className: 'wp-filter-block-title' }, h('span', {}, '☀ 多光源'), h('small', {}, '主光·辅光·轮廓光独立调整')),
          h('div', { className: 'wp-light-source' },
            h('div', { className: 'wp-light-source-head' }, h('span', {}, '主光'), h('small', {}, fx.light + '%')),
            lightControls('', '主光源位置与范围')),
          h('details', { className: 'wp-light-source' },
            h('summary', {}, h('span', {}, '辅光'), h('small', {}, fx.light2 + '% · 展开调整')),
            lightControls('2', '辅光补足暗部层次')),
          h('details', { className: 'wp-light-source' },
            h('summary', {}, h('span', {}, '轮廓光'), h('small', {}, fx.light3 + '% · 展开调整')),
            lightControls('3', '轮廓光强化边缘氛围'))),
        h('div', { className: 'wp-filter-block' },
          h('div', { className: 'wp-filter-block-title' }, h('span', {}, '◐ 滤镜色彩'), h('small', {}, '仅图片和视频')),
          fxSlider('temperature', '色温', -100, 100, ''),
          fxSlider('hue', '色相', -180, 180, '°'),
          fxSlider('sepia', '棕褐', 0, 100, '%'),
          fxSlider('grayscale', '黑白', 0, 100, '%')),
        h('div', { className: 'wp-filter-block' },
          h('div', { className: 'wp-filter-block-title' }, h('span', {}, '✦ 氛围'), h('small', {}, '边缘与质感')),
          fxSlider('vignette', '暗角', 0, 100, '%'),
          fxSlider('grain', '颗粒', 0, 100, '%'),
          h('div', { className: 'wp-filter-scope-note' }, '色罩使用“界面材质 / 主色与界面”中的共享主色。'),
          fxSlider('strength', '色罩', 0, 100, '%')),
        h('div', { className: 'wp-filter-block' },
          h('div', { className: 'wp-filter-block-title' }, h('span', {}, 'RGB 通道'), h('small', {}, '100% 为原色')),
          fxSlider('rgbR', '红色', 0, 200, '%'),
          fxSlider('rgbG', '绿色', 0, 200, '%'),
          fxSlider('rgbB', '蓝色', 0, 200, '%'),
          h('div', { className: 'wp-filter-switches' },
            h('button', { type: 'button', className: 'wp-btn' + (fx.on ? ' wp-btn-on' : ''), 'aria-pressed': fx.on, onClick: () => setFx({ on: !fx.on }) }, fx.on ? '滤镜开' : '滤镜关'),
            h('button', { type: 'button', className: 'wp-btn' + (mirrorOn ? ' wp-btn-on' : ''), 'aria-pressed': mirrorOn, onClick: () => setFx({ on: true, mirror: !mirrorOn }) }, '水平镜像'),
            h('button', { type: 'button', className: 'wp-btn' + (invertOn ? ' wp-btn-on' : ''), 'aria-pressed': invertOn, onClick: () => setFx({ on: true, invert: !invertOn }) }, '反色'))),
        h('div', { className: 'wp-filter-block' },
          h('div', { className: 'wp-filter-block-title' }, h('span', {}, '▶ 动态'), h('small', {}, '仅视频背景')),
          fxSlider('speed', '播放速度', 0, 100, ' → ' + (0.5 + fx.speed / 100).toFixed(1) + 'x', !videoReady),
          h('div', { className: 'wp-filter-scope-note' }, videoReady ? '当前视频可实时调整播放速度。' : '图片没有播放速度；场景转码缓存仍按场景类型处理。'))
      )
    }
    // 静态背景（图片类型/场景预览回退）：body 底部负 z-index <img>（与视频/捕获统一，filter 可作用）
    let bgStaticEl = null
    let bgStaticScrimEl = null
    const insertStaticBg = (url) => {
      removeStaticBg()
      try {
        const scrim = document.createElement('div')
        scrim.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;background:rgba(8,10,14,0.45);'
        document.body.insertBefore(scrim, document.body.firstChild)
        bgStaticScrimEl = scrim
        const img = document.createElement('img')
        img.src = url
        img.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:cover;z-index:-1;pointer-events:none;background:#0b0d12;'
        document.body.insertBefore(img, scrim)
        bgStaticEl = img
        applyBgFilter()
      } catch (e) { /* dom insert failed */ }
    }
    const removeStaticBg = () => {
      if (bgStaticEl && bgStaticEl.parentNode) {
        try { bgStaticEl.parentNode.removeChild(bgStaticEl) } catch (e) { /* ignore */ }
      }
      if (bgStaticScrimEl && bgStaticScrimEl.parentNode) {
        try { bgStaticScrimEl.parentNode.removeChild(bgStaticScrimEl) } catch (e) { /* ignore */ }
      }
      bgStaticEl = null
      bgStaticScrimEl = null
    }
    // 视频背景：原生 DOM 把 <video> + 暗色遮罩插到 body 底部（负 z-index，位于应用内容之下）
    let videoBgEl = null
    let videoScrimEl = null
    const insertVideoBg = (url) => {
      removeVideoBg()
      try {
        const scrim = document.createElement('div')
        scrim.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;background:rgba(8,10,14,0.45);'
        document.body.insertBefore(scrim, document.body.firstChild)
        videoScrimEl = scrim
        const v = document.createElement('video')
        v.src = url
        v.muted = !musicStore.on
        v.loop = true
        v.autoplay = true
        v.playsInline = true
        v.preload = 'auto' // 预加载：减少首帧缓冲等待
        v.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:cover;z-index:-1;pointer-events:none;'
        // 首帧缓冲期/循环跳转瞬间用壁纸预览图垫底（cover 铺满）——无黑屏、开场与衔接顺滑；
        // 视频帧可渲染后自动覆盖背景图（video 内容绘制在元素背景之上）
        const pit = bgStore.item
        if (pit && pit.previewUrl) {
          v.style.backgroundImage = 'url(' + pit.previewUrl + ')'
          v.style.backgroundSize = 'cover'
          v.style.backgroundPosition = 'center'
        } else {
          v.style.background = '#0b0d12'
        }
        document.body.insertBefore(v, scrim) // video 在 scrim 之下（同 z-index，后者在上）
        videoBgEl = v
        applyBgFilter()
        try { const p = v.play(); if (p && p.catch) p.catch(() => {}) } catch (e) { /* ignore */ }
      } catch (e) { /* dom insert failed */ }
    }
    const removeVideoBg = () => {
      if (videoBgEl && videoBgEl.parentNode) {
        try { videoBgEl.parentNode.removeChild(videoBgEl) } catch (e) { /* ignore */ }
      }
      if (videoScrimEl && videoScrimEl.parentNode) {
        try { videoScrimEl.parentNode.removeChild(videoScrimEl) } catch (e) { /* ignore */ }
      }
      videoBgEl = null
      videoScrimEl = null
    }
    // web 壁纸背景：body 底部负 z-index <iframe> 渲染原网页（内容之下）+ 暗色遮罩
    let webBgEl = null
    let webScrimEl = null
    const insertWebBg = (url) => {
      removeWebBg()
      try {
        const scrim = document.createElement('div')
        scrim.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;background:rgba(8,10,14,0.45);'
        document.body.insertBefore(scrim, document.body.firstChild)
        webScrimEl = scrim
        const f = document.createElement('iframe')
        f.src = url
        f.setAttribute('sandbox', 'allow-scripts')
        f.setAttribute('allow', 'autoplay; fullscreen')
        f.addEventListener('load', syncDshBgMusic)
        f.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:-1;pointer-events:none;background:#0b0d12;'
        document.body.insertBefore(f, scrim) // iframe 在 scrim 之下（同 z-index，后者在上）
        webBgEl = f
        applyBgFilter()
      } catch (e) { /* dom insert failed */ }
    }
    const removeWebBg = () => {
      if (webBgEl && webBgEl.parentNode) {
        try { webBgEl.parentNode.removeChild(webBgEl) } catch (e) { /* ignore */ }
      }
      if (webScrimEl && webScrimEl.parentNode) {
        try { webScrimEl.parentNode.removeChild(webScrimEl) } catch (e) { /* ignore */ }
      }
      webBgEl = null
      webScrimEl = null
    }
    // 场景壁纸背景：WE 引擎在 playInWindow 窗口里原画质渲染（窗口藏在 DSH 后面），
    // Host 每帧 PrintWindow 捕获窗口画面到 /wallpaper-capture/<id>，这里轮询刷新 <img>（body 负 z-index）
    // 渲染负担全在 Wallpaper Engine + capture.exe，插件只搬运 JPEG 帧。
    let capBgEl = null
    let capScrimEl = null
    let capTimer = null
    let capBusy = false
    let capFail = 0
    let capGeneration = 0
    const insertCapBg = (id, windowName) => {
      stopCapBg()
      const generation = capGeneration
      try {
        const scrim = document.createElement('div')
        scrim.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;background:rgba(8,10,14,0.45);'
        document.body.insertBefore(scrim, document.body.firstChild)
        capScrimEl = scrim
        const img = document.createElement('img')
        img.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:cover;z-index:-1;pointer-events:none;background:#0b0d12;'
        document.body.insertBefore(img, scrim) // img 在 scrim 之下（同 z-index，后者在上）
        capBgEl = img
        applyBgFilter()
        let everOk = false
        const tick = () => {
          if (generation !== capGeneration || capBusy) return
          capBusy = true
          const url = '/wallpaper-capture/' + encodeURIComponent(id) + '?window=' + encodeURIComponent(windowName || ('dsh-we-' + id)) + '&t=' + Date.now()
          const probe = new Image()
          probe.onload = () => {
            if (generation !== capGeneration || !capBgEl) return
            capBusy = false
            everOk = true
            try { capBgEl.src = url } catch (e) { /* ignore */ }
          }
          probe.onerror = () => {
            if (generation !== capGeneration) return
            capBusy = false
            // 从未成功且连续失败（窗口未就绪/引擎未启动/工具缺失）→ 回退预览图静态背景
            if (!everOk && ++capFail > 8) {
              stopCapBg()
              const item = bgStore.item
              if (item) insertStaticBg(bgUrlOf(item))
            }
          }
          probe.src = url
        }
        tick()
        capTimer = timer.interval(tick, windowName ? 250 : 1000)
      } catch (e) { /* dom insert failed */ }
    }
    const stopCapBg = () => {
      capGeneration++
      if (capTimer) { try { capTimer() } catch (e) { /* ignore */ } capTimer = null }
      if (capBgEl && capBgEl.parentNode) {
        try { capBgEl.parentNode.removeChild(capBgEl) } catch (e) { /* ignore */ }
      }
      if (capScrimEl && capScrimEl.parentNode) {
        try { capScrimEl.parentNode.removeChild(capScrimEl) } catch (e) { /* ignore */ }
      }
      capBgEl = null
      capScrimEl = null
      capBusy = false
      capFail = 0
    }
    const sceneNeedsRasterFx = () => {
      return finiteOr(bgStore.brightness, 100) !== 100 || finiteOr(bgStore.contrast, 100) !== 100 || finiteOr(bgStore.saturate, 100) !== 100 || finiteOr(bgStore.blur, 0) !== 0
    }
    let sceneFxModeTimer = null
    const cancelSceneFxMode = () => {
      if (!sceneFxModeTimer) return
      try { sceneFxModeTimer() } catch (e) { /* ignore */ }
      sceneFxModeTimer = null
    }
    const scheduleSceneFxMode = () => {
      cancelSceneFxMode()
      sceneFxModeTimer = timer.timeout(() => {
        sceneFxModeTimer = null
        const item = bgStore.item
        if (bgStore.on && item && item.type === 'scene') injectBg(item, bgStore.region || 'full', bgStore.scale || 1).catch(() => {})
      }, 120)
    }
    // 挂载后的原生子窗口无法单独获取原画像素；仅“基础画面”非中性时切换离屏捕获，图片/视频滤镜不参与场景判断。
    const syncNativeSceneFx = () => {
      if (!nativeSceneWindow || !bgStore.on || !bgStore.item || bgStore.item.type !== 'scene') return
      const needsCapture = sceneNeedsRasterFx()
      if (nativeSceneAttached) {
        if (needsCapture) scheduleSceneFxMode()
        else if (capBgEl) stopCapBg()
        return
      }
      if (needsCapture) {
        if (!capBgEl) insertCapBg(bgStore.item.id, nativeSceneWindow)
      } else if (capBgEl) scheduleSceneFxMode()
    }
    // 转码状态轮询：每 1.5s 查一次；onProgress 实时回报进度，onDone 在转码完成时调用
    // （先转码后注入流程用 onDone 完成注入；注入中升级场景不传 onDone 走默认升级）
    let transPollTimer = null
    let transPollTarget = null
    const startTranscodePoll = (id, opts) => {
      stopTranscodePoll()
      transPollTarget = id
      transPollTimer = timer.interval(() => {
        if (!transPollTarget || transPollTarget !== id) { stopTranscodePoll(); return }
        call({ action: 'transcode-status', target: transPollTarget }).then((st) => {
          if (!transPollTarget || transPollTarget !== id) { stopTranscodePoll(); return }
          if (st && st.ok && st.cached) {
            stopTranscodePoll()
            setTransProg(null) // 转码完成：清除按钮进度显示
            if (opts && opts.onDone) { opts.onDone(st); return }
            // 默认：注入中场景升级为视频播放
            if (bgStore.on && bgStore.item && bgStore.item.id === id) {
              const it = bgStore.item
              bgStore.capId = null
              bgStore.videoUrl = '/wallpaper-transcode/' + id
              stopCapBg()
              setBg(true, it)
              insertVideoBg(bgStore.videoUrl)
            }
            return
          }
          if (st && st.ok && opts && opts.onProgress && typeof st.progress === 'number') {
            opts.onProgress(st.progress)
            return
          }
          // 未开始转码（host 全局互斥 busy 拒绝等）：回调让调用方重试触发
          if (st && st.ok && opts && opts.onStalled && !st.cached && !st.processing && (st.progress === null || st.progress === undefined)) {
            opts.onStalled()
          }
        }).catch(() => {})
      }, 1500)
    }
    const stopTranscodePoll = () => {
      if (transPollTimer) { try { transPollTimer() } catch (e) { /* ignore */ } transPollTimer = null }
      transPollTarget = null
    }
    // 背景图源：image→原图；scene→预览图（仅引擎捕获失败时的回退背景）；web→预览图（正常走 iframe）；video→走 <video> 真视频
    const bgUrlOf = (item) => {
      if (!item) return null
      if (item.type === 'image') return item.mediaUrl || item.previewUrl
      return item.previewUrl
    }
    // 注入令牌：防并发注入竞态错位（async 中途 await 时若用户又点了别的壁纸，
    // 旧流程会在 await 后继续执行 setBg/insert，覆盖新选择 → 点 A 实际注入 B）
    let injectSeq = 0
    // 首次注入仍清理可能由旧插件实例遗留的场景窗口；之后仅在确有场景窗口时走原生清理。
    let sceneCleanupNeeded = true
    let sceneCleanupPromise = null
    const cleanupScene = (windowName) => {
      if (!sceneCleanupPromise) {
        sceneCleanupPromise = (async () => {
          await call({ action: 'native-detach' }).catch(() => null)
          const closed = await call(windowName ? { action: 'close', window: windowName } : { action: 'close' }).catch(() => null)
          const closedOk = !!(closed && closed.ok !== false)
          sceneCleanupNeeded = !closedOk
          if (closedOk) { nativeSceneWindow = null; nativeSceneAttached = false }
          else if (windowName) nativeSceneWindow = windowName
          return closedOk
        })().finally(() => { sceneCleanupPromise = null })
      }
      return sceneCleanupPromise
    }
    const injectBg = async (item, region, scale) => {
      if (!item || item.missing) return
      cancelSceneFxMode()
      const seq = ++injectSeq
      // 场景状态查询与旧场景清理并行，缩短场景切换的串行等待。
      const sceneStatus = item.type === 'scene' ? call({ action: 'transcode-status', target: item.id }).catch(() => null) : null
      // 任何新的注入先取消上一次的转码等待（进度轮询/按钮状态）
      stopTranscodePoll()
      setTransProg(null)
      const previousNativeWindow = nativeSceneWindow
      if (sceneCleanupNeeded || previousNativeWindow || bgStore.capId || sceneCleanupPromise) {
        // 场景层必须先分离再关闭；图片/视频/网页之间切换不再支付两次无效 RPC 的等待。
        disableBgCss()
        const cleaned = await cleanupScene(previousNativeWindow)
        if (!cleaned) return
        if (seq !== injectSeq) return
      }
      // 只记录 ID；启动时重新拉取最新条目，避免持久化过期的本地 URL。
      try { localStorage.setItem('wp-last-bg-id', item.id) } catch (e) { /* ignore */ }
      markCarouselItem(item)
      const r = BG_REGION[region] || BG_REGION.full
      const s = scale || 1
      bgStore.region = region || 'full'
      bgStore.scale = s
      // 视频壁纸：body 底部负 z-index <video> 播放真实 mp4（内容之下、静音循环 cover）
      if (item.type === 'video' && item.mediaUrl) {
        bgStore.videoUrl = item.mediaUrl
        bgStore.webUrl = null
        bgStore.capId = null
        bgStore.staticUrl = null
        bgStore.fit = null
        removeWebBg()
        removeStaticBg()
        stopCapBg()
        setBg(true, item)
        enableBgCss(bgStore.opacity) // 只注入表面半透明变量
        insertVideoBg(item.mediaUrl)
        return
      }
      // web 壁纸：body 底部负 z-index <iframe> 渲染原网页（原画质）
      if (item.type === 'web' && item.webUrl) {
        bgStore.videoUrl = null
        bgStore.webUrl = item.webUrl
        bgStore.capId = null
        bgStore.staticUrl = null
        bgStore.fit = null
        removeVideoBg()
        removeStaticBg()
        stopCapBg()
        setBg(true, item)
        enableBgCss(bgStore.opacity)
        insertWebBg(item.webUrl)
        return
      }
      // 场景壁纸：静音且有缓存时秒切缓存；其余优先使用实时原生层，桥接不可用时再走自动转码/捕获。
      if (item.type === 'scene') {
        bgStore.videoUrl = null
        bgStore.webUrl = null
        bgStore.capId = item.id
        bgStore.staticUrl = null
        bgStore.fit = null
        removeVideoBg()
        removeWebBg()
        removeStaticBg()
        stopCapBg()
        const st = await sceneStatus
        // 期间已有新的注入请求 → 放弃本次（防止旧流程覆盖新选择导致注入错位）
        if (seq !== injectSeq) return
        // 音频响应/时间显示壁纸禁止自动转码，避免丢失音乐律动或把时间定格。
        const noTranscode = !!(st && (st.audioResponsive || st.timeDisplay))
        if (st && st.ok && st.cached && !musicStore.on) {
          bgStore.capId = null
          bgStore.videoUrl = '/wallpaper-transcode/' + item.id
          setBg(true, item)
          enableBgCss(bgStore.opacity)
          insertVideoBg(bgStore.videoUrl)
          return
        }
        // 原生场景层可用时优先直连 WE：浏览器只保留透明 UI，WE 在 DSH 窗口内实时渲染。
        // 桥接不可用时不改变既有缓存转码/捕获回退链路。
        const nativeDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1
        const nativeW = Math.min(Math.max(Math.round((typeof window !== 'undefined' ? window.innerWidth : 1920) * nativeDpr), 1280), 2560)
        const nativeH = Math.min(Math.max(Math.round((typeof window !== 'undefined' ? window.innerHeight : 1080) * nativeDpr), 720), 1600)
        const sceneWindowName = 'dsh-we-scene-' + seq
        const nativeWindow = await call({ action: 'apply', target: item.id, window: sceneWindowName, width: nativeW, height: nativeH, x: -nativeW - 300, y: 0, noActivate: true, restoreDesktop: true }).catch(() => null)
        if (seq !== injectSeq) {
          if (nativeWindow && nativeWindow.window) await call({ action: 'close', window: nativeWindow.window }).catch(() => null)
          return
        }
        if (nativeWindow && nativeWindow.ok && nativeWindow.window) {
          if (sceneNeedsRasterFx()) {
            nativeSceneWindow = nativeWindow.window
            nativeSceneAttached = false
            sceneCleanupNeeded = true
            setBg(true, item)
            enableBgCss(bgStore.opacity)
            insertCapBg(item.id, nativeWindow.window)
            syncDshBgMusic()
            return
          }
          const attached = await call({ action: 'native-attach', window: nativeWindow.window }).catch(() => null)
          if (seq !== injectSeq) {
            // 只关闭本次已失效的窗口；全局 detach 可能误拆已经开始挂载的新场景。
            const staleClosed = await call({ action: 'close', window: nativeWindow.window }).catch(() => null)
            if (!staleClosed || staleClosed.ok === false) {
              nativeSceneWindow = nativeWindow.window
              nativeSceneAttached = !!(attached && attached.ok)
              sceneCleanupNeeded = true
            }
            return
          }
          if (attached && attached.ok) {
            bgStore.capId = null
            nativeSceneWindow = nativeWindow.window
            nativeSceneAttached = true
            sceneCleanupNeeded = true
            setBg(true, item)
            enableBgCss(bgStore.opacity)
            applyFxNow()
            syncDshBgMusic()
            syncNativeSceneFx()
            return
          }
          sceneCleanupNeeded = true
          await cleanupScene(nativeWindow.window)
        }
        if (seq !== injectSeq) return
        // 转码视频按 DSH 主界面物理尺寸定制（注入 cover 不裁切；下限 1280x720、上限屏幕物理）
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1
        const vw = Math.round((typeof window !== 'undefined' ? window.innerWidth : 1920) * dpr)
        const vh = Math.round((typeof window !== 'undefined' ? window.innerHeight : 1080) * dpr)
        const tw = Math.min(Math.max(vw, 1280), 2560)
        const th = Math.min(Math.max(vh, 720), 1600)
        if (!noTranscode && !musicStore.on) {
          // 可转码：先转码（注入按钮实时显示进度），转码完成后再注入视频
          // 先标记背景状态为「注入中」，使取消背景按钮可用（转码期间可中途取消注入）
          setBg(true, item)
          const pct0 = st && typeof st.progress === 'number' ? st.progress : 0
          setTransProg({ id: item.id, pct: pct0 })
          // 后台触发转码（host 全局互斥；busy 时 onStalled 轮询会重试触发）
          call({ action: 'transcode', target: item.id, width: tw, height: th }).catch(() => {})
          let transRetries = 0
          startTranscodePoll(item.id, {
            onProgress: (pct) => setTransProg({ id: item.id, pct }),
            onStalled: () => {
              // host 已有其他转码任务/转码失败时本任务未启动：轮询发现未开始时重试触发（最多 3 次）
              if (transRetries >= 3) {
                console.error('[wallpaper] 转码排队超时，请稍后重试')
                stopTranscodePoll()
                setTransProg(null)
                return
              }
              transRetries++
              call({ action: 'transcode', target: item.id, width: tw, height: th }).catch(() => {})
            },
            onDone: () => {
              if (seq !== injectSeq || musicStore.on) return // 已切换目标或开声：不得用无音轨缓存覆盖实时场景
              setTransProg(null)
              bgStore.capId = null
              bgStore.videoUrl = '/wallpaper-transcode/' + item.id
              setBg(true, item)
              enableBgCss(bgStore.opacity)
              insertVideoBg(bgStore.videoUrl)
              call({ action: 'close' }).catch(() => {})
            },
          })
          return
        }
        // 实时捕获兜底（音频响应/时间显示不自动转码，普通场景仅在原生层不可用时到达这里）。
        // 引擎窗口放屏幕外（x = -宽-300，不可见）——PrintWindow 照常捕获原画质；
        // noActivate 不抢前台；restoreDesktop：openWallpaper 会顺带改桌面壁纸，注入后自动恢复/清空桌面
        setBg(true, item)
        enableBgCss(bgStore.opacity)
        insertCapBg(item.id, sceneWindowName)
        call({ action: 'apply', target: item.id, window: sceneWindowName, width: tw, height: th, x: -tw - 300, y: 0, noActivate: true, restoreDesktop: true })
          .then((r) => {
            if (seq !== injectSeq && r && r.window) { call({ action: 'close', window: r.window }).catch(() => {}); return }
            if (r && r.ok && r.window) {
              nativeSceneWindow = r.window
              nativeSceneAttached = false
              sceneCleanupNeeded = true
              syncDshBgMusic()
            }
            if (r && !r.ok) console.error('[wallpaper] apply 注入失败:', r.error)
          })
          .catch((e) => console.error('[wallpaper] apply 注入异常:', e && e.message ? e.message : String(e)))
        // 兼容已有后台转码任务；仅静音时允许完成后升级为无音轨缓存。
        if (st && st.processing && !musicStore.on) startTranscodePoll(item.id)
        return
      }
      bgStore.videoUrl = null
      bgStore.webUrl = null
      bgStore.capId = null
      bgStore.staticUrl = null
      removeVideoBg()
      removeWebBg()
      removeStaticBg()
      stopCapBg()
      const url = bgUrlOf(item)
      let fit = null
      // 全屏 + 原始比例 → 始终 cover 填满整个界面（兼容所有尺寸/比例，小图也全屏；清晰度次之）
      if (r.smart && s === 1) {
        fit = 'cover'
      }
      bgStore.fit = fit
      setBg(true, item)
      enableBgCss(bgStore.opacity)
      insertStaticBg(url)
    }
    const clearBg = async () => {
      cancelSceneFxMode()
      ++injectSeq
      const previousNativeWindow = nativeSceneWindow
      bgStore.videoUrl = null
      bgStore.webUrl = null
      bgStore.capId = null
      bgStore.staticUrl = null
      removeVideoBg()
      removeWebBg()
      removeStaticBg()
      stopCapBg()
      if (fxTintEl) { try { fxTintEl.parentNode.removeChild(fxTintEl) } catch (e) { /* ignore */ } fxTintEl = null }
      if (fxAtmosphereEl) { try { fxAtmosphereEl.parentNode.removeChild(fxAtmosphereEl) } catch (e) { /* ignore */ } fxAtmosphereEl = null }
      stopTranscodePoll()
      setTransProg(null)
      setBg(false, null)
      disableBgCss()
      try { localStorage.removeItem('wp-last-bg-id'); localStorage.removeItem('wp-last-bg') } catch (e) { /* ignore */ }
      sceneCleanupNeeded = true
      await cleanupScene(previousNativeWindow)
    }
    const carouselCandidates = (items) => (Array.isArray(items) ? items : []).filter((item) =>
      item && !item.missing &&
      carouselStore.selectedIds.includes(item.id))
    const rotateCarousel = async () => {
      if (carouselBusy || !carouselStore.on || !bootStore.enabled) return
      carouselBusy = true
      try {
        const result = await call({ action: 'list' })
        const items = result && result.ok ? carouselCandidates(result.items) : []
        if (!items.length) return
        const currentId = (bgStore.item && bgStore.item.id) || carouselStore.lastId
        const currentIndex = items.findIndex((item) => item.id === currentId)
        let nextIndex
        if (carouselStore.mode === 'random') {
          nextIndex = Math.floor(Math.random() * items.length)
          if (items.length > 1 && nextIndex === currentIndex) nextIndex = (nextIndex + 1) % items.length
        } else nextIndex = (currentIndex + 1 + items.length) % items.length
        await injectBg(items[nextIndex], bgStore.region || 'full', bgStore.scale || 1)
      } catch (e) { /* 保留当前背景，等待下一个周期 */ } finally { carouselBusy = false }
    }
    function stopCarousel () {
      if (carouselTimer) { try { carouselTimer() } catch (e) { /* ignore */ } carouselTimer = null }
    }
    function scheduleCarousel () {
      stopCarousel()
      if (!carouselStore.on || !bootStore.enabled) return
      carouselTimer = timer.interval(rotateCarousel, carouselStore.interval * 60 * 1000)
    }
    const TYPE_LABEL = { scene: '场景', video: '视频', web: '网页', image: '图片', application: '应用', other: '其他' }
    const filterSupportNote = (state) => {
      if (isFilterAvailable(state)) return '滤镜仅作用于当前图片或视频背景；面板与设置页同步。'
      if (!state || !state.on || !state.item) return '滤镜仅支持图片和视频；请先注入对应类型的背景。'
      return '当前为' + (TYPE_LABEL[state.item.type] || '其他') + '背景，滤镜已禁用；参数会保留，切回图片或视频后自动恢复。'
    }
    const EffectScopeGuide = ({ bg }) => h('div', { className: 'wp-effect-scope', role: 'note', 'aria-label': '效果使用范围与条件' },
      [
        ['基础画面', '图片 · 视频 · 网页 · 场景 · 应用'],
        ['滤镜与光照', '仅图片 · 视频'],
        ['播放速度', '仅视频背景'],
        ['界面材质', '独立于壁纸类型'],
      ].map(([title, scope]) => h('div', { key: title, className: 'wp-effect-scope-item' }, h('strong', {}, title), h('span', {}, scope))),
      h('p', { className: 'wp-effect-condition' }, isFilterAvailable(bg)
        ? '当前类型可用全部图片/视频滤镜；视频才可调整播放速度。'
        : filterSupportNote(bg) + ' 场景使用基础画面参数时会切换捕获渲染，滤镜不会触发场景重注入。'))
    // 面板收起会卸载组件；会话缓存避免每次拉绳展开都重新扫描订阅目录。
    const panelSession = { items: null, cfg: null, folderTags: null, scanned: false }

    const Panel = () => {
      const [items, setItems] = React.useState(panelSession.items)
      const [query, setQuery] = React.useState('')
      const [type, setType] = React.useState('')
      const [tag, setTag] = React.useState('')
      const [sceneCompat, setSceneCompat] = React.useState('') // 场景子分类：'' 全部 | 'audio' 音频响应 | 'time' 时间显示 | 'ok' 可转码
      const [selected, setSelected] = React.useState(null)
      const [wstate, setWstate] = React.useState(null)
      const [transStatus, setTransStatus] = React.useState(null)
      const [cfg, setCfg] = React.useState(panelSession.cfg)
      const [showLibrary, setShowLibrary] = React.useState(false)
      const [activeTool, setActiveTool] = React.useState('') // '' | 'effects' | 'settings'
      const [showHelp, setShowHelp] = React.useState(false)
      const [cacheDirInput, setCacheDirInput] = React.useState('') // 缓存目录输入框
      const [folderTags, setFolderTags] = React.useState(panelSession.folderTags) // 已订阅文件夹标签（启动时刷新）
      const [theme, setTheme] = React.useState(() => { try { return localStorage.getItem('wp-theme') || 'dark' } catch (e) { return 'dark' } })
      const [panelOpacity, setPanelOpacity] = React.useState(() => { try { return Number(localStorage.getItem('wp-panel-opacity') || 100) } catch (e) { return 100 } })
      const [winSize, setWinSize] = React.useState(null) // 用户拖拽调整后的尺寸 {w,h}
      const bg = useBg() // 订阅背景状态（调整滑块）
      const musicOn = useBgMusic()
      const boot = useBoot() // 订阅启动设置（绝对模式开关）
      const transProg = useTransProg() // 订阅转码进度（注入按钮实时显示；仅需要转码的非视频输入源）
      const [busy, setBusy] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [pos, setPos] = React.useState(null)
      const [viewport, setViewport] = React.useState(() => ({ w: typeof window !== 'undefined' ? window.innerWidth : 1920, h: typeof window !== 'undefined' ? window.innerHeight : 1080 }))
      const fx = useFx() // 背景效果状态（与设置页双向同步，面板侧也可实时调整）
      const filterReady = isFilterAvailable(bg)
      const filterNote = filterSupportNote(bg)
      const setCustomFx = (patch) => setFx(patch)
      const reqSeqRef = React.useRef(0)
      const resizeRef = React.useRef(null)
      const dragRef = React.useRef(null)
      React.useEffect(() => () => setHover(null), [])
      React.useEffect(() => {
        if (typeof window === 'undefined') return
        const onViewport = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener('resize', onViewport)
        return () => window.removeEventListener('resize', onViewport)
      }, [])
      React.useEffect(() => {
        if (!showLibrary || typeof document === 'undefined') return
        const onKey = (e) => { if (e.key === 'Escape') { setShowLibrary(false); setHover(null) } }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [showLibrary])

      const onHeadDown = (e) => {
        // 点按钮（✕/刷新等）不启动拖动，避免 setPointerCapture 吞掉点击
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('.wp-btn, .wp-search, input, select')) return
        let rect = null
        try { rect = e.currentTarget.closest('.wp-root').getBoundingClientRect() } catch (err) { /* ignore */ }
        dragRef.current = { dx: e.clientX - (rect ? rect.left : 0), dy: e.clientY - (rect ? rect.top : 0), sx: e.clientX, sy: e.clientY, moved: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
      const onHeadMove = (e) => {
        if (!dragRef.current) return
        if (Math.abs(e.clientX - dragRef.current.sx) + Math.abs(e.clientY - dragRef.current.sy) > 4) dragRef.current.moved = true
        if (dragRef.current.moved) {
          // 边界钳制：面板至少保留一部分在可视区内，防止拖出屏幕导致"显示缺失"
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
          const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
          const nx = Math.min(Math.max(e.clientX - dragRef.current.dx, 8), Math.max(8, vw - 60))
          const ny = Math.min(Math.max(e.clientY - dragRef.current.dy, 40), Math.max(40, vh - 50))
          setPos({ x: nx, y: ny })
        }
      }
      const onHeadUp = (e) => {
        if (!dragRef.current) return
        dragRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }

      // 面板尺寸拖拽调整（8 方向：四边/四角手柄，支持放大缩小与拉伸）
      const onResizeDown = (dir) => (e) => {
        const root = e.currentTarget.closest('.wp-root')
        const rect = root ? root.getBoundingClientRect() : { left: 0, top: 0, width: 400, height: 600 }
        resizeRef.current = { dir, sx: e.clientX, sy: e.clientY, rect: { left: rect.left, top: rect.top, w: rect.width, h: rect.height }, moved: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
      const onResizeMove = (e) => {
        if (!resizeRef.current) return
        const d = resizeRef.current
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true
        if (!d.moved) return
        const dx = e.clientX - d.sx
        const dy = e.clientY - d.sy
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
        const MINW = 300, MINH = 340
        let left = d.rect.left, top = d.rect.top, w = d.rect.w, h = d.rect.h
        if (d.dir.indexOf('e') >= 0) w = Math.min(Math.max(d.rect.w + dx, MINW), Math.max(MINW, vw - left - 20))
        if (d.dir.indexOf('s') >= 0) h = Math.min(Math.max(d.rect.h + dy, MINH), Math.max(MINH, vh - top - 20))
        if (d.dir.indexOf('w') >= 0) {
          const nw = Math.min(Math.max(d.rect.w - dx, MINW), d.rect.left + d.rect.w - 20)
          left = d.rect.left + (d.rect.w - nw); w = nw
        }
        if (d.dir.indexOf('n') >= 0) {
          const nh = Math.min(Math.max(d.rect.h - dy, MINH), d.rect.top + d.rect.h - 20)
          top = d.rect.top + (d.rect.h - nh); h = nh
        }
        setWinSize({ w, h })
        setPos({ x: Math.round(left), y: Math.round(top) })
      }
      const onResizeUp = (e) => {
        if (!resizeRef.current) return
        resizeRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }

      const toggleTheme = () => {
        const t = theme === 'dark' ? 'light' : 'dark'
        setTheme(t)
        try { localStorage.setItem('wp-theme', t) } catch (e) { /* ignore */ }
      }
      const setPanelOpacityV = (v) => {
        setPanelOpacity(v)
        try { localStorage.setItem('wp-panel-opacity', String(v)) } catch (e) { /* ignore */ }
      }

      const refreshState = () => {
        call({ action: 'state' }).then((r) => { if (r && r.ok) setWstate(r) }).catch(() => {})
      }

      // 全量加载一次（打开面板/点刷新），搜索与类型/标签筛选在本地进行，不再请求 Host
      const load = () => {
        const seq = ++reqSeqRef.current
        setBusy(true); setErr('')
        call({ action: 'list' }).then((r) => {
          if (seq !== reqSeqRef.current) return
          if (r && r.ok) { panelSession.items = r.items; setItems(r.items) }
          else setErr((r && r.error) || '加载失败')
        }).catch((e) => { if (seq === reqSeqRef.current) setErr((e && e.message) ? e.message : String(e)) })
          .then(() => { if (seq === reqSeqRef.current) setBusy(false) })
      }

      // 启动刷新（每会话一次）：轻量重扫订阅清单（反映新建/删除的订阅文件夹与壁纸）+ 实时读文件夹标签
      React.useEffect(() => {
        if (!panelSession.items) load()
        refreshState()
        if (!panelSession.cfg) call({ action: 'config-get' }).then((r) => { if (r && r.ok) { panelSession.cfg = r; setCfg(r) } }).catch(() => {})
        if (!panelSession.folderTags) call({ action: 'tags' }).then((r) => { if (r && r.ok) { panelSession.folderTags = r.folders || []; setFolderTags(panelSession.folderTags) } }).catch(() => {})
        if (!panelSession.scanned) {
          panelSession.scanned = true
          call({ action: 'scan' }).then((r) => {
            if (r && r.ok && Array.isArray(r.items)) { panelSession.items = r.items; setItems(r.items) }
            else panelSession.scanned = false
          }).catch(() => { panelSession.scanned = false })
        }
      }, [])

      const select = (item) => {
        setSelected(item)
        if (item && item.type === 'scene') {
          call({ action: 'transcode-status', target: item.id }).then((r) => setTransStatus(r)).catch(() => setTransStatus(null))
        } else {
          setTransStatus(null)
        }
      }
      const toggleSync = () => {
        if (!cfg || !cfg.config) return
        const next = !cfg.config.sync
        call({ action: 'config-set', json: JSON.stringify({ sync: next }) }).then((r) => { if (r && r.ok) { panelSession.cfg = r; setCfg(r) } }).catch(() => {})
      }
      // 保存转码缓存目录（config-set cacheDir）
      const saveCacheDir = () => {
        const v = (cacheDirInput || '').trim()
        call({ action: 'config-set', json: JSON.stringify({ cacheDir: v }) }).then((r) => { if (r && r.ok) { panelSession.cfg = r; setCfg(r) } }).catch(() => {})
      }

      const currentTitle = wstate && Array.isArray(wstate.windows) && wstate.windows.length ? wstate.windows[0].title : null
      // 只显示已订阅（workshop）壁纸
      const itemsArr = Array.isArray(items) ? items.filter((it) => it.source === 'workshop') : []
      // 标签 = WE 已订阅文件夹（启动时实时刷新，folderTags 优先保序）+ 清单中其余标签兜底
      const itemsTags = [...new Set(itemsArr.flatMap((it) => it.tags || []))]
      const tagList = folderTags ? [...new Set([...folderTags, ...itemsTags])] : itemsTags
      const filtered = itemsArr.filter((it) => {
        if (type && it.type !== type) return false
        if (type === 'scene' && sceneCompat) {
          if (sceneCompat === 'ok') { if (it.compat) return false }
          else if (it.compat !== sceneCompat) return false
        }
        if (tag && !(it.tags || []).includes(tag)) return false
        if (query && (it.title || '').toLowerCase().indexOf(query.toLowerCase()) < 0 && it.id.indexOf(query) < 0) return false
        return true
      })
      const freePanelLayout = viewport.w > 480
      const defaultPanelW = freePanelLayout ? 400 : Math.max(280, viewport.w - 16)
      const panelW = Math.min(freePanelLayout && winSize ? winSize.w : defaultPanelW, Math.max(280, viewport.w - 16))
      const panelX = freePanelLayout && pos ? pos.x : Math.max(8, viewport.w - panelW - (freePanelLayout ? 14 : 8))
      const panelY = freePanelLayout && pos ? pos.y : 80
      const compactLibrary = viewport.w <= 720
      const drawerW = compactLibrary ? Math.min(520, Math.max(280, viewport.w - 16)) : Math.min(520, Math.max(300, Math.round(viewport.w * .36)))
      let drawerX = compactLibrary ? panelX : panelX - drawerW - 10
      if (!compactLibrary && drawerX < 8 && panelX + panelW + drawerW + 18 <= viewport.w) drawerX = panelX + panelW + 10
      drawerX = Math.min(Math.max(8, drawerX), Math.max(8, viewport.w - drawerW - 8))
      const drawerTop = Math.round(Math.min(Math.max(8, panelY), Math.max(8, viewport.h - 300)))
      const drawerStyle = {
        '--wp-a': String((0.35 + 0.4 * panelOpacity / 100).toFixed(3)),
        left: Math.round(drawerX),
        top: drawerTop,
        width: Math.round(drawerW),
        height: Math.round(Math.max(300, viewport.h - drawerTop - 8)),
      }

      return h(React.Fragment, null,
        h('div', {
        id: 'wp-wallpaper-panel',
        className: 'wp-root wp-root-drop wp-theme-' + theme,
        role: 'region',
        'aria-labelledby': 'wp-wallpaper-title',
        style: Object.assign(
          { '--wp-a': String((0.35 + 0.4 * panelOpacity / 100).toFixed(3)) },
          freePanelLayout && winSize ? { width: winSize.w, height: winSize.h } : null,
          freePanelLayout && pos ? { left: pos.x, top: pos.y, right: 'auto' } : null),
      },
        h('div', { className: 'wp-head', onPointerDown: onHeadDown, onPointerMove: onHeadMove, onPointerUp: onHeadUp, onPointerCancel: onHeadUp, title: '拖动移动面板' },
          h('span', { id: 'wp-wallpaper-title', className: 'wp-title' }, '🎨 壁纸'),
          h('span', { className: 'wp-status', title: wstate && wstate.running ? 'Wallpaper Engine 运行中' : 'WE 未运行' },
            (wstate && wstate.running ? '● WE 运行中' : '○ WE 未运行') + (currentTitle ? ' · 当前: ' + currentTitle : '')),
          h('button', { type: 'button', className: 'wp-btn', onClick: toggleTheme, title: theme === 'dark' ? '切换到浅色主题' : '切换到深色主题', 'aria-label': theme === 'dark' ? '切换到浅色主题' : '切换到深色主题' }, theme === 'dark' ? '☀️' : '🌙'),
          h('button', { type: 'button', className: 'wp-btn', onClick: () => { load(); refreshState() }, disabled: busy, 'aria-label': '刷新壁纸列表' }, busy ? '…' : '⟳'),
          h('button', { type: 'button', className: 'wp-btn', onClick: () => setOpen(false), 'aria-label': '收起壁纸面板' }, '✕')),
        h('div', { className: 'wp-controls' },
          h('div', { className: 'wp-control-group', role: 'group', 'aria-label': '背景操作' },
            h('span', { className: 'wp-control-label' }, '背景'),
            h('div', { className: 'wp-control-buttons' },
              h('button', { type: 'button', className: 'wp-btn' + (showLibrary ? ' wp-btn-on' : ''), onClick: () => { setShowLibrary(!showLibrary); setHover(null) }, 'aria-expanded': showLibrary, 'aria-controls': 'wp-wallpaper-library', style: { fontSize: 10 } }, showLibrary ? '◀ 收起合集' : '🖼 壁纸合集'),
              h('button', {
                type: 'button',
                className: 'wp-btn wp-btn-primary',
                disabled: !selected || (transProg && selected && transProg.id === selected.id),
                title: (transProg && selected && transProg.id === selected.id)
                  ? '转码中 ' + transProg.pct + '%…完成后自动注入'
                  : (selected ? '注入当前选中壁纸为界面背景' : '先在网格中选择一张壁纸'),
                onClick: () => selected && injectBg(selected, bgStore.region || 'full', bgStore.scale || 1),
                style: { fontSize: 10 },
              }, (transProg && selected && transProg.id === selected.id) ? ('⏳ 转码 ' + transProg.pct + '%') : '🖼 注入背景'),
              h('button', { type: 'button', className: 'wp-btn', disabled: !bg.on, title: '取消当前界面背景', onClick: () => clearBg(), style: { fontSize: 10 } }, '✕ 取消'))),
          h('div', { className: 'wp-control-group', role: 'group', 'aria-label': '壁纸工具' },
            h('span', { className: 'wp-control-label' }, '工具'),
            h('div', { className: 'wp-control-buttons' },
              h('button', { type: 'button', className: 'wp-btn' + (activeTool === 'effects' ? ' wp-btn-on' : ''), onClick: () => setActiveTool(activeTool === 'effects' ? '' : 'effects'), title: '画面、滤镜与界面材质统一分类设置', 'aria-expanded': activeTool === 'effects', 'aria-controls': 'wp-effects-module', style: { fontSize: 10 } }, '🎚 画面与滤镜'),
              h('button', { type: 'button', className: 'wp-btn' + (musicOn ? ' wp-btn-on' : ''), title: MUSIC_SCOPE_NOTE, onClick: () => setBgMusic(!musicOn), 'aria-pressed': musicOn, style: { fontSize: 10 } }, musicOn ? '🔊 声音开' : '🔇 声音关'),
              h('button', { type: 'button', className: 'wp-btn' + (activeTool === 'settings' ? ' wp-btn-on' : ''), onClick: () => setActiveTool(activeTool === 'settings' ? '' : 'settings'), title: '缓存、同步和使用说明', 'aria-expanded': activeTool === 'settings', 'aria-controls': 'wp-settings-module', style: { fontSize: 10 } }, '⚙ 设置')),
            h('span', { className: 'wp-control-note' }, filterReady ? '基础画面支持全部类型；滤镜仅图片和视频，播放速度仅视频。' : filterNote)),
          h('span', { className: 'wp-sect-title', title: '背景参数摘要' },
            bg && bg.on
              ? ('透明 ' + Math.round((bg.opacity != null ? bg.opacity : 0.15) * 100) + '% · 对比 ' + (bg.contrast != null ? bg.contrast : 100) + '% · 饱和 ' + (bg.saturate != null ? bg.saturate : 100) + '% · 亮 ' + (bg.brightness != null ? bg.brightness : 100) + '% · 糊 ' + (bg.blur || 0) + 'px')
              : '') ),
        activeTool === 'settings' ? h('div', { id: 'wp-settings-module', className: 'wp-module-body', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          // 转码缓存目录：显示 + 可改
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--wp-mut, #9aa)' } },
            h('span', { style: { flex: 'none' } }, '缓存目录'),
            h('input', { className: 'wp-search', style: { flex: 1, minWidth: 0, fontSize: 10, padding: '2px 6px' }, placeholder: (cfg && cfg.cacheDir) || '默认 cache/transcode', value: cacheDirInput, onChange: (e) => setCacheDirInput(e.target.value) }),
            h('button', { className: 'wp-btn', onClick: saveCacheDir, style: { fontSize: 10, flex: 'none' } }, '保存')),
          // 网盘同步开关
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--wp-mut, #9aa)' } },
            h('span', { style: { flex: 1 } }, '网盘同步（缓存写入 syncDir，需在 we.config.json 配置 syncDir）'),
            h('button', { className: 'wp-btn' + (cfg && cfg.config && cfg.config.sync ? ' wp-btn-on' : ''), onClick: toggleSync, style: { fontSize: 10, flex: 'none' } },
              cfg && cfg.config && cfg.config.sync ? '开' : '关')),
          // 使用说明
          h('button', { className: 'wp-btn', onClick: () => setShowHelp(!showHelp), style: { fontSize: 10, alignSelf: 'flex-start' } }, (showHelp ? '▴ v' : '▾ v') + PLUGIN_VERSION + ' 使用说明'),
          showHelp ? h('div', { style: { fontSize: 10, color: 'var(--wp-mut, #9aa)', lineHeight: '16px' } },
            h('b', {}, 'v' + PLUGIN_VERSION + ' 使用说明与注意事项'),
            h('div', {}, '• 画面与滤镜已合并为一个模块，按基础画面、滤镜与光照、界面材质分类收纳；相同效果只保留一套控件'),
            h('div', {}, '• 滤镜与三路光照仅支持图片和视频；场景、网页、应用及其他类型会自动禁用，参数保留并在切回支持类型后恢复'),
            h('div', {}, '• 场景壁纸优先实时渲染；静音且已有缓存时秒切播放，原生桥接不可用时才自动后台转码'),
            h('div', {}, '• ⚡ 音频响应 / 🕐 时间显示壁纸固定使用实时渲染，保留音乐律动和实时时间'),
            h('div', {}, '• 声音开关覆盖 DSH 当前视频、网页和场景壁纸；转码缓存无音轨时，开声会自动切回实时场景'),
            h('div', {}, '• 注入场景时桌面壁纸会被自动清空/恢复（openWallpaper 会把壁纸应用到桌面，插件自动处理，桌面不残留壁纸画面）'),
            h('div', {}, '• 转码依赖 ffmpeg（可用 FFMPEG 环境变量指定）；未安装时场景壁纸降级为实时捕获'),
            h('div', {}, '• 转码缓存目录可在此修改（或 we.config.json 的 cacheDir/syncDir）；取消订阅的壁纸缓存自动清理'),
            h('div', {}, '• 引擎窗口藏在屏幕外不可见，桌面/界面零干扰；面板可拖动移动、拖边框/四角调整大小'),
            h('div', {}, '• 基础画面：透明度/亮度/对比度/饱和度/模糊；场景修改非中性参数时使用捕获渲染，恢复默认后返回原生直出'),
            h('div', {}, '• 一键更新只更新本插件，不替换 DSH 主程序；下载轻量 Release 后会先校验 SHA-256，再运行安装器'))
          : null)
          : null,
        activeTool === 'effects' ? h('div', { id: 'wp-effects-module', className: 'wp-module-body wp-module-effects', role: 'region', 'aria-label': '画面与滤镜' },
          h(EffectScopeGuide, { bg }),
          h('details', { className: 'wp-effect-section', open: true },
            h('summary', {}, h('span', {}, '基础画面'), h('small', {}, '全部背景类型')),
            h('div', { className: 'wp-effect-section-body' }, h(BasePictureControls, { bg, compact: true }))),
          h('details', { className: 'wp-effect-section', open: filterReady },
            h('summary', {}, h('span', {}, '滤镜、光照与动态'), h('small', {}, filterReady ? '当前可用' : '仅图片 / 视频')),
            h('div', { className: 'wp-effect-section-body' }, h(FilterControls, { fx, bg, compact: true, disabled: !filterReady, disabledReason: filterNote }))),
          h('details', { className: 'wp-effect-section' },
            h('summary', {}, h('span', {}, '界面材质'), h('small', {}, '不受壁纸类型限制')),
            h('div', { className: 'wp-effect-section-body' },
              h('div', { className: 'wp-slider-row' },
                h('span', {}, '面板'),
                h('input', { type: 'range', min: 0, max: 100, value: panelOpacity, onChange: (e) => setPanelOpacityV(Number(e.target.value)) }),
                h('b', {}, panelOpacity + '%')),
              h('div', { className: 'wp-fx-row' },
                h('span', { className: 'wp-fx-label' }, '材质'),
                h('div', { className: 'wp-fx-material-grid' }, BG_MATERIALS.map((material) =>
                  h('button', { key: material.id, className: 'wp-material' + (fx.material === material.id ? ' wp-material-on' : ''), onClick: () => setFx({ material: material.id, uiGlass: material.uiGlass }) },
                    h('b', {}, material.name), h('small', {}, material.hint))))),
              h('div', { className: 'wp-slider-row' },
                h('span', {}, '材质强度'),
                h('input', { type: 'range', min: 0, max: 100, value: fx.uiGlass, onChange: (e) => setFx({ uiGlass: Number(e.target.value) }) }),
                h('b', {}, fx.uiGlass + '%')),
              h('div', { className: 'wp-fx-row' },
                h('span', { className: 'wp-fx-label' }, '共享主色'),
                h('div', { className: 'wp-tone-swatches' }, ['#4c9aff', '#b8d5ff', '#a78bfa', '#e879a9', '#f59e0b', '#34d399', '#22d3ee', '#18243a'].map((color) =>
                  h('button', { key: color, className: 'wp-tone-swatch' + (fx.color.toLowerCase() === color ? ' wp-tone-swatch-on' : ''), title: color, style: { background: color }, onClick: () => setCustomFx({ color }) }))),
                h('input', { className: 'wp-tone-color', type: 'color', value: fx.color, title: '滤镜色罩与界面染色共用主色', onChange: (e) => setCustomFx({ color: e.target.value }) })),
              h('div', { className: 'wp-fx-row' },
                h('span', { className: 'wp-fx-label' }, '界面'),
                h('button', { className: 'wp-btn' + (fx.uiTint ? ' wp-btn-on' : ''), title: '界面染色独立于壁纸效果', onClick: () => setFx({ uiTint: !fx.uiTint }), style: { fontSize: 10 } }, fx.uiTint ? '染色开' : '染色关'),
                h('button', { className: 'wp-btn' + (fx.uiTintAll ? ' wp-btn-on' : ''), title: '切换界面染色影响范围', onClick: () => setFx({ uiTintAll: !fx.uiTintAll }), style: { fontSize: 10 } }, fx.uiTintAll ? '全界面' : '四个模块')),
              h('div', { className: 'wp-slider-row' },
                h('span', {}, '界面强度'),
                h('input', { type: 'range', min: 0, max: 100, value: fx.uiTintStrength, onChange: (e) => setFx({ uiTintStrength: Number(e.target.value) }) }),
                h('b', {}, fx.uiTintStrength + '%')))))
          : null,
        selected ? h('div', { className: 'wp-detail' },
          h('div', { className: 'wp-detail-name', title: selected.id }, selected.title),
          selected.type === 'scene' ? h('div', { style: { fontSize: 10, color: 'var(--wp-mut, #9aa)', marginBottom: 6, lineHeight: '15px' } },
            transStatus && transStatus.audioResponsive ? '⚡ 音频响应壁纸 · 实时渲染（转码会丢失音乐律动）'
              : (transStatus && transStatus.timeDisplay ? '🕐 时间显示壁纸 · 实时渲染（转码会定格时间）'
                : (transStatus && transStatus.ok && transStatus.cached ? (musicOn ? '转码缓存已就绪 · 声音开启时使用实时渲染' : '转码缓存 ✓ 已就绪（秒切播放）')
                  : (transStatus && transStatus.processing ? '⏳ 转码中…' + (typeof transStatus.progress === 'number' ? ' ' + transStatus.progress + '%' : '') + '，完成后自动切换'
                    : '未缓存 · 点击注入后优先实时渲染，桥接不可用时自动转码')))) : null,
          ) : null,
        // 8 方向拖拽手柄（边框/四角放大缩小拉伸）
        ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => h('div', { key: dir, className: 'wp-rz wp-rz-' + dir + (dir === 'se' ? ' wp-resize' : ''), onPointerDown: onResizeDown(dir), onPointerMove: onResizeMove, onPointerUp: onResizeUp, onPointerCancel: onResizeUp, title: dir === 'n' || dir === 's' ? '拖动调整高度' : (dir === 'e' || dir === 'w' ? '拖动调整宽度' : '拖动调整大小') }))),
        showLibrary ? h('aside', {
          id: 'wp-wallpaper-library',
          className: 'wp-library-drawer wp-theme-' + theme + (compactLibrary ? ' wp-library-compact' : ''),
          style: drawerStyle,
          role: 'region',
          'aria-labelledby': 'wp-wallpaper-library-title',
        },
          h('div', { className: 'wp-library-head' },
            h('span', { id: 'wp-wallpaper-library-title', className: 'wp-library-title' }, '🖼 壁纸合集'),
            h('span', { className: 'wp-library-count' }, items ? (filtered.length + ' / ' + itemsArr.length) : '加载中'),
            h('button', { type: 'button', className: 'wp-btn', onClick: () => { setShowLibrary(false); setHover(null) }, 'aria-label': '收起壁纸合集' }, '✕')),
          h('div', { className: 'wp-library-search' },
            h('input', { className: 'wp-search', 'aria-label': '搜索壁纸', placeholder: '搜索壁纸标题 / ID…', value: query, onChange: (e) => setQuery(e.target.value) })),
          h('div', { className: 'wp-library-filter' },
            h('span', { className: 'wp-library-filter-label' }, '类型'),
            h('div', { className: 'wp-chips' },
              [['', '全部'], ['scene', '场景'], ['video', '视频'], ['web', '网页'], ['image', '图片'], ['application', '应用']].map(([k, label]) =>
                h('button', { type: 'button', key: k, className: 'wp-chip' + (type === k ? ' wp-chip-on' : ''), onClick: () => { setType(k); setSceneCompat('') } }, label)))),
          type === 'scene' ? h('div', { className: 'wp-library-filter' },
            h('span', { className: 'wp-library-filter-label' }, '场景'),
            h('div', { className: 'wp-chips' },
              [['', '全部场景', ''], ['audio', '⚡ 音频响应', ' wp-chip-audio'], ['time', '🕐 时间显示', ' wp-chip-time'], ['ok', '✅ 可转码', ' wp-chip-ok']].map(([k, label, cls]) =>
                h('button', { type: 'button', key: 'sc-' + k, className: 'wp-chip' + cls + (sceneCompat === k ? ' wp-chip-on' : ''), onClick: () => setSceneCompat(k) }, label)))) : null,
          tagList.length ? h('details', { className: 'wp-library-tags' },
            h('summary', {}, '文件夹标签' + (tag ? ' · ' + tag : '')),
            h('div', { className: 'wp-chips' },
              [['', '全部']].concat(tagList.map((t) => [t, t])).map(([k, label]) =>
                h('button', { type: 'button', key: 'tag-' + k, className: 'wp-chip' + (tag === k ? ' wp-chip-on' : ''), onClick: () => setTag(k) }, label)))) : null,
          err ? h('div', { className: 'wp-err' }, err) : null,
          h('div', { className: 'wp-grid' },
            !items ? h('div', { className: 'wp-empty' }, '加载中…')
              : (filtered.length === 0 ? h('div', { className: 'wp-empty' }, '没有匹配的壁纸')
                : filtered.map((it) =>
                  h('button', { type: 'button', key: it.id, className: 'wp-card' + (selected && selected.id === it.id ? ' wp-card-on' : ''), onClick: () => select(it), 'aria-pressed': !!(selected && selected.id === it.id),
                    onMouseEnter: (e) => setHover({ item: it, x: e.clientX, y: e.clientY }),
                    onMouseMove: (e) => setHover({ item: it, x: e.clientX, y: e.clientY }),
                    onMouseLeave: () => setHover(null) },
                    it.missing ? h('div', { className: 'wp-card-miss' }, '缺失')
                      : (it.previewUrl ? h('img', { className: 'wp-thumb', src: it.previewUrl, loading: 'lazy', alt: '' }) : null),
                    h('span', { className: 'wp-type' }, (it.compat === 'audio' ? '⚡ ' : it.compat === 'time' ? '🕐 ' : '') + (TYPE_LABEL[it.type] || it.type)),
                    h('span', { className: 'wp-card-name', title: it.title }, it.title)))))
        ) : null)
    }

    // 侧边栏底部入口
    const Trigger = () => {
      const open = useOpen()
      return h('button', { className: 'wp-trigger' + (open ? ' wp-trigger-on' : ''), onClick: () => setOpen(!store.open), title: '壁纸控制面板' }, '壁纸')
    }
    slots.inject('sidebar.footer.action', () => slots.register(
      { name: 'sidebar.footer.action', id: 'wallpaper.trigger', order: 120, label: '壁纸' },
      () => h(Trigger),
    ))

    // 与面板同级挂载，避开 .wp-root 的 backdrop-filter / overflow 裁剪。
    const HoverPreview = () => {
      const hp = useHover()
      if (!hp) return null
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
      const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
      return h('div', { className: 'wp-hover-preview wp-hover-preview-on',
        style: { left: (hp.x + 272 > vw ? hp.x - 272 : hp.x + 12), top: Math.max(8, Math.min(hp.y + 12, vh - 200)) } },
      hp.item.previewUrl ? h('img', { src: hp.item.previewUrl, alt: hp.item.title || '' }) : null,
      h('div', { className: 'wp-hover-preview-name' }, hp.item.title || hp.item.id),
      h('div', { className: 'wp-hover-preview-meta' }, (TYPE_LABEL[hp.item.type] || hp.item.type) + (hp.item.tags && hp.item.tags.length ? ' · ' + hp.item.tags.join(' / ') : '')))
    }
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'wallpaper.hover-preview', order: 210 },
      () => h(HoverPreview),
    ))

    // DSH 设置（设置 → 左侧导航「wallpaper接入设置」独立页）：壁纸插件启动开关 + 背景效果实时调整
    const SettingsPage = () => {
      const boot = useBoot()
      const fx = useFx() // 背景效果状态（与面板双向同步；调整即时生效可直接预览）
      const bg = useBg()
      const filterReady = isFilterAvailable(bg)
      const filterNote = filterSupportNote(bg)
      const musicOn = useBgMusic()
      const carousel = useCarousel()
      const [savedPresets, setSavedPresets] = React.useState(() => {
        try {
          const items = JSON.parse(localStorage.getItem('wp-bg-presets') || '[]')
          return Array.isArray(items) ? items.filter((item) => item && item.fx && item.bg).slice(0, 6) : []
        } catch (e) { return [] }
      })
      const savePresetList = (items) => {
        setSavedPresets(items)
        try { localStorage.setItem('wp-bg-presets', JSON.stringify(items)) } catch (e) { /* ignore */ }
      }
      const applyMaterial = (material) => setFx({ material: material.id, uiGlass: material.uiGlass })
      const customizeFx = (patch) => setFx(patch)
      const saveCurrentPreset = () => {
        if (!filterReady) return
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const item = {
          id: Date.now(), name: '方案 ' + time,
          fx: Object.assign({ color: fx.color, speed: fx.speed }, filterFxSnapshot(fx)),
          bg: { opacity: bg.opacity, brightness: bg.brightness, contrast: bg.contrast, saturate: bg.saturate, blur: bg.blur },
        }
        savePresetList([item].concat(savedPresets).slice(0, 6))
      }
      const loadPreset = (item) => {
        if (!filterReady) return
        setFx(Object.assign({ speed: 50 }, FILTER_FX_DEFAULTS, item.fx))
        setBgParams(item.bg)
      }
      const row = (label, val, onToggle, hint, disabled) => h('div', { className: 'wp-set-row' },
        h('span', {}, label),
        hint ? h('span', { className: 'wp-set-hint', style: { marginRight: 4 } }, hint) : null,
        h('button', { type: 'button', className: 'wp-btn' + (val ? ' wp-btn-on' : ''), onClick: onToggle, disabled: !!disabled, 'aria-pressed': !!val, style: { fontSize: 11, minWidth: 44 } }, val ? '开' : '关'))
      const slider = (label, val, min, max, onChange, suffix, disabled) => h('div', { className: 'wp-set-row' },
        h('span', {}, label),
        h('input', { className: 'wp-set-range', type: 'range', min, max, value: val, disabled: !!disabled, onChange: (e) => onChange(Number(e.target.value)) }),
        h('b', { className: 'wp-set-num' }, String(val) + (suffix || '')))
      const disclosure = (title, open, ...body) => h('details', { className: 'wp-set-section wp-set-disclosure', open },
        h('summary', { className: 'wp-set-section-title' }, title),
        h('div', { className: 'wp-set-section-body' }, ...body))
      // 背景合集（设置页内嵌，位于背景效果预览图正下方垂直排列）：
      // 悬停任一缩略图 → 预览图放大显示该背景效果（collSel）；移出恢复当前注入背景；点击 → 注入切换
      const [collItems, setCollItems] = React.useState(panelSession.items) // 复用悬浮窗本会话列表；null=未加载
      const [collSel, setCollSel] = React.useState(null) // 悬停/点击的合集条目；null=显示当前注入背景
      const [collType, setCollType] = React.useState('') // 合集分类：'' 全部 | scene/video/web/image/application
      const [collScene, setCollScene] = React.useState('') // 场景子分类：'' 全部 | audio | time | ok
      const [collSource, setCollSource] = React.useState('') // 合集来源：'' 全部 | workshop | local
      React.useEffect(() => {
        if (collItems) return
        call({ action: 'list' }).then((r) => { if (r && r.ok && Array.isArray(r.items)) { panelSession.items = r.items; setCollItems(r.items) } }).catch(() => {})
      }, [])
      // 分类筛选后的合集条目（分类仅在合集网格内生效，不改变注入行为）
      const collFiltered = (collItems || []).filter((it) => {
        if (collType && it.type !== collType) return false
        if (collSource && it.source !== collSource) return false
        if (collType === 'scene' && collScene) {
          if (collScene === 'ok') { if (it.compat) return false }
          else if (it.compat !== collScene) return false
        }
        return true
      })
      const collCount = collFiltered.length
      const carouselCount = carouselCandidates(collItems).length
      const toggleCarouselItem = (id) => setCarousel({ selectedIds: carousel.selectedIds.includes(id) ? carousel.selectedIds.filter((item) => item !== id) : carousel.selectedIds.concat(id) })
      const selectFiltered = () => setCarousel({ selectedIds: [...new Set(carousel.selectedIds.concat(collFiltered.filter((item) => !item.missing).map((item) => item.id)))] })
      // 背景预览卡片（仿悬浮窗：圆角+边框+阴影；实时反映注入壁纸，效果随调整即时更新）
      // 优先使用预览图；视频编码可能不受 WebView 支持，只有无预览图时才回退到原视频。
      const it = collSel || (bg && bg.on ? bg.item : null)
      const previewFilterReady = !!(filterReady && isFilterSupported(it))
      const previewAtmosphere = atmosphereStyles(previewFilterReady ? fx : null)
      const preview = h('div', { className: 'wp-fx-preview' + (collSel ? ' wp-fx-preview-zoom' : '') },
        !it ? h('div', { className: 'wp-fx-preview-empty' }, '尚未注入壁纸背景——注入后此处实时预览效果')
          : (it.previewUrl
            ? h('img', { id: 'wp-fx-preview-img', src: it.previewUrl, alt: '' })
            : (it.type === 'video' && it.mediaUrl
              ? h('video', { id: 'wp-fx-preview-img', src: it.mediaUrl, autoPlay: true, muted: true, loop: true, playsInline: true })
              : h('div', { className: 'wp-fx-preview-empty' }, '该壁纸暂无预览'))),
        previewFilterReady && fx.on && fx.strength > 0 ? h('span', { className: 'wp-fx-preview-overlay', style: { background: fx.color, opacity: Math.min(1, Math.max(0, fx.strength / 100)) } }) : null,
        previewAtmosphere.active ? h(React.Fragment, null,
          h('span', { className: 'wp-fx-preview-overlay', style: previewAtmosphere.light }),
          h('span', { className: 'wp-fx-preview-overlay', style: previewAtmosphere.vignette }),
          h('span', { className: 'wp-fx-preview-overlay', style: previewAtmosphere.grain })) : null,
        it ? h('div', { className: 'wp-fx-preview-tag' }, (collSel ? '预览: ' : '') + (it.title || it.id)) : null)
      const collArea = h('details', { className: 'wp-set-coll wp-set-disclosure' },
        h('summary', { className: 'wp-set-coll-head' },
          h('span', { className: 'wp-set-coll-title' }, '🖼 背景合集（' + collCount + '）· 悬停放大预览 · 点击注入切换')),
        h('div', { className: 'wp-set-coll-body' },
        // 分类筛选行（类型 / 场景子分类；与面板筛选一致）
        h('div', { className: 'wp-chips' },
          [['', '全部'], ['scene', '场景'], ['video', '视频'], ['web', '网页'], ['image', '图片'], ['application', '应用']].map(([k, label]) =>
            h('button', { key: 'ct-' + k, className: 'wp-chip' + (collType === k ? ' wp-chip-on' : ''), onClick: () => { setCollType(k); setCollScene('') } }, label))),
        h('div', { className: 'wp-chips' },
          [['', '全部来源'], ['workshop', '创意工坊'], ['local', '本地已有文件']].map(([k, label]) =>
            h('button', { key: 'src-' + k, className: 'wp-chip' + (collSource === k ? ' wp-chip-on' : ''), onClick: () => setCollSource(k) }, label))),
        collType === 'scene' ? h('div', { className: 'wp-chips' },
          [['', '全部场景', ''], ['audio', '⚡ 音频响应', 'wp-chip-audio'], ['time', '🕐 时间显示', 'wp-chip-time'], ['ok', '✅ 可转码', 'wp-chip-ok']].map(([k, label, cls]) =>
            h('button', { key: 'cs-' + k, className: 'wp-chip' + (cls || '') + (collScene === k ? ' wp-chip-on' : ''), onClick: () => setCollScene(k) }, label)))
          : null,
        !collItems ? h('div', { className: 'wp-coll-empty' }, '加载中…')
          : (collFiltered.length === 0 ? h('div', { className: 'wp-coll-empty' }, '该分类暂无壁纸')
            : h('div', { className: 'wp-set-coll-grid' },
              collFiltered.map((it2) =>
                h('div', { key: it2.id, className: 'wp-set-coll-card' + (bg && bg.on && bg.item && bg.item.id === it2.id ? ' wp-coll-card-on' : '') + (carousel.selectedIds.includes(it2.id) ? ' wp-coll-card-picked' : ''),
                  onClick: () => { setCollSel(it2); injectBg(it2, bgStore.region || 'full', bgStore.scale || 1) },
                  onMouseEnter: () => setCollSel(it2),
                  onMouseLeave: () => setCollSel(null),
                  title: it2.title },
                  h('button', { className: 'wp-coll-select' + (carousel.selectedIds.includes(it2.id) ? ' wp-coll-select-on' : ''), disabled: !!it2.missing, title: carousel.selectedIds.includes(it2.id) ? '从轮播清单移除' : '加入轮播清单', onClick: (e) => { e.stopPropagation(); toggleCarouselItem(it2.id) } }, carousel.selectedIds.includes(it2.id) ? '✓' : ''),
                  it2.missing ? h('div', { className: 'wp-set-coll-card-miss' }, '缺失')
                    : (it2.previewUrl ? h('img', { src: it2.previewUrl, loading: 'lazy', alt: it2.title }) : null),
                  h('div', { className: 'wp-set-coll-card-name' }, it2.title)))))))
      return h('div', { style: { padding: '4px 2px' } },
        h('div', { className: 'wp-release-note' },
          h('b', {}, 'v' + PLUGIN_VERSION),
          h('span', {}, '本次更新：画面与滤镜统一适配，并新增经 SHA-256 校验的插件一键更新。')),
        disclosure('v' + PLUGIN_VERSION + ' 使用说明与注意事项', true,
          h('ol', { className: 'wp-version-notes' },
            [
              '面板由顶部拉绳或侧栏入口展开；“画面与滤镜”按适用范围统一分类并分组收纳，壁纸合集从面板侧边展开。',
              '主面板和设置页共用同一声音状态；视频、网页和实时场景随开关同步，图片、应用预览及无音轨转码缓存不会发声。',
              '开启声音时，场景会使用实时渲染；关闭声音且已有转码缓存时优先秒切缓存，桥接不可用时仍保留自动转码与实时捕获回退。',
              '实时场景需要 Wallpaper Engine 与原生桥接；转码需要 FFmpeg。音频响应和时间类场景保持实时渲染，以保留完整效果。',
              '插件不调用 Wallpaper Engine 全局静音。视频/网页声音仅在 DSH 内控制；实时场景按窗口所属音频进程控制，若引擎复用同一进程可能联动桌面声音。',
              '正常退出 DSH 时会关闭 DSH 专用的实时场景窗口与音效，不会停止 Wallpaper Engine 的桌面壁纸。',
              '滤镜与光照仅支持图片和视频；场景、网页、应用及其他类型会自动禁用，已保存参数不会丢失，切回图片或视频后自动恢复。',
              '基础画面调整仍按原方式工作；滤镜提供 8 套方案、色温、通道、三路独立光源、暗角和颗粒，播放速度仅对视频有效。',
              '安装后可从开始菜单或稳定运行目录执行一键更新；更新器只获取官方仓库的轻量 Release，不需要 Token 或 Cookie，并在安装前校验 SHA-256。',
              '一键更新只更新壁纸插件与桥接运行文件，不替换 DSH 主程序；需要更新定制 DSH 外壳时必须使用单独审核的完整包。',
            ].map((note, index) => h('li', { key: 'note-' + index }, note)))),
        disclosure('启动与声音', true,
          row('壁纸插件（启用后侧边栏显示「壁纸」入口）', boot.enabled, () => setEnabled(!boot.enabled), ''),
          row('随 DSH 启动自动展开壁纸面板', boot.autostart, () => setAutostart(!boot.autostart), ''),
          row('启动时以上次注入的壁纸载入背景', boot.restoreBg, () => setRestoreBg(!boot.restoreBg), ''),
          row('DSH 壁纸声音', musicOn, () => setBgMusic(!musicOn), MUSIC_SCOPE_NOTE)),
        // 背景效果集中实时调整；面板「画面与滤镜」共用同一状态。
        h('div', { className: 'wp-set-group' },
          h('div', { className: 'wp-set-group-title' }, '背景效果'),
          h('div', { className: 'wp-set-group-sub' }, '画面与滤镜共用一套参数；基础画面支持全部类型，专属滤镜按背景类型自动启用'),
          preview,
          collArea,
          disclosure('画面与滤镜', false,
            h(EffectScopeGuide, { bg }),
            h('details', { className: 'wp-effect-section', open: true },
              h('summary', {}, h('span', {}, '基础画面'), h('small', {}, '全部背景类型')),
              h('div', { className: 'wp-effect-section-body' }, h(BasePictureControls, { bg, compact: false }))),
            h('details', { className: 'wp-effect-section', open: filterReady },
              h('summary', {}, h('span', {}, '滤镜、光照与动态'), h('small', {}, filterReady ? '当前可用' : '仅图片 / 视频')),
              h('div', { className: 'wp-effect-section-body' }, h(FilterControls, { fx, bg, compact: false, disabled: !filterReady, disabledReason: filterNote })))),
          disclosure('背景轮播', false,
            row('启用背景轮播', carousel.on, () => setCarousel({ on: !carousel.on }), carousel.selectedIds.length ? '仅切换已勾选壁纸' : '请先在背景合集勾选壁纸', !carousel.selectedIds.length),
            h('div', { className: 'wp-set-row' },
              h('span', {}, '切换顺序'),
              h('div', { className: 'wp-set-seg' },
                h('button', { className: carousel.mode === 'sequential' ? 'wp-seg-on' : '', onClick: () => setCarousel({ mode: 'sequential' }) }, '顺序'),
                h('button', { className: carousel.mode === 'random' ? 'wp-seg-on' : '', onClick: () => setCarousel({ mode: 'random' }) }, '随机'))),
            h('div', { className: 'wp-set-row' },
              h('span', {}, '轮播间隔'),
              h('input', { className: 'wp-set-number', type: 'number', min: 1, max: 1440, step: 1, value: carousel.interval, onChange: (e) => setCarousel({ interval: e.target.value }) }),
              h('b', { className: 'wp-set-num' }, '分钟')),
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8 } },
              h('span', { className: 'wp-set-hint' }, '已选 ' + carousel.selectedIds.length + ' 张 · 当前可用 ' + carouselCount + ' 张'),
              h('button', { className: 'wp-btn', onClick: selectFiltered, disabled: !collFiltered.some((item) => !item.missing), style: { fontSize: 10 } }, '全选当前筛选结果'),
              h('button', { className: 'wp-btn', onClick: () => setCarousel({ selectedIds: [] }), disabled: !carousel.selectedIds.length, style: { fontSize: 10 } }, '清空选择'),
              h('button', { className: 'wp-btn', onClick: rotateCarousel, disabled: !carouselCount, style: { fontSize: 10 } }, '下一张'))),
          disclosure('界面材质预设', false,
            h('div', { className: 'wp-materials' }, BG_MATERIALS.map((material) =>
              h('button', { key: material.id, className: 'wp-material' + (fx.material === material.id ? ' wp-material-on' : ''), onClick: () => applyMaterial(material) },
                h('b', {}, material.name), h('small', {}, material.hint)))),
            slider('材质强度', fx.uiGlass, 0, 100, (v) => setFx({ uiGlass: v }), '%')),
          disclosure('主色与界面', false,
            h('div', { className: 'wp-tone-picker' },
              h('span', {}, '共享主色'),
              h('div', { className: 'wp-tone-swatches' }, ['#4c9aff', '#b8d5ff', '#a78bfa', '#e879a9', '#f59e0b', '#34d399', '#22d3ee', '#18243a'].map((color) =>
                h('button', { key: color, className: 'wp-tone-swatch' + (fx.color.toLowerCase() === color ? ' wp-tone-swatch-on' : ''), title: color, style: { background: color }, onClick: () => customizeFx({ color }) }))),
              h('input', { className: 'wp-tone-color', type: 'color', value: fx.color, title: '滤镜色罩与界面染色共用主色', onChange: (e) => customizeFx({ color: e.target.value }) })),
            h('div', { className: 'wp-set-hint' }, '该颜色同时供图片/视频色罩与界面染色使用；两者的开关和强度保持独立。'),
            row('界面染色', fx.uiTint, () => setFx({ uiTint: !fx.uiTint }), '独立于壁纸效果；' + (fx.uiTintAll ? '当前影响全界面' : '当前仅影响侧栏、Cordis 面板、设置和输入框')),
            h('div', { className: 'wp-set-row' },
              h('span', {}, '界面范围'),
              h('span', { className: 'wp-set-hint', style: { marginRight: 4 } }, '全界面模式只改变表面底色，保留按钮状态色'),
              h('button', { className: 'wp-btn' + (fx.uiTintAll ? ' wp-btn-on' : ''), onClick: () => setFx({ uiTintAll: !fx.uiTintAll }), style: { fontSize: 11, minWidth: 64 } }, fx.uiTintAll ? '全界面' : '四个模块')),
            slider('界面染色强度', fx.uiTintStrength, 0, 100, (v) => setFx({ uiTintStrength: v }), '%')),
          disclosure('自定义方案', false,
            h('div', { className: 'wp-preset-actions' },
              h('span', {}, '保存当前壁纸调色，最多保留 6 个方案'),
              h('button', { className: 'wp-btn', disabled: !filterReady, title: filterNote, onClick: saveCurrentPreset, style: { fontSize: 10 } }, '保存当前方案')),
            savedPresets.length
              ? h('div', { className: 'wp-preset-list' }, savedPresets.map((item) =>
                h('div', { className: 'wp-preset-item', key: item.id },
                  h('button', { className: 'wp-preset-load', disabled: !filterReady, title: filterReady ? '载入 ' + item.name : filterNote, onClick: () => loadPreset(item) }, item.name),
                  h('button', { className: 'wp-preset-delete', title: '删除', onClick: () => savePresetList(savedPresets.filter((preset) => preset.id !== item.id)) }, '×'))))
              : h('div', { className: 'wp-set-hint' }, '还没有保存的方案'),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', paddingTop: 10 } },
              h('button', { className: 'wp-btn', onClick: () => { resetFx(); setBgParams({ opacity: .15, brightness: 100, contrast: 100, saturate: 100, blur: 0 }) }, style: { fontSize: 10 } }, '恢复全部默认')))))
    }
    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'wallpaper.settings', order: 150, label: 'wallpaper接入设置' },
      () => h(SettingsPage),
    ))

    // 顶部拉绳入口 + 下落式面板；侧栏入口继续保留。
    const Root = () => {
      const open = useOpen()
      const boot = useBoot()
      const [pullPos, setPullPos] = React.useState(() => {
        try {
          const value = JSON.parse(localStorage.getItem('wp-pull-pos') || 'null')
          return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null
        } catch (e) { return null }
      })
      const pullDragRef = React.useRef(null)
      const pullSkipClickRef = React.useRef(false)
      const onPullDown = (e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        pullDragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY, moved: false, pos: null }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
      const onPullMove = (e) => {
        const drag = pullDragRef.current
        if (!drag) return
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true
        if (!drag.moved) return
        const width = e.currentTarget.offsetWidth || 58
        const height = e.currentTarget.offsetHeight || 80
        const next = { x: Math.round(clamp(e.clientX - drag.dx, 8, Math.max(8, window.innerWidth - width - 8))), y: Math.round(clamp(e.clientY - drag.dy, 0, Math.max(0, window.innerHeight - height - 8))) }
        drag.pos = next
        setPullPos(next)
      }
      const onPullUp = (e) => {
        const drag = pullDragRef.current
        if (!drag) return
        pullDragRef.current = null
        pullSkipClickRef.current = drag.moved
        if (drag.pos) try { localStorage.setItem('wp-pull-pos', JSON.stringify(drag.pos)) } catch (err) { /* ignore */ }
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
      const onPullClick = () => {
        if (pullSkipClickRef.current) { pullSkipClickRef.current = false; return }
        setOpen(!open)
      }
      const pullStyle = pullPos ? { left: clamp(pullPos.x, 8, Math.max(8, window.innerWidth - 66)), top: clamp(pullPos.y, 0, Math.max(0, window.innerHeight - 88)), right: 'auto' } : null
      // 插件总开关：关闭时隐藏面板 + 取消背景
      if (!boot.enabled) {
        if (bgStore.on) clearBg()
        return null
      }
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'wp-pull', style: pullStyle, onPointerDown: onPullDown, onPointerMove: onPullMove, onPointerUp: onPullUp, onPointerCancel: onPullUp, onClick: onPullClick, title: open ? '拖动移动；点击收起壁纸控制面板' : '拖动移动；点击拉下展开壁纸控制面板', 'aria-label': open ? '收起壁纸控制面板' : '展开壁纸控制面板', 'aria-expanded': open, 'aria-controls': 'wp-wallpaper-panel' },
          h('span', { className: 'wp-pull-cord', 'aria-hidden': true }),
          h('span', { className: 'wp-pull-handle' }, open ? '收起' : '壁纸'),
          h('span', { className: 'wp-pull-hint' }, open ? '向上收回' : '下拉展开')),
        open ? h(Panel) : null)
    }
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'wallpaper.panel', order: 200 },
      () => h(Root),
    ))

    // 背景提示条（背景本体在 html/body background 或 body 负 z video，都不在 overlay 层）
    const BgLayer = () => {
      const bg = useBg()
      if (!bg.on || !bg.item) return null
      return h('div', { className: 'wp-bg-tip' }, '壁纸背景 · ' + (bg.item.title || bg.item.id))
    }
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'wallpaper.bg', order: 199 },
      () => h(BgLayer),
    ))

    // 所有 RPC/注入函数与插槽已完成注册后，再恢复上次背景。
    const restoreLastBackground = () => {
      if (!bootStore.enabled || !bootStore.restoreBg) return
      let id = null
      try {
        id = localStorage.getItem('wp-last-bg-id')
        if (!id) {
          const legacy = JSON.parse(localStorage.getItem('wp-last-bg') || 'null')
          id = legacy && legacy.id
        }
      } catch (e) { return }
      if (!id) return
      let tries = 0
      const restore = async () => {
        try {
          const result = await call({ action: 'list' })
          const item = result && result.ok && Array.isArray(result.items) && result.items.find((x) => x.id === id)
          if (item && !item.missing) { await injectBg(item, 'full', 1); return }
        } catch (e) { /* Host 尚未就绪，继续重试 */ }
        if (tries++ < 15) timer.timeout(restore, 1000)
      }
      timer.timeout(restore, 1500)
    }
    restoreLastBackground()
    if (carouselStore.on) scheduleCarousel()
  },
}
