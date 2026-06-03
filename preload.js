/**
 * 预加载脚本 — 在渲染进程和主进程之间搭桥
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fadian', {
  health: () => ipcRenderer.invoke('api:health'),
  saveKey: (key) => {
    console.log('[preload] saveKey called with:', typeof key, key ? key.slice(0,6)+'...' : 'null');
    return ipcRenderer.invoke('api:save-key', key);
  },
  checkKey: () => {
    return ipcRenderer.invoke('api:check-key');
  },
  runReview: (params) => ipcRenderer.invoke('api:run-review', params),
});
