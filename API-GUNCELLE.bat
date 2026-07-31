@echo off
chcp 65001 >nul
title Model of World - Bekleyen Sunucu Guncellemesini Uygula
echo ============================================================
echo   BEKLEYEN SUNUCU GUNCELLEMESINI UYGULA
echo ============================================================
echo.
echo Uyelik/panel servisi (API) bellekteki kodla calisir. Yeni bir
echo guncelleme indiginde servis yeniden baslatilmadan devreye
echo girmez. Bu dosya yeni kodu kopyalar ve servisi yeniden baslatir.
echo.
echo Kesinti suresi: yaklasik 5-10 saniye.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\api-nobetci.ps1" -Zorla -Site "%~dp0."
echo.
echo ------------------------------------------------------------
echo Bitti. Kayit: %ProgramData%\ModelOfWorld\nobetci.log
echo ------------------------------------------------------------
pause
