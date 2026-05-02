'use strict';

/**
 * DepLao — Electron wrapper (Franz-style partitions).
 * UA = Chromium của Electron (process.versions.chrome) để tránh lệch phiên bản với Meta.
 */

const {
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
} = require('electron');
const path = require('path');
const fs = require('fs');
const {
  loadRegistry,
  getManifest,
  resolvePreloadPath,
  getStartUrl,
  getUserAgentForService,
  listServicesSorted,
  loadAppClass,
} = require('./apps-registry');

let serviceRegistry = loadRegistry();
const DEFAULT_SERVICE_FALLBACK_URL = 'https://www.messenger.com/';
const APP_ID = 'com.deplao.app';

/**
 * Windows: Chromium đôi khi báo `cache_util_win: Unable to move the cache` khi dùng thư mục cache mặc định
 * (instance cũ chưa tắt, antivirus, hoặc migration cache). Gán `disk-cache-dir` cố định ngay từ đầu.
 * Phải gọi trước app.ready (và trước mọi BrowserWindow).
 */
if (process.platform === 'win32') {
  const diskCache = path.join(app.getPath('userData'), 'electron-disk-cache');
  try {
    fs.mkdirSync(diskCache, { recursive: true });
  } catch (_) {}
  app.commandLine.appendSwitch('disk-cache-dir', diskCache);
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

/** Khớp UA với nhân Chromium — không giả mạo Chrome/xxx khác phiên bản. */
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  /** Instance phụ: chỉ `app.quit()` có thể vẫn để file chạy tiếp tới `whenReady` → cửa sổ lóe rồi thoát. */
  app.quit();
  process.exit(0);
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  windowBounds: { width: 1200, height: 800 },
  startMinimized: false,
  autoLaunch: false,
  minimizeToTray: true,
  globalHotkey: 'Ctrl+Shift+M',
  currentTheme: 'default',
  isDarkMode: true,
  alwaysOnTop: false,
};

function loadSettings() {
  try {
    const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(data) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

let mainWindow = null;
let tray = null;
let settings = loadSettings();
let isQuitting = false;
let unreadCount = 0;

let browserViews = {};
let activeProfileId = null;
let ipcBound = false;

function configurePartitionSession(session) {
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
  ]);

  session.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission));
  });

  try {
    if (typeof session.setDevicePermissionHandler === 'function') {
      session.setDevicePermissionHandler((details) => {
        if (details.deviceType === 'hid' || details.deviceType === 'serial') return true;
        return details.origin.startsWith('https://');
      });
    }
  } catch (_) {}
}

/** Google đăng nhập so khớp UA với Sec-CH-UA; Electron gửi “Chromium” khiến trang bảo “không an toàn”. */
const sessionsGoogleHintsPatched = new WeakSet();
const sessionGoogleLatestUa = new WeakMap();

function secChUaPlatformFromUserAgent(ua) {
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return { platform: '"macOS"', platformVersion: '"14.0"' };
  }
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    return { platform: '"Linux"', platformVersion: '""' };
  }
  return { platform: '"Windows"', platformVersion: '"15.0.0"' };
}

function patchGoogleAccountHeaders(session, chromeUserAgent) {
  sessionGoogleLatestUa.set(session, chromeUserAgent);

  if (sessionsGoogleHintsPatched.has(session)) return;
  sessionsGoogleHintsPatched.add(session);

  const full = process.versions.chrome;
  const major = full.split('.')[0];
  const secChUa = `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`;
  const secChUaFull = `"Google Chrome";v="${full}", "Chromium";v="${full}", "Not_A Brand";v="24.0.0.0"`;
  const filter = {
    urls: [
      '*://accounts.google.com/*',
      '*://*.accounts.google.com/*',
      '*://mail.google.com/*',
      '*://ogs.google.com/*',
    ],
  };

  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const ua = sessionGoogleLatestUa.get(session) || chromeUserAgent;
    const { platform, platformVersion } = secChUaPlatformFromUserAgent(ua);
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = ua;
    headers['Sec-CH-UA'] = secChUa;
    headers['Sec-CH-UA-Full-Version-List'] = secChUaFull;
    headers['Sec-CH-UA-Mobile'] = '?0';
    headers['Sec-CH-UA-Platform'] = platform;
    headers['Sec-CH-UA-Platform-Version'] = platformVersion;
    callback({ requestHeaders: headers });
  });
}

