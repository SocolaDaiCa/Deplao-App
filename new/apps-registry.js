'use strict';

const fs = require('fs');
const path = require('path');

const APPS_ROOT = path.join(__dirname, 'apps');
const SHARED_PRELOAD = path.join(APPS_ROOT, '_shared', 'preload-default.js');

function normalizeManifest(dirName, dir, raw) {
  const id = raw.id || dirName;
  const preloadBasename = raw.preload != null ? raw.preload : 'preload.js';
  const iconFile = raw.icon || 'icon.png';
  const iconPath = path.join(dir, iconFile);
  return {
    id,
    name: raw.name || id,
    startUrl: raw.startUrl,
    trustedDomains: Array.isArray(raw.trustedDomains) ? raw.trustedDomains : [],
    customCss: raw.customCss ? path.join(dir, raw.customCss) : null,
    preloadBasename,
    userAgent: raw.userAgent || null,
    order: typeof raw.order === 'number' ? raw.order : 999,
    dir,
    _iconPath: fs.existsSync(iconPath) ? iconPath : null,
  };
}

function loadRegistry() {
  const manifests = {};
  if (!fs.existsSync(APPS_ROOT)) return manifests;

  for (const ent of fs.readdirSync(APPS_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
    const dir = path.join(APPS_ROOT, ent.name);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const m = normalizeManifest(ent.name, dir, raw);
      if (!m.startUrl) {
        console.warn(`[DepLao] Skip ${manifestPath}: missing startUrl`);
        continue;
      }
      manifests[m.id] = m;
    } catch (e) {
      console.error('[DepLao] Manifest error:', manifestPath, e);
    }
  }
  return manifests;
}

function listServicesSorted(registry) {
  return Object.values(registry).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function getManifest(registry, serviceId) {
  return registry[serviceId] || null;
}

function resolvePreloadPath(manifest) {
  if (!manifest) return SHARED_PRELOAD;
  const custom = path.join(manifest.dir, manifest.preloadBasename);
  if (fs.existsSync(custom)) return custom;
  if (!fs.existsSync(SHARED_PRELOAD)) {
    throw new Error(`Missing default preload: ${SHARED_PRELOAD}`);
  }
  return SHARED_PRELOAD;
}

function getStartUrl(registry, serviceId, fallbackUrl) {
  const m = getManifest(registry, serviceId);
  return m?.startUrl || fallbackUrl;
}

function getUserAgentForService(defaultUserAgent, manifest) {
  if (manifest?.userAgent) return manifest.userAgent;
  return defaultUserAgent;
}

module.exports = {
  APPS_ROOT,
  loadRegistry,
  listServicesSorted,
  getManifest,
  resolvePreloadPath,
  getStartUrl,
  getUserAgentForService,
};
