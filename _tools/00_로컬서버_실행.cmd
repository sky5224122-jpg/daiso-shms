@echo off
cd /d "%~dp0.."
echo.
echo  === SHMS Local Server ===
echo.
echo  URL  : http://localhost:8899
echo  Stop : Ctrl + C
echo.
start "" http://localhost:8899
python -m http.server 8899
