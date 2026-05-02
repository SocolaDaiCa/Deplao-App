'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Đọc raw script chạy trong trang (executeJavaScript).
 * @param {string} appDir thư mục app (vd. .../apps/messenger)
 * @param {string} filename vd. get-avatar.js
 * @returns {string|null}
 */
function readWebScript(appDir, filename) {
  const p = path.join(appDir, 'web', filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

module.exports = { readWebScript };
