@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo 正在啟動 Node.js 伺服器...
echo ========================================
nodemon server.js
pause
