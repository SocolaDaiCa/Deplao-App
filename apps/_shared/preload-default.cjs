'use strict';

const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (
    d &&
    typeof d === 'object' &&
    d.__deplao === true &&
    d.channel === 'notification-click' &&
    typeof d.profileId === 'string'
  ) {
    ipcRenderer.send('browserview-notification-click', { profileId: d.profileId });
  }
});

contextBridge.exposeInMainWorld('deplaoApp', {
  reloadPage: () => ipcRenderer.send('reload-page'),
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  reportNotificationToastClick: (profileId) =>
    ipcRenderer.send('browserview-notification-click', { profileId: String(profileId) }),
});
