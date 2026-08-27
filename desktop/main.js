import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } from 'electron';

// 必须在 ready 前设置：Chromium 的缓存、会话与 SQLite 都使用同一可写数据目录。
if (process.env.BAIWANQUAN_APP_DATA) app.setPath('userData', process.env.BAIWANQUAN_APP_DATA);
// 悬浮计时器依赖 Windows 的透明合成。不要在开发模式关闭 GPU 或强制软件渲染，
// 否则首次创建透明窗口时会短暂（甚至持续）显示为不透明白色矩形。

let mainWindow;
let floatWindow;
let tray;
let localServer;
let closeDatabase;
let applicationUrl;
let latestTimerState = { value: '00:00:00', running: false };
let floatCollapsed = false;
let floatBounds;
let floatDockSide = null;
let collapsedDrag = null;
let collapsedDragTimer = null;
let adjustingCollapsedBounds = false;
let floatPinned = false;
let floatDragActive = false;

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
// 必须在 ready 前设置。使用新身份让 Windows 不再复用先前 Electron 宿主的任务栏图标缓存。
const applicationId = 'com.baiwanquan.timer.logo';
app.setAppUserModelId(applicationId);
// Windows 托盘不能可靠地从 asar 内读取 ICO；安装包把图标放到 resources/assets，开发模式读源码资源。
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'assets', 'app-icon.ico')
  : path.join(desktopDirectory, '..', 'assets', 'app-icon.ico');
const applicationIcon = nativeImage.createFromPath(iconPath);
// 窗口与托盘必须复用同一份原生图像对象，避免 Windows 分别保留旧的图标缓存。
applicationIcon.setTemplateImage(false);

const sendToFloat = (channel, value) => {
  if (floatWindow && !floatWindow.isDestroyed()) floatWindow.webContents.send(channel, value);
};

const restoreFloatWindow = () => {
  if (!floatWindow || floatWindow.isDestroyed() || !floatCollapsed) return;
  floatCollapsed = false;
  floatDockSide = null;
  const fallback = { x: 120, y: 120, width: 420, height: 220 };
  floatWindow.setBounds(floatBounds ?? fallback);
  sendToFloat('float-collapsed', false);
};

const collapsedBounds = (side, area, coordinate = 0) => {
  const vertical = side === 'left' || side === 'right';
  const width = vertical ? 14 : 43;
  const height = vertical ? 43 : 14;
  if (vertical) return {
    x: side === 'left' ? area.x : area.x + area.width - width,
    y: Math.max(area.y, Math.min(area.y + area.height - height, coordinate)), width, height,
  };
  return {
    x: Math.max(area.x, Math.min(area.x + area.width - width, coordinate)),
    y: side === 'top' ? area.y : area.y + area.height - height, width, height,
  };
};

const updateFloatRestoreBounds = (side, area, coordinate) => {
  const width = 420; const height = 220;
  if (side === 'left' || side === 'right') {
    floatBounds = {
      x: side === 'left' ? area.x : area.x + area.width - width,
      y: Math.max(area.y, Math.min(area.y + area.height - height, coordinate - Math.round(height / 2))), width, height,
    };
    return;
  }
  floatBounds = {
    x: Math.max(area.x, Math.min(area.x + area.width - width, coordinate - Math.round(width / 2))),
    y: side === 'top' ? area.y : area.y + area.height - height, width, height,
  };
};

const nearestDockSide = (bounds) => {
  const area = screen.getDisplayNearestPoint({ x: bounds.x + Math.round(bounds.width / 2), y: bounds.y + Math.round(bounds.height / 2) }).workArea;
  return [
    ['left', Math.abs(bounds.x - area.x)],
    ['right', Math.abs((bounds.x + bounds.width) - (area.x + area.width))],
    ['top', Math.abs(bounds.y - area.y)],
    ['bottom', Math.abs((bounds.y + bounds.height) - (area.y + area.height))],
  ].sort((left, right) => left[1] - right[1])[0][0];
};

