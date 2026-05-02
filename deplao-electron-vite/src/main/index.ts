'use strict'

import {
  app,
  BrowserWindow,
  BrowserView,
  shell,
  Menu,
  MenuItem,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  clipboard,
} from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  loadRegistry,
  getManifest,
  resolvePreloadPath,
  getStartUrl,
  getUserAgentForService,
  listServicesSorted,
  loadAppClass,
  setAppsRoot,
  type Manifest,
} from './apps-registry'
import { createWindowsTaskbarOverlayIcon } from './win-taskbar-badge'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function resolveAppsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'apps')
  }
  /** Dev/preview: main bundle is `<project>/out/main/*.js` → `apps` lives at `<project>/apps`. */
  const fromMainBundle = path.resolve(__dirname, '../../apps')
  if (fs.existsSync(fromMainBundle)) return fromMainBundle
  const fromGetAppPath = path.join(app.getAppPath(), 'apps')
  if (fs.existsSync(fromGetAppPath)) return fromGetAppPath
  return path.join(process.cwd(), 'apps')
}

let serviceRegistry: Record<string, Manifest> = {}
const DEFAULT_SERVICE_FALLBACK_URL = 'https://www.messenger.com/'
const APP_ID = 'com.deplao.app'

if (process.platform === 'win32') {
  const diskCache = path.join(app.getPath('userData'), 'electron-disk-cache')
  try {
    fs.mkdirSync(diskCache, { recursive: true })
  } catch {
    /* ignore */
  }
  app.commandLine.appendSwitch('disk-cache-dir', diskCache)
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
}

const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS = {
  windowBounds: { width: 1200, height: 800 },
  startMinimized: false,
  autoLaunch: false,
  minimizeToTray: true,
  globalHotkey: 'Ctrl+Shift+M',
  currentTheme: 'default',
  isDarkMode: true,
  alwaysOnTop: false,
}

type Settings = Omit<typeof DEFAULT_SETTINGS, 'windowBounds'> & {
  windowBounds: { width: number; height: number; x?: number; y?: number }
}

function loadSettings(): Settings {
  try {
    const data = fs.readFileSync(SETTINGS_PATH, 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(data: Settings): void {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8')
  } catch {
    /* ignore */
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let settings = loadSettings()
let isQuitting = false
let unreadCount = 0

/** Đếm chưa đọc theo từng profile (poll từ getBadgeCount) — overlay taskbar dùng tổng. */
const profileBadgeCounts: Record<string, number> = {}

const browserViews: Record<string, BrowserView> = {}
/** Theo dõi app đã load cho mỗi phiên — đổi Messenger/Gmail cần tạo lại view / load URL. */
const profileViewPlatform: Record<string, string> = {}
let activeProfileId: string | null = null
let ipcBound = false

function sumProfileBadgeCounts(): number {
  let s = 0
  for (const v of Object.values(profileBadgeCounts)) {
    if (typeof v === 'number' && !Number.isNaN(v)) s += Math.max(0, v)
  }
  return s
}

function destroyBrowserViewForProfile(id: string): void {
  const view = browserViews[id]
  if (!view) return
  if (mainWindow) mainWindow.removeBrowserView(view)
  const wc = view.webContents
  if (!wc.isDestroyed()) {
    // Giống `new/main.js`: `destroy()` giải phóng view sạch hơn `close()` cho BrowserView.
    if (typeof wc.destroy === 'function') {
      wc.destroy()
    } else {
      wc.close()
    }
  }
  delete browserViews[id]
  delete profileViewPlatform[id]
  delete profileBadgeCounts[id]
  updateBadge(sumProfileBadgeCounts())
}

function configurePartitionSession(session: Electron.Session): void {
  const allowed = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
    'media',
    'mediaKeySystem',
    'geolocation',
    'pointerLock',
    'window-management',
    'serial',
    'hid',
  ])

  session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission))
  })

  try {
    if (typeof session.setDevicePermissionHandler === 'function') {
      session.setDevicePermissionHandler((details) => {
        if (details.deviceType === 'hid' || details.deviceType === 'serial') return true
        return details.origin.startsWith('https://')
      })
    }
  } catch {
    /* ignore */
  }
}

