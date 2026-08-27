const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('baiwanquanDesktop', {
  windowControl: (action) => ipcRenderer.send('window-control', action),
  setFullscreen: (enabled) => ipcRenderer.send('window-fullscreen', Boolean(enabled)),
  toggleFloat: () => ipcRenderer.send('float-toggle'),
  floatReady: () => ipcRenderer.send('float-ready'),
  restoreFloat: () => ipcRenderer.send('float-restore'),
  beginFloatDrag: () => ipcRenderer.send('float-drag-start'),
  endFloatDrag: () => ipcRenderer.send('float-drag-end'),
  floatAction: (action, payload) => ipcRenderer.send('float-action', action, payload),
  publishTimer: (state) => ipcRenderer.send('timer-state', state),
  onFloatAction: (listener) => subscribe('float-action', listener),
  onTimerState: (listener) => subscribe('timer-state', listener),
  onFloatCollapsed: (listener) => subscribe('float-collapsed', listener),
  onFloatPinned: (listener) => subscribe('float-pinned', listener),
  onFloatMenuClose: (listener) => subscribe('float-menu-close', listener),
});
