@echo off
chcp 65001 >nul
title Model of World - API Nobetcisi Kurulumu
echo ============================================================
echo   MODEL OF WORLD - API NOBETCISI KURULUMU
echo ============================================================
echo.
echo Her dakika uyelik/panel servisini kontrol eder; cokmusse
echo kendiliginden yeniden baslatir. Boylece 502 hatasi en fazla
echo bir dakika surer.
echo.
echo NOT: Bu dosyaya SAG TIKLAYIP "Yonetici olarak calistir"
echo      demeniz gerekir.
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [HATA] Yonetici yetkisi yok.
  echo        Dosyaya sag tiklayip "Yonetici olarak calistir" secin.
  echo.
  pause
  exit /b 1
)

set HEDEF=%ProgramData%\ModelOfWorld
if not exist "%HEDEF%" mkdir "%HEDEF%"
copy /Y "%~dp0tools\api-nobetci.ps1" "%HEDEF%\api-nobetci.ps1" >nul
if errorlevel 1 (
  echo [HATA] tools\api-nobetci.ps1 kopyalanamadi.
  pause
  exit /b 1
)

echo Once mevcut durumu ogreniyorum...
powershell -NoProfile -ExecutionPolicy Bypass -File "%HEDEF%\api-nobetci.ps1" -SadeceKontrol -Site "%~dp0."
echo.

echo Zamanlanmis gorev olusturuluyor...
schtasks /create /tn "MOW-API-Nobetci" /sc minute /mo 1 /ru SYSTEM /rl HIGHEST /f ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File \"%HEDEF%\api-nobetci.ps1\""
if errorlevel 1 (
  echo [HATA] Gorev olusturulamadi.
  pause
  exit /b 1
)

echo.
echo Gorev hemen bir kez calistiriliyor...
schtasks /run /tn "MOW-API-Nobetci" >nul
timeout /t 8 >nul

echo.
echo ============================================================
echo   KURULUM TAMAM
echo ============================================================
echo   Gorev adi   : MOW-API-Nobetci  (her dakika)
echo   Betik       : %HEDEF%\api-nobetci.ps1
echo   Kayit       : %HEDEF%\nobetci.log
echo.
echo   Kaldirmak icin:  schtasks /delete /tn "MOW-API-Nobetci" /f
echo ============================================================
echo.
pause