const sessionsGoogleHintsPatched = new WeakSet<Electron.Session>()
const sessionGoogleLatestUa = new WeakMap<Electron.Session, string>()

function secChUaPlatformFromUserAgent(ua: string): { platform: string; platformVersion: string } {
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return { platform: '"macOS"', platformVersion: '"14.0"' }
  }
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    return { platform: '"Linux"', platformVersion: '""' }
  }
  return { platform: '"Windows"', platformVersion: '"15.0.0"' }
}

function patchGoogleAccountHeaders(session: Electron.Session, chromeUserAgent: string): void {
  sessionGoogleLatestUa.set(session, chromeUserAgent)

  if (sessionsGoogleHintsPatched.has(session)) return
  sessionsGoogleHintsPatched.add(session)

  const full = process.versions.chrome
  const major = full.split('.')[0]
  const secChUa = `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`
  const secChUaFull = `"Google Chrome";v="${full}", "Chromium";v="${full}", "Not_A Brand";v="24.0.0.0"`
  const filter = {
    urls: [
      '*://accounts.google.com/*',
      '*://*.accounts.google.com/*',
      '*://mail.google.com/*',
      '*://ogs.google.com/*',
    ],
  }

  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const ua = sessionGoogleLatestUa.get(session) || chromeUserAgent
    const { platform, platformVersion } = secChUaPlatformFromUserAgent(ua)
    const headers = { ...details.requestHeaders }
    headers['User-Agent'] = ua
    headers['Sec-CH-UA'] = secChUa
    headers['Sec-CH-UA-Full-Version-List'] = secChUaFull
    headers['Sec-CH-UA-Mobile'] = '?0'
    headers['Sec-CH-UA-Platform'] = platform
    headers['Sec-CH-UA-Platform-Version'] = platformVersion
    callback({ requestHeaders: headers })
  })
}

/** Popup đăng nhập Google phải mở trong Electron (cùng partition), không dùng `openExternal` — nếu không session cookie không khớp và Gmail không đăng nhập được. */
function shouldKeepGoogleSignInInElectron(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname
    if (h === 'accounts.google.com' || h.endsWith('.accounts.google.com')) return true
    if (h === 'ogs.google.com' || h.endsWith('.ogs.google.com')) return true
    if ((h === 'www.google.com' || h === 'google.com') && /signin|accounts/i.test(u.pathname)) return true
    return false
  } catch {
    return false
  }
}

function createWindowOpenHandlerForPartition(partition: string) {
  return (details: { url: string }): Electron.HandlerResponse => {
    const { url } = details
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        if (shouldKeepGoogleSignInInElectron(url)) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              parent: mainWindow ?? undefined,
              autoHideMenuBar: true,
              width: 520,
              height: 720,
              webPreferences: {
                partition,
                contextIsolation: true,
                nodeIntegration: false,
                spellcheck: true,
              },
            },
          }
        }
        shell.openExternal(url)
        return { action: 'deny' }
      }
    } catch {
      /* ignore */
    }
    return { action: 'deny' }
  }
}

/** Gắn handler popup + đệ quy cho cửa sổ con (OAuth Google đôi khi mở nhiều lớp popup). */
function wireChildWindowOpenChain(contents: Electron.WebContents, partition: string): void {
  const handler = createWindowOpenHandlerForPartition(partition)
  contents.setWindowOpenHandler(handler)
  contents.on('did-create-window', (_event, childWindow) => {
    if (childWindow && !childWindow.isDestroyed()) {
      wireChildWindowOpenChain(childWindow.webContents, partition)
    }
  })
}

function updateTrayMenu(): void {
  if (!tray) return
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mở DepLao',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Tải lại trang',
      click: () => {
        if (activeProfileId && browserViews[activeProfileId]) {
          browserViews[activeProfileId].webContents.reload()
        }
      },
    },
    {
      label: 'Khởi động cùng Windows',
      type: 'checkbox',
      checked: settings.autoLaunch,
      click: (item) => toggleAutoLaunch(item.checked),
    },
    {
      label: 'Thu nhỏ xuống Tray khi đóng',
      type: 'checkbox',
      checked: settings.minimizeToTray,
      click: (item) => {
        settings.minimizeToTray = !!item.checked
        saveSettings(settings)
      },
    },
    { type: 'separator' },
    {
      label: 'Thoát hoàn toàn',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
}

