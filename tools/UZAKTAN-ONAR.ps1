# =========================================================
#  MODEL OF WORLD — Sunucuyu Uzaktan Onar
#
#  NE İŞE YARAR
#  Site açılmadığında sunucuya uzaktan bağlanıp teşhis/onarım
#  betiğini orada çalıştırır. Sunucuya uzak masaüstüyle girmenize
#  gerek kalmaz.
#
#  NASIL ÇALIŞTIRILIR (KENDİ bilgisayarınızda)
#    1) Başlat → PowerShell'e sağ tık → "Yönetici olarak çalıştır"
#    2) Şunu yapıştırın:
#         cd C:\ajans-web-sitesi
#         powershell -ExecutionPolicy Bypass -File tools\UZAKTAN-ONAR.ps1
#    3) Açılan pencereye sunucunun kullanıcı adı ve şifresini yazın.
#       (Şifre maskeli sorulur; hiçbir yere kaydedilmez.)
#
#  Yalnızca durum görmek, hiçbir şeye dokunmamak için:
#         powershell -ExecutionPolicy Bypass -File tools\UZAKTAN-ONAR.ps1 -SadeceBak
# =========================================================
param(
    [string]$Sunucu = "185.190.142.221",
    [switch]$SadeceBak
)

$ErrorActionPreference = "Continue"
function Baslik($m) { Write-Host ""; Write-Host ("=== " + $m + " ===") -ForegroundColor Cyan }
function Iyi($m)    { Write-Host ("  [TAMAM] " + $m) -ForegroundColor Green }
function Kotu($m)   { Write-Host ("  [SORUN] " + $m) -ForegroundColor Red }
function Bilgi($m)  { Write-Host ("  " + $m) -ForegroundColor Gray }

$teshis = Join-Path $PSScriptRoot "SUNUCU-TESHIS.ps1"
if (-not (Test-Path $teshis)) { Kotu ("SUNUCU-TESHIS.ps1 bulunamadi: " + $teshis); exit 1 }

Baslik "1. Sunucuya erisim"
$acik = Test-NetConnection -ComputerName $Sunucu -Port 5986 -WarningAction SilentlyContinue
if (-not $acik.TcpTestSucceeded) {
    Kotu "Sunucunun uzaktan yonetim portu (5986) kapali."
    Bilgi "Bu durumda sunucuya uzak masaustuyle baglanip su tek satiri calistirin:"
    Bilgi '  iwr https://raw.githubusercontent.com/mercekmuhendislik-cloud/modelofworld/main/tools/SUNUCU-TESHIS.ps1 -OutFile "$env:TEMP\mow.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\mow.ps1"'
    exit 1
}
Iyi "uzaktan yonetim portu acik (5986)"

Baslik "2. Giris bilgileri"
Bilgi "Sunucunun kullanici adi ve sifresi soruluyor (sifre maskelidir, kaydedilmez)."
$kimlik = Get-Credential -Message "Model of World sunucusu ($Sunucu) yonetici girisi"
if (-not $kimlik) { Kotu "Giris iptal edildi."; exit 1 }

# Sunucunun sertifikasi genelde kendinden imzalidir; adres/ad kontrolu atlanir.
$secenek = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck -OperationTimeout 180000

Baslik "3. Baglanti"
$oturum = $null
foreach ($yontem in @("Negotiate", "Basic")) {
    try {
        $oturum = New-PSSession -ComputerName $Sunucu -Port 5986 -UseSSL -Credential $kimlik `
                                -Authentication $yontem -SessionOption $secenek -ErrorAction Stop
        Iyi ("baglandi (" + $yontem + ")")
        break
    } catch {
        Bilgi ($yontem + " ile olmadi: " + ($_.Exception.Message -split "`n")[0])
    }
}
if (-not $oturum) {
    Kotu "Sunucuya baglanilamadi."
    Bilgi "Sik nedenler: kullanici adi/sifre hatali · kullanici yonetici degil ·"
    Bilgi "sunucuda 'Basic' kimlik dogrulama kapali. Bu durumda uzak masaustunu kullanin."
    exit 1
}

try {
    Baslik "4. Sunucuda teshis/onarim"
    Bilgi "Betik sunucuya gonderiliyor ve orada calistiriliyor. Bu birkac dakika surebilir…"
    Write-Host ""
    $kod = Get-Content $teshis -Raw
    Invoke-Command -Session $oturum -ScriptBlock {
        param($betikMetni, $sadeceBak)
        # Betigi sunucunun gecici klasorune yaz (BOM'lu: Turkce karakterler bozulmasin)
        $yol = Join-Path $env:TEMP "mow-teshis.ps1"
        Set-Content -Path $yol -Value $betikMetni -Encoding utf8
        if ($sadeceBak) { & powershell -NoProfile -ExecutionPolicy Bypass -File $yol -SadeceBak }
        else            { & powershell -NoProfile -ExecutionPolicy Bypass -File $yol }
    } -ArgumentList $kod, $SadeceBak.IsPresent

    Baslik "5. Site simdi acik mi?"
    Start-Sleep 5
    try {
        $t = New-Object Net.Sockets.TcpClient("www.modelofworld.com", 443)
        $s = New-Object Net.Security.SslStream($t.GetStream(), $false, { param($a,$b,$c,$d) $true })
        $s.AuthenticateAsClient("www.modelofworld.com"); $s.Close(); $t.Close()
        Iyi "HTTPS calisiyor — siteyi Ctrl+F5 ile deneyin."
    } catch {
        Kotu "HTTPS hala calismiyor."
        Bilgi "Yukaridaki 8. bolumde yazan Caddyfile icerigini ve hata satirlarini bana iletin."
    }
} finally {
    if ($oturum) { Remove-PSSession $oturum }
}