function createBadgeIcon(count) {
  const size = 18;
  const text = count > 9 ? count : String(count);
  const fontSize = count > 9 ? 9 : 11;

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#e74c3c"/>
      <text x="${size / 2}" y="${size / 2 + fontSize / 3}"
            text-anchor="middle" fill="white"
            font-size="${fontSize}" font-weight="bold"
            font-family="Arial, sans-serif">${text}</text>
    </svg>`;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  updateTrayMenu();
  tray.setToolTip('DepLao');

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mở DepLao', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    {
      label: 'Tải lại trang',
      click: () => {
        if (activeProfileId && browserViews[activeProfileId]) {
          browserViews[activeProfileId].webContents.reload();
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
        settings.minimizeToTray = item.checked;
        saveSettings(settings);
      },
    },
    { type: 'separator' },
    { label: 'Thoát hoàn toàn', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function toggleAutoLaunch(enable) {
  settings.autoLaunch = enable;
  saveSettings(settings);
  app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') });
}

function updateBrowserViewBounds() {
  if (!mainWindow || !activeProfileId || !browserViews[activeProfileId]) return;
  const bounds = mainWindow.getContentBounds();
  browserViews[activeProfileId].setBounds({
    x: 68,
    y: 0,
    width: Math.max(bounds.width - 68, 0),
    height: Math.max(bounds.height, 0),
  });
}

/** Trang web (Facebook, …) ghi đè `document.title` → Electron đổi tiêu đề cửa sổ; giữ tiêu đề theo manifest. */
function updateMainWindowTitle(profile) {
  if (!mainWindow || !profile) return;
  const m = getManifest(serviceRegistry, profile.platform || 'messenger');
  const label = m?.name || 'DepLao';
  mainWindow.setTitle(`DepLao — ${label}`);
}

function ensureProfileView(profile) {
  serviceRegistry = loadRegistry();
  const platform = profile.platform || 'messenger';
  const manifest = getManifest(serviceRegistry, platform);
  const preloadPath = resolvePreloadPath(manifest);
  const ua = getUserAgentForService(USER_AGENT, manifest);

  if (!browserViews[profile.id]) {
    const view = new BrowserView({
      webPreferences: {
        partition: profile.partition,
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    });
    browserViews[profile.id] = view;
    configurePartitionSession(view.webContents.session);
    setupWebContents(view.webContents, profile);

    const startUrl = getStartUrl(serviceRegistry, platform, DEFAULT_SERVICE_FALLBACK_URL);
    view.webContents.session.setUserAgent(ua);
    view.webContents.setUserAgent(ua);
    patchGoogleAccountHeaders(view.webContents.session, ua);
    view.webContents.loadURL(startUrl);
  } else {
    const wc = browserViews[profile.id].webContents;
    wc.session.setUserAgent(ua);
    wc.setUserAgent(ua);
    patchGoogleAccountHeaders(wc.session, ua);
  }
}

function setupWebContents(contents, profile) {
  const profileId = profile.id;
  const platform = profile.platform || 'messenger';
  const manifest = getManifest(serviceRegistry, platform);
  const AppCls = loadAppClass(manifest);

  /** Link `target=_blank` / `window.open` → mở bằng trình duyệt hệ thống, không tạo popup trong Electron. */
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch (_) {}
    return { action: 'deny' };
  });

  contents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) }));
      }
      if (params.dictionarySuggestions.length > 0) menu.append(new MenuItem({ type: 'separator' }));
    }
    if (params.selectionText) menu.append(new MenuItem({ label: 'Sao chép', role: 'copy' }));
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Dán', role: 'paste' }));
      menu.append(new MenuItem({ label: 'Cắt', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Chọn tất cả', role: 'selectAll' }));
    }
    if (params.linkURL) {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Mở liên kết', click: () => shell.openExternal(params.linkURL) }));
      menu.append(
        new MenuItem({
          label: 'Sao chép liên kết',
          click: () => require('electron').clipboard.writeText(params.linkURL),
        })
      );
    }
    if (params.mediaType === 'image') {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Lưu ảnh', click: () => contents.downloadURL(params.srcURL) }));
    }
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Tải lại trang', click: () => contents.reload() }));
    menu.append(new MenuItem({ label: 'Quay lại', enabled: contents.canGoBack(), click: () => contents.goBack() }));
    if (menu.items.length > 0) menu.popup({ window: mainWindow });
  });

  contents.on('page-title-updated', () => {
    updateMainWindowTitle(profile);
  });

  const profilePollInterval = setInterval(async () => {
    if (contents.isDestroyed()) {
      clearInterval(profilePollInterval);
      return;
    }
    try {
      const avatarUrl = await contents.executeJavaScript(AppCls.getAvatar());
      if (avatarUrl && mainWindow && profileId) {
        mainWindow.webContents.send('update-profile-avatar', { id: profileId, avatarUrl });
      } else {
        const fallback = await AppCls.getAvatarFallback(contents.session);
        if (fallback && mainWindow && profileId) {
          mainWindow.webContents.send('update-profile-avatar', { id: profileId, avatarUrl: fallback });
        }
      }

      const countRaw = await contents.executeJavaScript(AppCls.getBadgeCount());
      const count =
        typeof countRaw === 'number' && !Number.isNaN(countRaw) ? Math.max(0, Math.floor(countRaw)) : 0;
      if (mainWindow && profileId) {
        mainWindow.webContents.send('update-profile-badge', { id: profileId, count });
      }
      if (profileId === activeProfileId) {
        updateBadge(count);
      }
    } catch (_) {}
  }, 1000);

  if (app.isPackaged) {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) event.preventDefault();
    });
    contents.on('devtools-opened', () => contents.closeDevTools());
  } else {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) contents.toggleDevTools();
    });
  }
}

function registerIpcHandlers() {
  if (ipcBound) return;
  ipcBound = true;

  ipcMain.handle('list-services', () => {
    serviceRegistry = loadRegistry();
    return listServicesSorted(serviceRegistry).map((m) => ({ id: m.id, name: m.name }));
  });

  ipcMain.on('preload-all-profiles', (event, profiles) => {
    if (!Array.isArray(profiles)) return;
    for (const profile of profiles) {
      ensureProfileView(profile);
    }
  });

  ipcMain.on('switch-profile', (event, profile) => {
    activeProfileId = profile.id;
    ensureProfileView(profile);
    mainWindow.setBrowserView(browserViews[profile.id]);
    updateBrowserViewBounds();
    updateMainWindowTitle(profile);
  });

  ipcMain.on('set-browserview-visibility', (event, visible) => {
    if (!mainWindow) return;
    if (visible && activeProfileId && browserViews[activeProfileId]) {
      mainWindow.setBrowserView(browserViews[activeProfileId]);
      updateBrowserViewBounds();
    } else {
      mainWindow.setBrowserView(null);
    }
  });

  ipcMain.on('delete-profile', (event, id) => {
    if (browserViews[id]) {
      browserViews[id].webContents.destroy();
      delete browserViews[id];
    }
  });

  ipcMain.on('update-badge', (event, count) => {
    if (count !== unreadCount) {
      const hadNewMessages = count > unreadCount;
      unreadCount = count;
      updateBadge(unreadCount);
      if (hadNewMessages && mainWindow && !mainWindow.isFocused()) {
        mainWindow.flashFrame(true);
      }
    }
  });

  ipcMain.on('set-theme', (event, isDark) => {
    settings.isDarkMode = isDark;
    saveSettings(settings);
    nativeTheme.themeSource = isDark ? 'dark' : 'light';
  });

  ipcMain.on('toggle-always-on-top', () => {
    settings.alwaysOnTop = !settings.alwaysOnTop;
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    saveSettings(settings);
  });

  ipcMain.on('toggle-fullscreen', () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    setTimeout(updateBrowserViewBounds, 100);
  });

  ipcMain.on('zoom-in', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents;
      wc.setZoomLevel(wc.getZoomLevel() + 0.5);
    }
  });

  ipcMain.on('zoom-out', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents;
      wc.setZoomLevel(wc.getZoomLevel() - 0.5);
    }
  });

  ipcMain.on('reload-page', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      browserViews[activeProfileId].webContents.reload();
    }
  });

  ipcMain.on('get-settings', (event) => {
    event.returnValue = {
      isDarkMode: settings.isDarkMode,
      alwaysOnTop: settings.alwaysOnTop,
    };
  });
}

function createWindow() {
  const { windowBounds } = settings;

  mainWindow = new BrowserWindow({
    width: windowBounds.width || 1200,
    height: windowBounds.height || 800,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 400,
    minHeight: 300,
    title: 'DepLao',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: settings.isDarkMode ? '#242526' : '#ffffff',
    show: !settings.startMinimized,
    autoHideMenuBar: true,
    titleBarOverlay: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile('index.html');

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) event.preventDefault();
    });
    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
  } else {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) mainWindow.webContents.toggleDevTools();
    });
  }

  mainWindow.on('focus', () => {
    mainWindow.flashFrame(false);
  });

  mainWindow.on('resize', updateBrowserViewBounds);
  mainWindow.on('maximize', updateBrowserViewBounds);
  mainWindow.on('unmaximize', updateBrowserViewBounds);

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    settings.windowBounds = mainWindow.getBounds();
    saveSettings(settings);
  });
}

function updateBadge(count) {
  if (!mainWindow) return;
  if (process.platform === 'win32') {
    if (count > 0) {
      try {
        mainWindow.setOverlayIcon(createBadgeIcon(count), `${count} chưa đọc`);
      } catch {
        mainWindow.setOverlayIcon(null, '');
      }
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `DepLao — ${count} chưa đọc` : 'DepLao');
  }
}

function registerGlobalShortcuts() {
  const hotkey = settings.globalHotkey || 'Ctrl+Shift+M';
  try {
    globalShortcut.register(hotkey, () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (_) {}
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = settings.isDarkMode ? 'dark' : 'light';
  registerIpcHandlers();
  createWindow();
  createTray();
  registerGlobalShortcuts();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow) {
    settings.windowBounds = mainWindow.getBounds();
    saveSettings(settings);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
