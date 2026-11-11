@echo off
title AmbaFinity - TikTok Live Pusat Interaksi and Vinyl Overlay Suite
cd /d "%~dp0"

echo ============================================================
echo   AMBAFINITY - TIKTOK LIVE PUSAT INTERAKSI AND VINYL SUITE
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

echo Memulai server AmbaFinity...
start http://localhost:3456/control
node server.mjs
pause
