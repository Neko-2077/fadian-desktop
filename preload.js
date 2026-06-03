/**
 * 预加载脚本 — 在渲染进程和主进程之间搭桥
 * 暴露安全的 API 给前端调用
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fadian', {
  // 健康检查
  health: () => ipcRenderer.invoke('api:health'),

  // API Key 管理
  saveKey: (key) => ipcRenderer.invoke('api:save-key'),
  checkKey: () => ipcRenderer.invoke('api:check-key'),

  // 运行审查
  runReview: (params) => ipcRenderer.invoke('api:run-review', params),
});
