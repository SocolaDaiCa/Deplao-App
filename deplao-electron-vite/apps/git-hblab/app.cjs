'use strict';



const path = require('path');

const { readWebScript } = require(path.join(__dirname, '..', '..', 'web-script.cjs'));



class App {
  static getAvatar() {
    return (
      readWebScript(__dirname, 'get-avatar.js') ||
      '(function () { return null; })();'
    );
  }

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


