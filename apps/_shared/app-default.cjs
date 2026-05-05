'use strict';

const path = require('path');
const { readWebScript } = require(path.join(__dirname, '..', '..', 'web-script.cjs'));

/**
 * App không có app.cjs riêng — chỉ dùng script mặc định trong web/.
 */
class App {
  static getAvatar() {
    return (
      readWebScript(__dirname, 'get-avatar.js') ||
      '(function () { return null; })();'
    );
  }

  /**
   * Khi getAvatar trả null trong trang — ví dụ fallback từ cookie (main process).
   * @param {import('electron').Session} _session
   * @returns {Promise<string|null>}
   */
  static async getAvatarFallback(_session) {
    return null;
  }

  static getBadgeCount() {
    return (
      readWebScript(__dirname, 'get-badge-count.js') ||
      '(function () { return 0; })();'
    );
  }
}

module.exports = { App };
