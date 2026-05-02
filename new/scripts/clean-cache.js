'use strict';

/**
 * Chạy: npm run clean-cache
 *       npm run clean-cache -- --sessions   (xóa cả Partitions = mất cookie/đăng nhập web)
 * Phải app.setName() giống app chính — nếu không Electron dùng thư mục "Electron" thay vì deplao-app.
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const pkg = require(path.join(__dirname, '..', 'package.json'));
app.setName(pkg.name);

const wipeSessions = process.argv.includes('--sessions');

function rmDir(p) {
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      return true;
    }
  } catch (e) {
    console.error('[DepLao] Lỗi xóa:', p);
    console.error('        → Đóng hết cửa sổ DepLao (và tray), rồi chạy lại lệnh.');
    console.error('        ', e.message || e);
  }
  return false;
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  console.log('[DepLao] userData:', userData);

  const cacheDirs = [
    path.join(userData, 'electron-disk-cache'),
    path.join(userData, 'Cache'),
    path.join(userData, 'Code Cache'),
    path.join(userData, 'GPUCache'),
  ];

  for (const d of cacheDirs) {
    if (rmDir(d)) console.log('[DepLao] Đã xóa:', d);
    else if (fs.existsSync(d)) console.log('[DepLao] (còn lại — xem lỗi ở trên)', d);
    else console.log('[DepLao] (không có)', d);
  }

  if (wipeSessions) {
    const partitions = path.join(userData, 'Partitions');
    if (rmDir(partitions)) console.log('[DepLao] Đã xóa session web:', partitions);
    else if (fs.existsSync(partitions)) console.log('[DepLao] (Partitions chưa xóa hết — đóng app rồi thử lại)', partitions);
    else console.log('[DepLao] (không có)', partitions);
  } else {
    console.log('[DepLao] Giữ Partitions (đăng nhập cookie/localStorage). Chạy: npm run clean-cache:sessions');
  }

  app.exit(0);
});
