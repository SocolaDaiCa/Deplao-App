'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deplaoApp', {
  reloadPage: () => ipcRenderer.send('reload-page'),
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
});
