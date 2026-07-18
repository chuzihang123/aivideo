const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vodie', {
  load: () => ipcRenderer.invoke('project:load'),
  history: () => ipcRenderer.invoke('history:list'),
  save: (data) => ipcRenderer.invoke('project:save', data),
  generateScript: (input) => ipcRenderer.invoke('gpt:script', input),
  reviseScript: (input) => ipcRenderer.invoke('gpt:revise', input),
  generateVideo: (input) => ipcRenderer.invoke('grok:video', input),
  cancelVideo: (id) => ipcRenderer.invoke('grok:cancel', id),
  generateSpeech: (input) => ipcRenderer.invoke('gpt:speech', input),
  compose: (input) => ipcRenderer.invoke('project:compose', input),
  openPath: (path) => ipcRenderer.invoke('path:open', path),
  mediaCheck: () => ipcRenderer.invoke('media:check'),
  testProvider: (input) => ipcRenderer.invoke('provider:test', input)
});
