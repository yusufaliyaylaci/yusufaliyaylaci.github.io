@echo off
setlocal enabledelayedexpansion

:: ==========================================
:: [ONEMLI] CALISMA DIZININI AYARLA
:: ==========================================
cd /d "%~dp0"

:: --- AYARLAR ---
set GH_TOKEN=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

:: ==========================================
:: [KONTROL] DOCKER DURUMU
:: ==========================================
echo.
echo [INFO] Docker durumu kontrol ediliyor...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Docker bulunamadi!
    echo Lutfen Docker Desktop uygulamasini acin ve 'Engine Running' yazisini bekleyin.
    pause
    exit /b 1
)
echo [OK] Docker aktif.

:: --- GIRIS ---
set /p msg="Commit mesaji girin: "
set /p ver="Yeni versiyonu girin (orn: v1.0.0): "

set cleanVer=%ver:~1%

echo.
echo ==========================================
echo 1. Dosyalar Guncelleniyor (Otomasyon)...
echo ==========================================

call npm version %ver% --no-git-tag-version --allow-same-version
powershell -Command "$c = (Get-Content sw.js) -replace 'const CACHE_NAME = ''.*'';', 'const CACHE_NAME = ''yali-blog-%ver%'';'; Set-Content -Path sw.js -Value $c"
powershell -Command "$c = (Get-Content index.html) -replace 'css/style.css\?v=[^\"]*', 'css/style.css?v=%ver%'; Set-Content -Path index.html -Value $c"
powershell -Command "$c = (Get-Content index.html) -replace 'js/main.js\?v=[^\"]*', 'js/main.js?v=%ver%'; Set-Content -Path index.html -Value $c"
powershell -Command "$c = (Get-Content index.html) -replace 'js/ui_helper.js\?v=[^\"]*', 'js/ui_helper.js?v=%ver%'; Set-Content -Path index.html -Value $c"

echo Dosyalar basariyla %ver% surumune guncellendi!

echo.
echo ==========================================
echo 2. Git Ayarlari ve Push Islemi...
echo ==========================================
git remote set-url origin https://%GH_TOKEN%@github.com/yusufaliyaylaci/yusufaliyaylaci.github.io.git
git add .
git commit -m "%msg% (%ver%)"
git push origin main

echo.
echo ==========================================
echo 3. Windows Surumu Paketleniyor (.exe)...
echo ==========================================
call npm run dist -- --win
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Windows build islemi basarisiz oldu!
    pause
    exit /b 1
)

echo.
echo ==========================================
echo 4. Linux Surumleri Paketleniyor (deb, rpm, pacman)...
echo ==========================================
echo [BILGI] Docker baslatiliyor... Bu islem ilk seferde imaj indirecegi icin uzun surebilir.
echo Lutfen bekleyin, pencereyi kapatmayin.

:: --- KRITIK DUZELTME: TEK SATIR DOCKER KOMUTU ---
:: node_modules klasorunu Windows'tan Linux'a tasimiyoruz (hatayi onlemek icin).
:: Docker icinde sifirdan npm install yapiyoruz.

docker run --rm -v "%cd%":/project -v /project/node_modules -v "%LOCALAPPDATA%\electron\Cache":/root/.cache/electron -v "%LOCALAPPDATA%\electron-builder\Cache":/root/.cache/electron-builder electronuserland/builder:wine /bin/bash -c "npm install && npm run dist -- --linux"

if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Linux build islemi Docker icinde basarisiz oldu!
    echo Docker Desktop'in acik oldugundan emin olun.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo 5. GitHub Release Olusturuluyor ve Dosyalar Yukleniyor...
echo ==========================================
echo Release olusturuluyor: %ver%

:: Dosya isimlerini garantiye almak icin wildcards kullaniyoruz
set FILES_TO_UPLOAD="dist/YaliApp-Setup-%cleanVer%.exe" "dist/YaliApp-%cleanVer%-linux.deb" "dist/YaliApp-%cleanVer%-linux.rpm" "dist/YaliApp-%cleanVer%-linux.pacman" "dist/latest.yml"

gh release create %ver% %FILES_TO_UPLOAD% --title "YaliApp %ver%" --notes "%msg%"

echo.
echo ==========================================
echo ISLEM TAMAMLANDI! 🚀
echo Windows ve Linux kurulum dosyalari yayinda.
echo ==========================================
pause