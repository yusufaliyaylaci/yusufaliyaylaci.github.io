@echo off
set /p msg="Commit mesaji girin: "
set /p ver="Yeni versiyonu girin (orn: v1.0.3): "

:: --- GUVENLIK KONTROLU ---
if exist secrets.bat (
    call secrets.bat
) else (
    echo HATA: secrets.bat dosyasi bulunamadi!
    pause
    exit
)

echo.
echo ==========================================
echo 1. Git Ayarlari Yapiliyor...
echo ==========================================
:: Git islemleri icin token URL icine gomuluyor
git remote set-url origin https://%GH_TOKEN%@github.com/yusufaliyaylaci/yusufaliyaylaci.git

echo.
echo ==========================================
echo 2. Degisiklikler GitHub'a Gonderiliyor...
echo ==========================================
git add .
git commit -m "%msg%"
git push origin main

echo.
echo ==========================================
echo 3. Uygulama Paketleniyor (.exe)...
echo ==========================================
call npm run dist

echo.
echo ==========================================
echo 4. GitHub Release Olusturuluyor...
echo ==========================================
echo Release olusturuluyor: %ver%

:: GitHub CLI (gh), ortamda "GH_TOKEN" degiskeni oldugu icin
:: otomatik olarak onu kullanacak, giris yapmana gerek kalmayacak.
gh release create %ver% "dist/YaliApp Setup %ver:~1%.exe" "dist/latest.yml" --title "YaliApp %ver%" --notes "%msg%"

echo.
echo ==========================================
echo ISLEM TAMAMLANDI! 🚀
echo ==========================================
pause