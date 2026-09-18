@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动影策服务...
docker compose start
echo 服务已启动，请访问 http://localhost:3001
pause
