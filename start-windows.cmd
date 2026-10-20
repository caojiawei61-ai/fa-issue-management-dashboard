@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Install Node.js 22.13 or newer first. & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>&1 || (echo Update Node.js to version 22.13 or newer. & pause & exit /b 1)
node --input-type=module -e "import('@earendil-works/pi-ai/providers/all').then(m=>m.builtinModels().getProviders()).catch(()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
  if exist "package-lock.json" (
    call npm ci --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
  ) else (
    call npm install --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
  )
)
if not defined FA_AI_PORT set "FA_AI_PORT=8779"
set /a FA_AI_PORT_END=%FA_AI_PORT%+4
for /l %%P in (%FA_AI_PORT%,1,%FA_AI_PORT_END%) do call :tryport %%P
echo Could not start FA Issue Dashboard v0.0.0. Ports %FA_AI_PORT%-%FA_AI_PORT_END% are occupied or the release version check failed.
pause
exit /b 1

:tryport
set "CANDIDATE=%1"
set "FOUND_VERSION="
for /f "delims=" %%V in ('powershell -NoProfile -Command "try{$h=Invoke-RestMethod -TimeoutSec 1 http://127.0.0.1:%CANDIDATE%/api/health;$p=(Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:%CANDIDATE%/).Content;if($h.appVersion -eq '0.0.0' -and $h.buildId -eq 'baseline-r0' -and $h.packageRoot -eq (Get-Location).Path -and $p -match 'FA Issue Dashboard v0.0.0'){'0.0.0'}}catch{''}"') do set "FOUND_VERSION=%%V"
if "%FOUND_VERSION%"=="0.0.0" goto openport
netstat -ano | findstr /r /c:":%CANDIDATE% .*LISTENING" >nul && exit /b 0
set "FA_AI_PORT=%CANDIDATE%"
start "FA Dashboard v0.0.0" /min cmd /c "set FA_AI_PORT=%CANDIDATE%&& node server.mjs"
for /l %%W in (1,1,20) do powershell -NoProfile -Command "Start-Sleep -Milliseconds 250; try{$h=Invoke-RestMethod -TimeoutSec 1 http://127.0.0.1:%CANDIDATE%/api/health;$p=(Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:%CANDIDATE%/).Content;if($h.appVersion -eq '0.0.0' -and $h.buildId -eq 'baseline-r0' -and $h.packageRoot -eq (Get-Location).Path -and $p -match 'FA Issue Dashboard v0.0.0'){exit 0}else{exit 1}}catch{exit 1}" && goto openport
exit /b 0

:openport
start "" "http://127.0.0.1:%CANDIDATE%/"
exit 0
