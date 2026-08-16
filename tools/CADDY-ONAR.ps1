# =========================================================
#  MODEL OF WORLD — Caddy Yapılandırma Onarımı
#
#  SORUN
#  Caddyfile'dan modelofworld.com bloğu düşmüş; Caddy tanımadığı
#  alan adı için sertifika sunmadığından site HTTPS'te açılmıyor.
#
#  BU BETİK NE YAPAR
#   1) Caddyfile'ı yedekler (tarih damgalı)
#   2) Eksikse modelofworld.com bloğunu ekler — statik site + /api yönlendirmesi
#   3) Yapılandırmayı denetler; bozuksa yedeği geri yükler
#   4) Caddy'yi yeniden yükler (reybotum.com kesintiye uğramaz)
#   5) Siteyi test eder ve sonucu yazar
#
#  SUNUCUDA çalıştırın (yönetici PowerShell):
#    iwr https://raw.githubusercontent.com/mercekmuhendislik-cloud/modelofworld/main/tools/CADDY-ONAR.ps1 -OutFile "$env:TEMP\caddy-onar.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\caddy-onar.ps1"
#
#  Yalnızca ne yapacağını görmek için sonuna  -Dene  ekleyin (dosyaya dokunmaz).
# =========================================================
param(
    [switch]$Dene,
    [string]$Caddyfile = "",
    [string]$SiteKok   = "",
    [string]$CaddyExe  = "",
    [int]$ApiPort      = 8010
)

$ErrorActionPreference = "Continue"
function Baslik($m) { Write-Host ""; Write-Host ("=== " + $m + " ===") -ForegroundColor Cyan }
function Iyi($m)    { Write-Host ("  [TAMAM] " + $m) -ForegroundColor Green }
function Kotu($m)   { Write-Host ("  [SORUN] " + $m) -ForegroundColor Red }
function Bilgi($m)  { Write-Host ("  " + $m) -ForegroundColor Gray }

# ---------- 1) Caddy ve dosyaları bul ----------
Baslik "1. Caddy"
$caddyExe = $CaddyExe
$surec = Get-Process -Name caddy -ErrorAction SilentlyContinue | Select-Object -First 1
if ($surec) {
    try {
        $cmd = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $surec.Id)).CommandLine
        if (-not $caddyExe -and $cmd -match '"?([A-Za-z]:\\[^"]*caddy\.exe)"?') { $caddyExe = $Matches[1] }
        if (-not $Caddyfile -and $cmd -match '--config\s+"?([^"\s]+)"?') { $Caddyfile = $Matches[1] }
    } catch { }
}
if (-not $caddyExe) {
    foreach ($a in @("C:\caddy\caddy.exe","C:\Program Files\Caddy\caddy.exe")) { if (Test-Path $a) { $caddyExe = $a; break } }
}
if (-not $Caddyfile) {
    foreach ($a in @("C:\caddy\Caddyfile","C:\Program Files\Caddy\Caddyfile")) { if (Test-Path $a) { $Caddyfile = $a; break } }
}
if (-not $caddyExe -or -not (Test-Path $caddyExe)) { Kotu "caddy.exe bulunamadi"; exit 1 }
if (-not $Caddyfile -or -not (Test-Path $Caddyfile)) { Kotu "Caddyfile bulunamadi"; exit 1 }
Iyi ("caddy.exe : " + $caddyExe)
Iyi ("Caddyfile : " + $Caddyfile)

# ---------- 2) Site klasörü ----------
Baslik "2. Site klasoru"
if (-not $SiteKok) {
    foreach ($a in @("C:\inetpub\modelofworld","C:\inetpub\wwwroot\modelofworld","C:\ajans-web-sitesi")) {
        if (Test-Path (Join-Path $a "index.html")) { $SiteKok = $a; break }
    }
}
if (-not $SiteKok) { Kotu "index.html iceren site klasoru bulunamadi"; exit 1 }
Iyi ("site klasoru: " + $SiteKok)

# ---------- 3) API ----------
Baslik "3. Uyelik/panel servisi"
try {
    $null = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $ApiPort + "/api/health") -TimeoutSec 6 -UseBasicParsing
    Iyi ("API " + $ApiPort + " portunda yanit veriyor")
} catch {
    Kotu ("API " + $ApiPort + " portunda yanit vermiyor — blok yine de eklenecek, API'yi sonra baslatin")
}

# ---------- 4) Blok zaten var mı? ----------
Baslik "4. Caddyfile icerigi"
$icerik = Get-Content $Caddyfile -Raw
if ($icerik -match "modelofworld") {
    Iyi "Caddyfile'da modelofworld zaten tanimli — dosyaya dokunulmayacak"
    Bilgi "Site yine de acilmiyorsa sorun baska yerde; ciktiyi paylasin."
    exit 0
}
Kotu "Caddyfile'da modelofworld blogu YOK — sitenin kapali olmasinin nedeni bu"

# ---------- 5) Eklenecek blok ----------
$blok = @'

