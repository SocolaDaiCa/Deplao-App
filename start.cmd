@echo off
chcp 65001 >nul
:: ===================================================
:: Script khởi động ứng dụng dành cho Windows (CMD)
:: ===================================================

echo.
echo [1/3] Kiểm tra Volta...
where volta >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Volta chưa được cài đặt. Đang tiến hành cài đặt Volta...
    winget install Volta.Volta --silent --accept-source-agreements --accept-package-agreements >nul 2>nul
    if %errorlevel% neq 0 (
        echo [!] Không thể cài bằng winget, đang thử cài đặt qua PowerShell...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://get.volta.sh | iex"
    )
    :: Cập nhật PATH cho phiên làm việc hiện tại
    set "PATH=%LOCALAPPDATA%\Volta\bin;%ProgramFiles%\Volta;%PATH%"
) else (
    echo [✓] Volta đã được cài đặt.
)

echo.
echo [2/3] Kiểm tra node_modules...
if not exist "node_modules\" (
    echo [!] Thư mục node_modules chưa tồn tại. Đang chạy npm install...
    call npm install
) else (
    echo [✓] Thư mục node_modules đã tồn tại.
)

echo.
echo [3/3] Kiểm tra ứng dụng đang chạy...
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -notin @('powershell.exe', 'pwsh.exe', 'cmd.exe') -and $_.CommandLine -like '*electron-vite*' }; if ($p) { exit 0 } else { exit 1 }" >nul 2>nul

if %errorlevel% equ 0 (
    echo [!] Ứng dụng đã đang chạy! Không cần khởi động thêm phiên mới.
    pause
    exit /b 0
)

echo [->] Đang khởi động ứng dụng (npm run dev)...
call npm run dev