const setCollapsedFloatSide = (side, coordinate) => {
  if (!floatWindow || floatWindow.isDestroyed()) return;
  const current = floatWindow.getBounds();
  const area = screen.getDisplayNearestPoint({ x: current.x, y: current.y }).workArea;
  floatDockSide = side;
  if (floatCollapsed) updateFloatRestoreBounds(side, area, coordinate);
  adjustingCollapsedBounds = true;
  floatWindow.setBounds(collapsedBounds(side, area, coordinate));
  adjustingCollapsedBounds = false;
  sendToFloat('float-collapsed', { side });
};

const stopCollapsedDrag = () => {
  if (collapsedDragTimer) clearInterval(collapsedDragTimer);
  collapsedDragTimer = null;
  collapsedDrag = null;
};

const collapseFloatWindow = (side, restoreBounds = null) => {
  if (!floatWindow || floatWindow.isDestroyed() || floatCollapsed) return;
  const sourceBounds = restoreBounds ?? floatWindow.getBounds();
  const area = screen.getDisplayNearestPoint({ x: sourceBounds.x, y: sourceBounds.y }).workArea;
  // 不能把主体三分之一越界时的临时坐标带到下一次展开。
  updateFloatRestoreBounds(side, area, side === 'left' || side === 'right'
    ? sourceBounds.y + Math.round(sourceBounds.height / 2)
    : sourceBounds.x + Math.round(sourceBounds.width / 2));
  floatCollapsed = true;
  floatDockSide = side;
  floatWindow.setBounds(collapsedBounds(side, area, side === 'left' || side === 'right' ? sourceBounds.y : sourceBounds.x));
  sendToFloat('float-collapsed', { side });
};

const floatCollapseSide = (bounds) => {
  const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
  // 悬浮主体在 420×220 原生窗口中的实际位置固定为 (72, 70)，尺寸 155×60。
  // 任一边有三分之一主体越过工作区边缘后，在松开时收缩。
  const body = { left: bounds.x + 72, top: bounds.y + 70, width: 155, height: 60 };
  if (body.left <= area.x - body.width / 3) return 'left';
  if (body.left + body.width >= area.x + area.width + body.width / 3) return 'right';
  if (body.top <= area.y - body.height / 3) return 'top';
  if (body.top + body.height >= area.y + area.height + body.height / 3) return 'bottom';
  return null;
};

const createWindow = async (url) => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: '百万拳时间',
    icon: applicationIcon,
    backgroundColor: '#f7f4ed',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.BAIWANQUAN_DEV_MODE !== '1',
      preload: path.join(desktopDirectory, 'preload.cjs'),
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.setIcon(applicationIcon);
  mainWindow.on('close', (event) => {
    if (app.quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  await mainWindow.loadURL(url);
};

const createFloatWindow = async () => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.show();
    floatWindow.focus();
    return;
  }
  floatWindow = new BrowserWindow({
    width: 420,
    height: 220,
    frame: false,
    transparent: true,
    // 明确的透明底色 + renderer 就绪后再显示，避免首次打开时 Chromium 白底闪现。
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    paintWhenInitiallyHidden: true,
    hasShadow: false,
    icon: applicationIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.BAIWANQUAN_DEV_MODE !== '1',
      preload: path.join(desktopDirectory, 'preload.cjs'),
    },
  });
  floatWindow.on('moved', () => {
    if (floatCollapsed) {
      if (adjustingCollapsedBounds) return;
      const bounds = floatWindow.getBounds();
      const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
      const edges = [
        ['left', Math.abs(bounds.x - area.x), bounds.y],
        ['right', Math.abs((bounds.x + bounds.width) - (area.x + area.width)), bounds.y],
        ['top', Math.abs(bounds.y - area.y), bounds.x],
        ['bottom', Math.abs((bounds.y + bounds.height) - (area.y + area.height)), bounds.x],
      ].sort((left, right) => left[1] - right[1]);
      setCollapsedFloatSide(edges[0][0], edges[0][2]);
      return;
    }
    // 拖动时只移动窗口，mouse up 再统一判定收缩，避免 moved 回调与拖动循环互相改写尺寸。
    if (!floatDragActive) {
      const side = floatCollapseSide(floatWindow.getBounds());
      if (side) collapseFloatWindow(side);
    }
  });
  floatWindow.on('close', (event) => { event.preventDefault(); floatWindow.hide(); });
  floatWindow.on('hide', () => {
    // 窗口在拖动中被关闭、重启或系统隐藏时，不能把拖动状态带到下次打开。
    floatDragActive = false;
    stopCollapsedDrag();
  });
  floatWindow.on('blur', () => sendToFloat('float-menu-close'));
  const separator = applicationUrl.includes('?') ? '&' : '?';
  await floatWindow.loadURL(`${applicationUrl}${separator}floating=1`);
};

