import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ProfilePayload {
  id: string
  name: string
  partition: string
  platform: string
  avatar?: string | null
}

export interface SettingsPayload {
  isDarkMode: boolean
  alwaysOnTop: boolean
}

export interface ServiceOption {
  id: string
  name: string
}

contextBridge.exposeInMainWorld('deplao', {
  listServices: (): Promise<ServiceOption[]> => ipcRenderer.invoke('list-services'),
  getSettings: (): Promise<SettingsPayload> => ipcRenderer.invoke('get-settings'),

  switchProfile: (profile: ProfilePayload) => ipcRenderer.send('switch-profile', profile),
  preloadAllProfiles: (profiles: ProfilePayload[]) => ipcRenderer.send('preload-all-profiles', profiles),
  setBrowserviewVisibility: (visible: boolean) => ipcRenderer.send('set-browserview-visibility', visible),
  deleteProfile: (id: string) => ipcRenderer.send('delete-profile', id),

  setTheme: (isDark: boolean) => ipcRenderer.send('set-theme', isDark),
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  reloadPage: () => ipcRenderer.send('reload-page'),

  onUpdateProfileBadge: (cb: (payload: { id: string; count: number }) => void) => {
    const listener = (_e: IpcRendererEvent, payload: { id: string; count: number }) => cb(payload)
    ipcRenderer.on('update-profile-badge', listener)
    return () => ipcRenderer.removeListener('update-profile-badge', listener)
  },
  onUpdateProfileAvatar: (cb: (payload: { id: string; avatarUrl: string }) => void) => {
    const listener = (_e: IpcRendererEvent, payload: { id: string; avatarUrl: string }) => cb(payload)
    ipcRenderer.on('update-profile-avatar', listener)
    return () => ipcRenderer.removeListener('update-profile-avatar', listener)
  },
  onUpdateProfileFavicon: (cb: (payload: { id: string; faviconUrl: string }) => void) => {
    const listener = (_e: IpcRendererEvent, payload: { id: string; faviconUrl: string }) => cb(payload)
    ipcRenderer.on('update-profile-favicon', listener)
    return () => ipcRenderer.removeListener('update-profile-favicon', listener)
  },
  onFocusProfileFromToast: (cb: (payload: { profileId: string }) => void) => {
    const listener = (_e: IpcRendererEvent, payload: { profileId: string }) => cb(payload)
    ipcRenderer.on('focus-profile-from-toast', listener)
    return () => ipcRenderer.removeListener('focus-profile-from-toast', listener)
  },
})
