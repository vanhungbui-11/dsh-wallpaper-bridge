/**
 * install.js — 壁纸插件「一键安装」入口（其他设备使用）
 *
 * 用法（仓库根目录，一条命令）：
 *   node install.js
 *
 * 自动完成：安装稳定运行时 → 扫描本机订阅 → 安装独立 Cordis bootstrap → 校验。
 *
 * 推荐双击 install.cmd：它会优先使用完整套件内或 DSH 自带的 Node.js。
 */
'use strict';
require('./dsh/install-bootstrap.js');