const startLocalService = async () => {
  const userDataDirectory = process.env.BAIWANQUAN_APP_DATA || app.getPath('userData');
  fs.mkdirSync(userDataDirectory, { recursive: true });
  process.env.BAIWANQUAN_DB = path.join(userDataDirectory, 'baiwanquan.sqlite');
  if (app.isPackaged) process.env.BAIWANQUAN_SEED_DEFAULT_PROJECT = '1';
  const backend = await import('../server/app.js');
  localServer = backend.server;
  closeDatabase = backend.closeDatabase;
  await new Promise((resolve, reject) => {
    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', resolve);
  });
  return localServer.address().port;
};

const createTray = () => {
  tray = new Tray(applicationIcon);
  tray.setToolTip('百万拳时间');
  const revealMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) void createWindow(applicationUrl);
    else { mainWindow.show(); mainWindow.focus(); }
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: revealMainWindow },
    { type: 'separator' },
    { label: '退出', click: () => { app.quitting = true; app.quit(); } },
  ]));
  tray.on('click', revealMainWindow);
};

app.whenReady().then(async () => {
  const developmentUrl = process.env.BAIWANQUAN_DEV_URL;
  const port = developmentUrl ? null : await startLocalService();
  applicationUrl = developmentUrl || `http://127.0.0.1:${port}`;
  await createWindow(applicationUrl);
  createTray();
}).catch((error) => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  console.error(message);
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'startup-error.log'), `${message}\n`); } catch { /* 日志失败不阻止退出 */ }
  app.exit(1);
});

ipcMain.on('window-control', (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== mainWindow) return;
  if (action === 'minimize') window.minimize();
  if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  if (action === 'close') window.close();
});

ipcMain.on('window-fullscreen', (event, enabled) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== mainWindow) return;
  // Kiosk 覆盖任务栏；退出时显式清理两种原生状态，防止保存/作废后留下不可缩放窗口。
  console.log(`focus fullscreen: ${enabled}`);
  if (enabled) {
    window.setKiosk(true);
    window.focus();
  } else {
    window.setKiosk(false);
    window.setFullScreen(false);
    if (window.isMinimized()) window.restore();
  }
});

ipcMain.on('float-toggle', () => {
  if (floatWindow && !floatWindow.isDestroyed() && floatWindow.isVisible()) floatWindow.hide();
  else void createFloatWindow();
});

// 透明样式由渲染层 CSS/JS 设置完成后才显示窗口，首次打开不会露出原始网页背景。
ipcMain.on('float-ready', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== floatWindow || window.isDestroyed()) return;
  window.show();
  sendToFloat('timer-state', latestTimerState);
  sendToFloat('float-pinned', floatPinned);
});

ipcMain.on('float-restore', restoreFloatWindow);

