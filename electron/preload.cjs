const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vodie', {
  load: () => ipcRenderer.invoke('project:load'),
  history: () => ipcRenderer.invoke('history:list'),
  save: (data) => ipcRenderer.invoke('project:save', data),
  generateScript: (input) => ipcRenderer.invoke('deepseek:script', input),
  reviseScript: (input) => ipcRenderer.invoke('deepseek:revise', input),
  generateVideo: (input) => ipcRenderer.invoke('grok:video', input),
  generateImage: (input) => ipcRenderer.invoke('grok:image', input),
  cancelVideo: (id) => ipcRenderer.invoke('grok:cancel', id),
  generateSpeech: (input) => ipcRenderer.invoke('deepseek:speech', input),
  compose: (input) => ipcRenderer.invoke('project:compose', input),
  openPath: (path) => ipcRenderer.invoke('path:open', path),
  mediaCheck: () => ipcRenderer.invoke('media:check'),
  testProvider: (input) => ipcRenderer.invoke('provider:test', input)
});
