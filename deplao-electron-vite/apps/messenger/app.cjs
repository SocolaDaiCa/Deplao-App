'use strict';

const path = require('path');
const { readWebScript } = require(path.join(__dirname, '..', '..', 'web-script.cjs'));

class App {
  static getAvatar() {
    const raw = readWebScript(__dirname, 'get-avatar.js');
    if (!raw) throw new Error('[DepLao] messenger: thiếu web/get-avatar.js');
    return raw;
  }

  static async getAvatarFallback(session) {
    const cookies = await session.cookies.get({ name: 'c_user' });
    if (cookies && cookies.length > 0) {
      const uid = cookies[0].value;
      return `https://graph.facebook.com/${uid}/picture?width=150&height=150`;
    }
    return null;
  }

  static getBadgeCount() {
    const raw = readWebScript(__dirname, 'get-badge-count.js');
    if (!raw) throw new Error('[DepLao] messenger: thiếu web/get-badge-count.js');
    return raw;
  }
}

module.exports = { App };
