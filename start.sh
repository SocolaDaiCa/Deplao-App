#!/usr/bin/env bash

# ===================================================
# Script khởi động ứng dụng dành cho Ubuntu và macOS
# ===================================================

echo ""
echo "[1/3] Kiểm tra Volta..."
if ! command -v volta &> /dev/null; then
    echo "[!] Volta chưa được cài đặt. Đang tiến hành cài đặt Volta..."
    curl https://get.volta.sh | bash
    
    # Cấu hình đường dẫn Volta cho phiên làm việc hiện tại
    export VOLTA_HOME="$HOME/.volta"
    export PATH="$VOLTA_HOME/bin:$PATH"
else
    echo "[✓] Volta đã được cài đặt: $(volta --version)"
fi

echo ""
echo "[2/3] Kiểm tra node_modules..."
if [ ! -d "node_modules" ]; then
    echo "[!] Thư mục node_modules chưa có. Đang chạy npm install..."
    npm install
else
    echo "[✓] Thư mục node_modules đã tồn tại."
fi

echo ""
echo "[3/3] Kiểm tra ứng dụng đang chạy..."
# Kiểm tra xem có tiến trình electron-vite nào đang chạy hay không
RUNNING_PID=$(pgrep -f "electron-vite" | grep -v "$$" || true)

if [ -n "$RUNNING_PID" ]; then
    echo "[!] Ứng dụng đã đang chạy (PID: $RUNNING_PID)."
    echo "    Không cần khởi động thêm phiên làm việc mới."
    exit 0
fi

echo "[→] Khởi động ứng dụng (npm run dev)..."
npm run dev
