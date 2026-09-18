@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在停止服务...
docker compose stop
echo 服务已停止。
pause
