import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data-dev');
fs.mkdirSync(dataDir, { recursive: true });

const processes = [];
const start = (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  processes.push(child);
  return child;
};
const stop = () => processes.forEach((child) => { if (!child.killed) child.kill(); });

const waitFor = async (url, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`开发服务未能启动：${url}`);
};

try {
console.log('百万拳桌面开发构建：2026.08.26.27');
  const sharedEnv = { ...process.env, BAIWANQUAN_APP_DATA: dataDir, BAIWANQUAN_DB: path.join(dataDir, 'baiwanquan.sqlite'), BAIWANQUAN_API_PORT: '3101' };
  start(process.execPath, ['--experimental-sqlite', 'server/app.js'], { env: { ...sharedEnv, PORT: '3101' } });
  await waitFor('http://127.0.0.1:3101/api/v1/health');
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], { env: sharedEnv });
  await waitFor('http://127.0.0.1:5173');
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  const desktopHost = path.join(path.dirname(electron), 'BQTimer.exe');
  // 使用系统合成路径；强制软件渲染会让透明悬浮窗拖动时持续重绘、闪烁。
  const app = start(desktopHost, ['--no-sandbox', 'desktop/main.js'], {
    env: { ...sharedEnv, BAIWANQUAN_DEV_MODE: '1', BAIWANQUAN_DEV_URL: 'http://127.0.0.1:5173' },
  });
  app.once('error', (error) => {
    console.error('Electron 未能启动：', error);
    stop();
    process.exit(1);
  });
  app.once('exit', (code, signal) => {
    console.error(`Electron 已退出（code=${code ?? 'null'}, signal=${signal ?? 'none'}）。`);
    stop();
    process.exit(code ?? 1);
  });
} catch (error) {
  console.error(error);
  stop();
  process.exit(1);
}