function createTray(): void {
  const iconPath = path.join(app.getAppPath(), 'icon.png')
  let trayIcon: Electron.NativeImage
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } catch {
    trayIcon = nativeImage.createEmpty()
  }
  tray = new Tray(trayIcon)
  updateTrayMenu()
  tray.setToolTip('DepLao')

  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('double-click', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
  })
}

function toggleAutoLaunch(enable: boolean): void {
  settings.autoLaunch = enable
  saveSettings(settings)
  app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') })
}

function updateBrowserViewBounds(): void {
  if (!mainWindow || !activeProfileId || !browserViews[activeProfileId]) return
  const bounds = mainWindow.getContentBounds()
  browserViews[activeProfileId].setBounds({
    x: 68,
    y: 0,
    width: Math.max(bounds.width - 68, 0),
    height: Math.max(bounds.height, 0),
  })
}

function updateMainWindowTitle(profile: { platform?: string }): void {
  if (!mainWindow || !profile) return
  const m = getManifest(serviceRegistry, profile.platform || 'messenger')
  const label = m?.name || 'DepLao'
  mainWindow.setTitle(`DepLao — ${label}`)
}

function ensureProfileView(profile: {
  id: string
  partition: string
  platform?: string
}): void {
  serviceRegistry = loadRegistry()
  const platform = profile.platform || 'messenger'
  const manifest = getManifest(serviceRegistry, platform)
  const preloadPath = resolvePreloadPath(manifest)
  const ua = getUserAgentForService(USER_AGENT, manifest)
  const startUrl = getStartUrl(serviceRegistry, platform, DEFAULT_SERVICE_FALLBACK_URL)

  const tracked = profileViewPlatform[profile.id]
  if (browserViews[profile.id] && tracked !== undefined && tracked !== platform) {
    destroyBrowserViewForProfile(profile.id)
  }

  if (!browserViews[profile.id]) {
    const view = new BrowserView({
      webPreferences: {
        partition: profile.partition,
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    })
    browserViews[profile.id] = view
    profileViewPlatform[profile.id] = platform
    configurePartitionSession(view.webContents.session)
    setupWebContents(view.webContents, profile)

    view.webContents.session.setUserAgent(ua)
    view.webContents.setUserAgent(ua)
    patchGoogleAccountHeaders(view.webContents.session, ua)
    view.webContents.loadURL(startUrl)
  } else {
    const wc = browserViews[profile.id].webContents
    if (tracked === undefined) {
      profileViewPlatform[profile.id] = platform
    }
    wc.session.setUserAgent(ua)
    wc.setUserAgent(ua)
    patchGoogleAccountHeaders(wc.session, ua)
  }
}

function setupWebContents(
  contents: Electron.WebContents,
  profile: { id: string; partition: string; platform?: string }
): void {
  const profileId = profile.id
  const platform = profile.platform || 'messenger'
  const manifest = getManifest(serviceRegistry, platform)
  const AppCls = loadAppClass(manifest)

  wireChildWindowOpenChain(contents, profile.partition)

  contents.on('context-menu', (_event, params) => {
    const menu = new Menu()
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) }))
      }
      if (params.dictionarySuggestions.length > 0) menu.append(new MenuItem({ type: 'separator' }))
    }
    if (params.selectionText) menu.append(new MenuItem({ label: 'Sao chép', role: 'copy' }))
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Dán', role: 'paste' }))
      menu.append(new MenuItem({ label: 'Cắt', role: 'cut' }))
      menu.append(new MenuItem({ label: 'Chọn tất cả', role: 'selectAll' }))
    }
    if (params.linkURL) {
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ label: 'Mở liên kết', click: () => shell.openExternal(params.linkURL) }))
      menu.append(
        new MenuItem({
          label: 'Sao chép liên kết',
          click: () => clipboard.writeText(params.linkURL),
        })
      )
    }
    if (params.mediaType === 'image') {
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ label: 'Lưu ảnh', click: () => contents.downloadURL(params.srcURL) }))
    }
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({ label: 'Tải lại trang', click: () => contents.reload() }))
    menu.append(new MenuItem({ label: 'Quay lại', enabled: contents.canGoBack(), click: () => contents.goBack() }))
    if (menu.items.length > 0) menu.popup({ window: mainWindow ?? undefined })
  })

  contents.on('page-title-updated', () => {
    updateMainWindowTitle(profile)
  })

  contents.on('page-favicon-updated', (_event, favicons: string[]) => {
    if (!mainWindow || !profileId) return
    const url = Array.isArray(favicons) && favicons.length > 0 ? favicons[0] : ''
    if (url) {
      mainWindow.webContents.send('update-profile-favicon', { id: profileId, faviconUrl: url })
    }
  })

  const profilePollInterval = setInterval(async () => {
    if (contents.isDestroyed()) {
      clearInterval(profilePollInterval)
      return
    }
    try {
      const avatarUrl = await contents.executeJavaScript(AppCls.getAvatar())
      if (avatarUrl && mainWindow && profileId) {
        mainWindow.webContents.send('update-profile-avatar', { id: profileId, avatarUrl })
      } else {
        const fallback = await AppCls.getAvatarFallback(contents.session)
        if (fallback && mainWindow && profileId) {
          mainWindow.webContents.send('update-profile-avatar', { id: profileId, avatarUrl: fallback })
        }
      }

      const countRaw = await contents.executeJavaScript(AppCls.getBadgeCount())
      const count =
        typeof countRaw === 'number' && !Number.isNaN(countRaw) ? Math.max(0, Math.floor(countRaw)) : 0
      if (mainWindow && profileId) {
        mainWindow.webContents.send('update-profile-badge', { id: profileId, count })
      }
      if (profileId) {
        profileBadgeCounts[profileId] = count
        updateBadge(sumProfileBadgeCounts())
      }
    } catch {
      /* ignore */
    }
  }, 1000)

  if (app.isPackaged) {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) event.preventDefault()
    })
    contents.on('devtools-opened', () => contents.closeDevTools())
  } else {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) contents.toggleDevTools()
    })
  }
}

