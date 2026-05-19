@echo off
title 豆韵 - 一键启动

echo.
echo   ╔══════════════════════════════════╗
echo   ║      豆韵 · 传统纹样拼豆工具      ║
echo   ║      一键启动中，请稍候...        ║
echo   ╚══════════════════════════════════╝
echo.

cd /d "%~dp0"

:: 先检查是否已有运行中的 dev server
curl -s -o nul -w "%%{http_code}" http://localhost:3000 > %temp%\douyun_test.txt 2>&1
set /p STATUS=<%temp%\douyun_test.txt
if "%STATUS%"=="200" goto ALREADY_RUNNING

:: 启动 npm run dev（最小化新窗口）
start /min "豆韵服务器" cmd /c "npm run dev"

:: 等待服务器启动（最多 15 秒）
echo 正在启动开发服务器，请稍候...
set WAIT_COUNT=0
:WAIT_LOOP
set /a WAIT_COUNT+=1
if %WAIT_COUNT% gtr 15 goto TIMEOUT
ping 127.0.0.1 -n 2 > nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000 > %temp%\douyun_test.txt 2>&1
set /p STATUS=<%temp%\douyun_test.txt
if "%STATUS%"=="200" goto STARTED
goto WAIT_LOOP

:TIMEOUT
echo.
echo 服务器启动似乎较慢，请手动访问 http://localhost:3000
goto LAUNCH

:ALREADY_RUNNING
echo 检测到服务器已在运行。
goto LAUNCH

:STARTED
echo 服务器已就绪！
goto LAUNCH

:LAUNCH
:: 打开欢迎页面 + 网站
start "" "%~dp0打开豆韵.html"
timeout /t 1 /nobreak > nul
start http://localhost:3000
echo.
echo 浏览器已打开，享受创作吧！
echo.
echo 按任意键关闭此窗口（服务器将继续在后台运行）...
pause > nul
