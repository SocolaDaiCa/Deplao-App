'use strict';

const path = require('path');
const { readWebScript } = require(path.join(__dirname, '..', '..', 'web-script.cjs'));

class App {
  static getAvatar() {
    const raw = readWebScript(__dirname, 'get-avatar.js');
    if (!raw) throw new Error('[DepLao] instagram: thiếu web/get-avatar.js');
    return raw;
  }

  static getBadgeCount() {
    const raw = readWebScript(__dirname, 'get-badge-count.js');
    if (!raw) throw new Error('[DepLao] instagram: thiếu web/get-badge-count.js');
    return raw;
  }
}

module.exports = { App };