ipcMain.on('float-drag-start', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== floatWindow) return;
  const point = screen.getCursorScreenPoint();
  collapsedDrag = {
    x: point.x, y: point.y, startX: point.x, startY: point.y,
    startBounds: window.getBounds(), wasCollapsed: floatCollapsed,
    lastMovedAt: Date.now(), didMove: false,
  };
  floatDragActive = true;
  if (collapsedDragTimer) clearInterval(collapsedDragTimer);
  collapsedDragTimer = setInterval(() => {
    if (!collapsedDrag || !floatWindow || floatWindow.isDestroyed()) return stopCollapsedDrag();
    const current = screen.getCursorScreenPoint();
    const dx = current.x - collapsedDrag.x;
    const dy = current.y - collapsedDrag.y;
    if (dx || dy) {
      const totalX = current.x - collapsedDrag.startX;
      const totalY = current.y - collapsedDrag.startY;
      if (Math.abs(totalX) > 2 || Math.abs(totalY) > 2) collapsedDrag.didMove = true;
      if (floatCollapsed && collapsedDrag.didMove) {
        // 拖离收缩态后立即恢复完整主体并跟随鼠标；鼠标松开时才吸附最近的边缘。
        floatCollapsed = false;
        floatDockSide = null;
        const expanded = {
          x: Math.round(current.x - 150), y: Math.round(current.y - 100), width: 420, height: 220,
        };
        floatBounds = expanded;
        floatWindow.setBounds(expanded);
        sendToFloat('float-collapsed', false);
        collapsedDrag.startBounds = expanded;
        collapsedDrag.startX = current.x;
        collapsedDrag.startY = current.y;
      }
      if (!floatCollapsed) {
        const next = {
          x: Math.round(collapsedDrag.startBounds.x + totalX),
          y: Math.round(collapsedDrag.startBounds.y + totalY),
          width: collapsedDrag.startBounds.width,
          height: collapsedDrag.startBounds.height,
        };
        // 收缩仅在 mouseup 的最终位置判断；拖动帧只负责平滑移动。
        floatWindow.setPosition(next.x, next.y);
      }
      collapsedDrag.x = current.x;
      collapsedDrag.y = current.y;
      collapsedDrag.lastMovedAt = Date.now();
    // 允许用户先长按再开始拖动；鼠标松开会由渲染层立即结束，兜底仅防止丢失 mouseup 后永久轮询。
    } else if (Date.now() - collapsedDrag.lastMovedAt > 2_000) stopCollapsedDrag();
  }, 16);
});
ipcMain.on('float-drag-end', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== floatWindow) return;
  const drag = collapsedDrag;
  const shouldRestore = floatCollapsed && drag?.wasCollapsed && !drag.didMove;
  const collapseSide = !floatCollapsed && drag
    ? (drag.wasCollapsed && drag.didMove ? nearestDockSide(window.getBounds()) : floatCollapseSide(window.getBounds()))
    : null;
  stopCollapsedDrag();
  floatDragActive = false;
  if (collapseSide) collapseFloatWindow(collapseSide);
  else if (shouldRestore) restoreFloatWindow();
});

ipcMain.on('timer-state', (_event, state) => {
  if (!state || typeof state.value !== 'string' || typeof state.running !== 'boolean') return;
  latestTimerState = { value: state.value, running: state.running };
  sendToFloat('timer-state', latestTimerState);
});

ipcMain.on('float-action', (_event, action, payload) => {
  if (action === 'pin') {
    floatPinned = !floatPinned;
    if (floatWindow && !floatWindow.isDestroyed()) floatWindow.setAlwaysOnTop(floatPinned, floatPinned ? 'screen-saver' : 'normal');
    sendToFloat('float-pinned', floatPinned);
    return;
  }
  if (action === 'open-main') {
    if (!mainWindow || mainWindow.isDestroyed()) void createWindow(applicationUrl);
    else { mainWindow.show(); mainWindow.focus(); }
    return;
  }
  if (action === 'close-float') { floatWindow?.hide(); return; }
  if (!['toggle', 'trim-start', 'trim-apply', 'save', 'discard'].includes(action)) return;
  mainWindow?.webContents.send('float-action', { action, payload });
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => { app.quitting = true; floatWindow?.destroy(); localServer?.close(); closeDatabase?.(); });
