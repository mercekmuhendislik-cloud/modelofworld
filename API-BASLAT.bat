@echo off
chcp 65001 >nul
title Model of World - API Baslat
echo ============================================================
echo   MODEL OF WORLD - Uyelik/Panel Servisini Baslat
echo ============================================================
echo.
echo Bu dosya, yonetici paneli ve uye girisi calismadiginda
echo (502 hatasi) servisi yeniden baslatir.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\api-nobetci.ps1"
echo.
echo ------------------------------------------------------------
echo Islem bitti. Simdi modelofworld.com/admin adresini deneyin.
echo Kayit dosyasi: %ProgramData%\ModelOfWorld\nobetci.log
echo ------------------------------------------------------------
pause
