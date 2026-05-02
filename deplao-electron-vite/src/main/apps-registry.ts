'use strict'

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import type { Session } from 'electron'

const require = createRequire(import.meta.url)

export interface Manifest {
  id: string
  name: string
  startUrl: string
  trustedDomains: string[]
  customCss: string | null
  preloadBasename: string
  userAgent: string | null
  order: number
  dir: string
  _iconPath: string | null
}

let APPS_ROOT = ''

export function setAppsRoot(root: string): void {
  APPS_ROOT = root
}

export function getAppsRoot(): string {
  return APPS_ROOT
}

function normalizeManifest(dirName: string, dir: string, raw: Record<string, unknown>): Manifest {
  const id = (raw.id as string) || dirName
  const preloadBasename = raw.preload != null ? (raw.preload as string) : 'preload.js'
  const iconFile = (raw.icon as string) || 'icon.png'
  const iconPath = path.join(dir, iconFile)
  return {
    id,
    name: (raw.name as string) || id,
    startUrl: raw.startUrl as string,
    trustedDomains: Array.isArray(raw.trustedDomains) ? (raw.trustedDomains as string[]) : [],
    customCss: raw.customCss ? path.join(dir, raw.customCss as string) : null,
    preloadBasename,
    userAgent: (raw.userAgent as string) || null,
    order: typeof raw.order === 'number' ? raw.order : 999,
    dir,
    _iconPath: fs.existsSync(iconPath) ? iconPath : null,
  }
}

export function loadRegistry(): Record<string, Manifest> {
  const manifests: Record<string, Manifest> = {}
  if (!APPS_ROOT || !fs.existsSync(APPS_ROOT)) return manifests

  for (const ent of fs.readdirSync(APPS_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('_')) continue
    const dir = path.join(APPS_ROOT, ent.name)
    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      const m = normalizeManifest(ent.name, dir, raw)
      if (!m.startUrl) {
        console.warn(`[DepLao] Skip ${manifestPath}: missing startUrl`)
        continue
      }
      manifests[m.id] = m
    } catch (e) {
      console.error('[DepLao] Manifest error:', manifestPath, e)
    }
  }
  return manifests
}

export function listServicesSorted(registry: Record<string, Manifest>): Manifest[] {
  return Object.values(registry).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export function getManifest(registry: Record<string, Manifest>, serviceId: string): Manifest | null {
  return registry[serviceId] || null
}

export function resolvePreloadPath(manifest: Manifest | null): string {
  const SHARED_PRELOAD = path.join(APPS_ROOT, '_shared', 'preload-default.cjs')
  if (!manifest) return SHARED_PRELOAD
  const custom = path.join(manifest.dir, manifest.preloadBasename)
  if (fs.existsSync(custom)) return custom
  if (!fs.existsSync(SHARED_PRELOAD)) {
    throw new Error(`Missing default preload: ${SHARED_PRELOAD}`)
  }
  return SHARED_PRELOAD
}

export function getStartUrl(registry: Record<string, Manifest>, serviceId: string, fallbackUrl: string): string {
  const m = getManifest(registry, serviceId)
  return m?.startUrl || fallbackUrl
}

export function getUserAgentForService(defaultUserAgent: string, manifest: Manifest | null): string {
  if (manifest?.userAgent) return manifest.userAgent
  return defaultUserAgent
}

/** Class App trong apps/<id>/app.cjs (hoặc app.js) — static getAvatar, getAvatarFallback, getBadgeCount. */
const appClassCache = new Map<string, AppClassType>()

export interface AppClassType {
  getAvatar: () => string
  getAvatarFallback: (session: Session) => Promise<string | null>
  getBadgeCount: () => string
}

function resolveAppEntryPath(appDir: string): string | null {
  const cjs = path.join(appDir, 'app.cjs')
  if (fs.existsSync(cjs)) return cjs
  const js = path.join(appDir, 'app.js')
  if (fs.existsSync(js)) return js
  return null
}

export function loadAppClass(manifest: Manifest | null): AppClassType {
  const DEFAULT_APP_MODULE = path.join(APPS_ROOT, '_shared', 'app-default.cjs')
  const DefaultApp = require(DEFAULT_APP_MODULE).App as AppClassType
  if (!manifest?.dir) return DefaultApp
  const key = manifest.id
  if (appClassCache.has(key)) return appClassCache.get(key)!
  const appPath = resolveAppEntryPath(manifest.dir)
  let AppClass: AppClassType = DefaultApp
  if (appPath) {
    try {
      const mod = require(appPath) as { App?: AppClassType }
      if (mod.App && typeof mod.App.getAvatar === 'function') {
        AppClass = mod.App
      }
    } catch (e) {
      console.error('[DepLao] app module error:', appPath, e)
    }
  }
  appClassCache.set(key, AppClass)
  return AppClass
}
