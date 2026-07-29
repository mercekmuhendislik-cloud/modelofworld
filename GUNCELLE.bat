@echo off
chcp 65001 >nul
title modelofworld.com - Site Guncelleme
cd /d C:\ajans-web-sitesi

echo.
echo  ==========================================
echo   MODELOFWORLD.COM - SITE GUNCELLEME
echo  ==========================================
echo.
echo  Degisiklikler GitHub'a gonderiliyor...
echo.

git add -A
git commit -m "Site guncellemesi - %date% %time%" >nul 2>&1
git push origin main

if %errorlevel%==0 (
  echo.
  echo  ==========================================
  echo   BASARILI!
  echo   Sunucu en gec 3 dakika icinde kendini
  echo   guncelleyecek. Sonra siteyi Ctrl+F5 ile
  echo   yenileyip kontrol edebilirsiniz.
  echo  ==========================================
) else (
  echo.
  echo  !! HATA: Gonderilemedi.
  echo  Internet baglantinizi kontrol edip tekrar deneyin.
)
echo.
pause
