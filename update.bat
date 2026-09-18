@echo off
chcp 65001 >nul
echo ======================================================
echo          影策 (open-ai-canvas) 本地一键更新程序
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/3] 正在检查并拉取最新官方 Release 镜像...
docker pull ghcr.io/ddcat-ai/open-ai-canvas-backend:latest
if errorlevel 1 (
    echo [错误] 后端镜像拉取失败，请检查网络连接。
    pause
    exit /b 1
)

docker pull ghcr.io/ddcat-ai/open-ai-canvas-web:latest
if errorlevel 1 (
    echo [错误] 前端镜像拉取失败，请检查网络连接。
    pause
    exit /b 1
)

echo [2/3] 正在更新本地镜像标签...
docker tag ghcr.io/ddcat-ai/open-ai-canvas-backend:latest open-ai-canvas-backend:local
docker tag ghcr.io/ddcat-ai/open-ai-canvas-web:latest open-ai-canvas-web:local

echo [3/3] 正在平滑重启服务...
docker compose up -d

echo.
echo ======================================================
echo       更新完成！服务已在 http://localhost:3001 启动
echo ======================================================
echo.
pause