function registerIpcHandlers(): void {
  if (ipcBound) return
  ipcBound = true

  ipcMain.handle('list-services', () => {
    try {
      serviceRegistry = loadRegistry()
      return listServicesSorted(serviceRegistry).map((m: Manifest) => ({ id: m.id, name: m.name }))
    } catch (e) {
      console.error('[DepLao] list-services:', e)
      return []
    }
  })

  ipcMain.handle('get-settings', () => ({
    isDarkMode: settings.isDarkMode,
    alwaysOnTop: settings.alwaysOnTop,
  }))

  ipcMain.on('preload-all-profiles', (_event, profiles: unknown) => {
    if (!Array.isArray(profiles)) return
    for (const profile of profiles as { id: string; partition: string; platform?: string }[]) {
      if (!profile?.id || !profile.partition) {
        console.error('[DepLao] preload-all-profiles: thiếu id/partition', profile)
        continue
      }
      ensureProfileView(profile)
    }
  })

  ipcMain.on('switch-profile', (_event, profile: { id: string; partition: string; platform?: string }) => {
    if (!profile?.id || !profile.partition) {
      console.error('[DepLao] switch-profile: payload không hợp lệ (Vue Proxy qua IPC?)', profile)
      return
    }
    activeProfileId = profile.id
    ensureProfileView(profile)
    if (!mainWindow) return
    const view = browserViews[profile.id]
    if (!view) {
      console.error('[DepLao] switch-profile: không có BrowserView sau ensureProfileView', profile.id)
      return
    }
    mainWindow.setBrowserView(view)
    updateBrowserViewBounds()
    updateMainWindowTitle(profile)
  })

  ipcMain.on('set-browserview-visibility', (_event, visible: boolean) => {
    if (!mainWindow) return
    if (visible && activeProfileId && browserViews[activeProfileId]) {
      mainWindow.setBrowserView(browserViews[activeProfileId])
      updateBrowserViewBounds()
    } else {
      mainWindow.setBrowserView(null)
    }
  })

  ipcMain.on('delete-profile', (_event, id: string) => {
    destroyBrowserViewForProfile(id)
  })

  ipcMain.on('update-badge', (_event, count: number) => {
    const n = typeof count === 'number' && !Number.isNaN(count) ? Math.max(0, Math.floor(count)) : 0
    if (n !== unreadCount) {
      const hadNewMessages = n > unreadCount
      unreadCount = n
      updateBadge(n)
      if (hadNewMessages && mainWindow && !mainWindow.isFocused()) {
        mainWindow.flashFrame(true)
      }
    }
  })

  ipcMain.on('set-theme', (_event, isDark: boolean) => {
    settings.isDarkMode = isDark
    saveSettings(settings)
    nativeTheme.themeSource = isDark ? 'dark' : 'light'
  })

  ipcMain.on('toggle-always-on-top', () => {
    settings.alwaysOnTop = !settings.alwaysOnTop
    if (mainWindow) mainWindow.setAlwaysOnTop(settings.alwaysOnTop)
    saveSettings(settings)
  })

  ipcMain.on('toggle-fullscreen', () => {
    if (!mainWindow) return
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
    setTimeout(updateBrowserViewBounds, 100)
  })

  ipcMain.on('zoom-in', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents
      wc.setZoomLevel(wc.getZoomLevel() + 0.5)
    }
  })

  ipcMain.on('zoom-out', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents
      wc.setZoomLevel(wc.getZoomLevel() - 0.5)
    }
  })

  ipcMain.on('reload-page', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      browserViews[activeProfileId].webContents.reload()
    }
  })
}

