@echo off
setlocal
cd /d "%~dp0"
title OmiComic

if not exist "node_modules\.bin\electron.cmd" goto missing_dependencies
if not exist "dist\index.html" goto build_application
if not exist "dist-electron\main.js" goto build_application
goto launch_application

:build_application
echo Building OmiComic for the first launch...
call npm.cmd run build
if errorlevel 1 goto launch_failed

:launch_application
node_modules\electron\dist\electron.exe . %*
if errorlevel 1 goto launch_failed
exit /b 0

:missing_dependencies
echo OmiComic dependencies are not installed.
echo Run npm.cmd install in this folder, then launch OmiComic.cmd again.
pause
exit /b 1

:launch_failed
echo.
echo OmiComic could not start. Review the error output above.
pause
exit /b 1
