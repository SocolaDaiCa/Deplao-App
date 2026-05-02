/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

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

export interface DeplaoApi {
  listServices: () => Promise<ServiceOption[]>
  getSettings: () => Promise<SettingsPayload>
  switchProfile: (profile: ProfilePayload) => void
  preloadAllProfiles: (profiles: ProfilePayload[]) => void
  setBrowserviewVisibility: (visible: boolean) => void
  deleteProfile: (id: string) => void
  setTheme: (isDark: boolean) => void
  zoomIn: () => void
  zoomOut: () => void
  toggleFullscreen: () => void
  toggleAlwaysOnTop: () => void
  reloadPage: () => void
  onUpdateProfileBadge: (cb: (payload: { id: string; count: number }) => void) => () => void
  onUpdateProfileAvatar: (cb: (payload: { id: string; avatarUrl: string }) => void) => () => void
  onUpdateProfileFavicon: (cb: (payload: { id: string; faviconUrl: string }) => void) => () => void
}

declare global {
  interface Window {
    /** Chỉ có khi renderer chạy trong Electron (preload). Trình duyệt / Vite thuần sẽ không có. */
    deplao?: DeplaoApi
  }
}

export {}