function createWindow(): void {
  const { windowBounds } = settings

  const preloadPath = path.join(__dirname, '../preload/index.cjs')

  mainWindow = new BrowserWindow({
    width: windowBounds.width || 1200,
    height: windowBounds.height || 800,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 400,
    minHeight: 300,
    title: 'DepLao',
    icon: path.join(app.getAppPath(), 'icon.png'),
    backgroundColor: settings.isDarkMode ? '#242526' : '#ffffff',
    show: !settings.startMinimized,
    autoHideMenuBar: true,
    titleBarOverlay: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) event.preventDefault()
    })
    mainWindow.webContents.on('devtools-opened', () => mainWindow!.webContents.closeDevTools())
  } else {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) mainWindow!.webContents.toggleDevTools()
    })
  }

  mainWindow.on('focus', () => {
    mainWindow?.flashFrame(false)
  })

  mainWindow.on('resize', updateBrowserViewBounds)
  mainWindow.on('maximize', updateBrowserViewBounds)
  mainWindow.on('unmaximize', updateBrowserViewBounds)

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
    if (mainWindow) {
      settings.windowBounds = mainWindow.getBounds()
      saveSettings(settings)
    }
  })
}

function updateBadge(count: number): void {
  if (!mainWindow) return
  const tipCount = count > 99 ? '99+' : String(count)
  if (process.platform === 'win32') {
    /** Shell nhận PNG 16×16; setImmediate giảm race khi cửa sổ ẩn/minimize. */
    setImmediate(() => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return
      if (count <= 0) {
        try {
          win.setOverlayIcon(null, '')
        } catch {
          /* ignore */
        }
        return
      }
      try {
        const overlay = createWindowsTaskbarOverlayIcon(count)
        if (overlay.isEmpty()) {
          win.setOverlayIcon(null, '')
        } else {
          win.setOverlayIcon(overlay, `${tipCount} chưa đọc`)
        }
      } catch {
        win.setOverlayIcon(null, '')
      }
    })
  } else if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? tipCount : '')
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `DepLao — ${tipCount} chưa đọc` : 'DepLao')
  }
}

function registerGlobalShortcuts(): void {
  const hotkey = settings.globalHotkey || 'Ctrl+Shift+M'
  try {
    globalShortcut.register(hotkey, () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch {
    /* ignore */
  }
}

app.whenReady().then(() => {
  setAppsRoot(resolveAppsRoot())
  serviceRegistry = loadRegistry()

  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = settings.isDarkMode ? 'dark' : 'light'
  registerIpcHandlers()
  createWindow()
  createTray()
  registerGlobalShortcuts()

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  if (mainWindow) {
    settings.windowBounds = mainWindow.getBounds()
    saveSettings(settings)
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
