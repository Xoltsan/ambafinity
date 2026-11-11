@echo off
title Limusic TikTok Live Request and Vinyl Overlay
cd /d "%~dp0"

echo ============================================================
echo   LIMUSIC TIKTOK LIVE REQUEST AND VINYL OVERLAY SUITE
echo ============================================================
echo.

:: Cek apakah folder node_modules sudah ada
if not exist "node_modules\" (
    echo Menginstal dependensi yang dibutuhkan...
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Gagal menginstal dependensi. Pastikan internet aktif.
        pause
        exit /b %errorlevel%
    )
)

echo Memulai server Limusic TikTok Live...
start http://localhost:3456/control
node server.mjs
pause