# --- Model of World: statik site + uyelik/panel servisi ---
modelofworld.com, www.modelofworld.com {
	encode zstd gzip
	root * __SITEKOK__

	# Uyelik, panel ve fotograflar Python servisine gider
	handle /api/* {
		reverse_proxy 127.0.0.1:__APIPORT__
	}

	# Temiz adresler: /katalog -> katalog.html
	handle {
		try_files {path} {path}.html {path}/index.html
		file_server
	}
}
'@
# Caddy'de ters egik cizgi kacis karakteri sayilabilir; Windows yolu duz cizgiyle yazilir.
$kokCaddy = $SiteKok.Replace("\", "/")
if ($kokCaddy -match "\s") { $kokCaddy = '"' + $kokCaddy + '"' }
$blok = $blok.Replace("__SITEKOK__", $kokCaddy).Replace("__APIPORT__", [string]$ApiPort)

Baslik "5. Eklenecek blok"
$blok -split "`n" | ForEach-Object { Write-Host ("    " + $_) -ForegroundColor DarkGray }

if ($Dene) { Bilgi "-Dene verildi: dosya degistirilmedi."; exit 0 }

# ---------- 6) Yedekle ve yaz ----------
Baslik "6. Yazma"
$yedek = $Caddyfile + ".yedek-" + (Get-Date -Format "yyyyMMdd-HHmmss")
Copy-Item $Caddyfile $yedek -Force
Iyi ("yedek alindi: " + $yedek)
Add-Content -Path $Caddyfile -Value $blok -Encoding utf8
Iyi "blok eklendi"

# ---------- 7) Denetle ----------
Baslik "7. Yapilandirma denetimi"
$denetim = & $caddyExe validate --config $Caddyfile 2>&1
$gecerli = ($denetim | Out-String) -match "Valid configuration"
if (-not $gecerli) {
    Kotu "yapilandirma gecersiz — yedek geri yukleniyor"
    $denetim | ForEach-Object { Bilgi ("    " + $_) }
    Copy-Item $yedek $Caddyfile -Force
    Iyi "eski Caddyfile geri yuklendi (site eski haliyle kaldi)"
    exit 1
}
Iyi "yapilandirma gecerli"

# ---------- 8) Yeniden yukle ----------
Baslik "8. Caddy yeniden yukleniyor"
$sonuc = & $caddyExe reload --config $Caddyfile 2>&1
if ($LASTEXITCODE -eq 0) { Iyi "caddy yeniden yuklendi (kesintisiz)" }
else {
    Bilgi ("reload olmadi: " + ($sonuc | Out-String).Trim())
    Bilgi "servis yeniden baslatiliyor…"
    $servis = Get-Service -Name caddy -ErrorAction SilentlyContinue
    if ($servis) { Restart-Service caddy -Force; Start-Sleep 6; Iyi "caddy servisi yeniden baslatildi" }
    elseif ($surec) {
        Stop-Process -Id $surec.Id -Force; Start-Sleep 2
        Start-Process -FilePath $caddyExe -ArgumentList @("run","--config",$Caddyfile) -WindowStyle Hidden
        Start-Sleep 8; Iyi "caddy yeniden baslatildi"
    }
}

# ---------- 9) Test ----------
Baslik "9. Site testi"
Bilgi "Sertifika yuklenmesi icin 10 saniye bekleniyor…"
Start-Sleep 10
$basarili = $false
foreach ($deneme in 1..3) {
    try {
        $t = New-Object Net.Sockets.TcpClient("www.modelofworld.com", 443)
        $s = New-Object Net.Security.SslStream($t.GetStream(), $false, { param($a,$b,$c,$d) $true })
        $s.AuthenticateAsClient("www.modelofworld.com")
        $sert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($s.RemoteCertificate)
        Iyi ("HTTPS calisiyor · sertifika bitis: " + $sert.NotAfter)
        $s.Close(); $t.Close()
        $basarili = $true
        break
    } catch {
        Bilgi ("deneme " + $deneme + ": henuz hazir degil, 15 sn bekleniyor…")
        Start-Sleep 15
    }
}

if ($basarili) {
    try {
        $r = Invoke-WebRequest -Uri "https://www.modelofworld.com/" -TimeoutSec 20 -UseBasicParsing
        Iyi ("ana sayfa: " + $r.StatusCode + " · " + $r.RawContentLength + " bayt")
    } catch { Kotu ("ana sayfa acilmadi: " + $_.Exception.Message) }
    foreach ($u in @("https://www.modelofworld.com/katalog","https://www.modelofworld.com/api/health")) {
        try { $r = Invoke-WebRequest -Uri $u -TimeoutSec 20 -UseBasicParsing; Iyi ($u + " -> " + $r.StatusCode) }
        catch { Kotu ($u + " -> " + $_.Exception.Message) }
    }
    Write-Host ""
    Write-Host "  SITE ACILDI. Tarayicida Ctrl+F5 ile yenileyin." -ForegroundColor Green
} else {
    Kotu "HTTPS hala calismiyor."
    Bilgi "Sertifika deposundaki dosyalar eskimis olabilir; Caddy yeni sertifika almayi deneyecektir."
    Bilgi "Birkac dakika sonra tekrar deneyin. Duzelmezse Caddy gunlugunu paylasin:"
    Bilgi ("  Get-Content '" + (Join-Path $env:ProgramData "Caddy\caddy.log") + "' -Tail 40")
}
