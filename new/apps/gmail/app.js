'use strict';

const path = require('path');
const { readWebScript } = require(path.join(__dirname, '..', '..', 'web-script'));

class App {
  static getAvatar() {
    const raw = readWebScript(__dirname, 'get-avatar.js');
    if (!raw) throw new Error('[DepLao] gmail: thiếu web/get-avatar.js');
    return raw;
  }

  static async getAvatarFallback(_session) {
    return null;
  }

  static getBadgeCount() {
    const raw = readWebScript(__dirname, 'get-badge-count.js');
    if (!raw) throw new Error('[DepLao] gmail: thiếu web/get-badge-count.js');
    return raw;
  }
}

module.exports = { App };
