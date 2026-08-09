# =========================================================
#  MODEL OF WORLD — Sunucu Teşhis ve Kurtarma
#
#  NE ZAMAN KULLANILIR
#  Site açılmıyorsa (tarayıcı "güvenli bağlantı kurulamadı" /
#  "bu siteye ulaşılamıyor" diyorsa) SUNUCUDA çalıştırın —
#  kendi bilgisayarınızda değil, uzak masaüstüyle bağlandığınız makinede.
#
#  NASIL ÇALIŞTIRILIR (dosyayı aramanıza gerek yok)
#  Başlat → PowerShell'e sağ tık → "Yönetici olarak çalıştır" → şunu yapıştırın:
#
#    iwr https://raw.githubusercontent.com/mercekmuhendislik-cloud/modelofworld/main/tools/SUNUCU-TESHIS.ps1 -OutFile "$env:TEMP\mow-teshis.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\mow-teshis.ps1"
#
#  Yalnızca durum görmek, hiçbir şeye dokunmamak için sonuna  -SadeceBak  ekleyin.
# =========================================================
param(
    [switch]$SadeceBak,
    [string]$Alan = "www.modelofworld.com"
)

$ErrorActionPreference = "Continue"
function Baslik($m) { Write-Host ""; Write-Host ("=== " + $m + " ===") -ForegroundColor Cyan }
function Iyi($m)    { Write-Host ("  [TAMAM] " + $m) -ForegroundColor Green }
function Kotu($m)   { Write-Host ("  [SORUN] " + $m) -ForegroundColor Red }
function Bilgi($m)  { Write-Host ("  " + $m) -ForegroundColor Gray }

$sorunlar = @()
$yonetici = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $yonetici) { Kotu "Yönetici yetkisi yok — servis başlatma adımları çalışmayabilir." }

# ---------- 0) Bu makine gerçekten sunucu mu? ----------
Baslik "0. Makine kontrolü"
$webVar = (Get-NetTCPConnection -State Listen -LocalPort 80 -ErrorAction SilentlyContinue) -or
          (Get-NetTCPConnection -State Listen -LocalPort 443 -ErrorAction SilentlyContinue)
if (-not $webVar) {
    Kotu "Bu makinede 80/443 dinlenmiyor — burası site sunucusu değil."
    Bilgi "Bu betiği sitenin barındığı sunucuda (uzak masaüstüyle bağlandığınız makinede) çalıştırın."
    Bilgi "Yine de aşağıdaki kontroller dışarıdan yapılabilenlerle sınırlı sürecek."
} else { Iyi "80/443 bu makinede dinleniyor — sunucudasınız" }

# ---------- 1) Site klasörü nerede? ----------
Baslik "1. Site klasörü"
$siteKok = $null
foreach ($a in @("C:\inetpub\modelofworld", "C:\inetpub\wwwroot\modelofworld", "C:\ajans-web-sitesi",
                 "C:\modelofworld", "C:\site\modelofworld", "C:\web\modelofworld")) {
    if (Test-Path (Join-Path $a "index.html")) { $siteKok = $a; break }
}
if ($siteKok) { Iyi "site klasörü: $siteKok" }
else {
    Kotu "index.html içeren site klasörü bulunamadı (bilinen yollarda)"
    Bilgi "Caddy'nin yapılandırmasındaki 'root' satırı hangi klasörü gösteriyorsa orasıdır."
}

# ---------- 2) Caddy ----------
Baslik "2. Web sunucusu (Caddy)"
$caddyServis = Get-Service -Name caddy -ErrorAction SilentlyContinue
$caddySurec  = Get-Process -Name caddy -ErrorAction SilentlyContinue
$caddyExe = $null; $caddyfile = $null

if ($caddySurec) {
    Iyi ("caddy çalışıyor (PID " + $caddySurec.Id + ")")
    try {
        $cmd = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $caddySurec.Id)).CommandLine
        Bilgi ("komut: " + $cmd)
        if ($cmd -match '"?([A-Za-z]:\\[^"]*caddy\.exe)"?') { $caddyExe = $Matches[1] }
        if ($cmd -match '--config\s+"?([^"\s]+)"?')          { $caddyfile = $Matches[1] }
    } catch { }
} elseif ($caddyServis -and $caddyServis.Status -eq "Running") {
    Iyi "caddy servisi çalışıyor"
} else {
    Kotu "caddy çalışmıyor"; $sorunlar += "caddy-kapali"
}
if (-not $caddyExe) {
    $k = Get-Command caddy.exe -ErrorAction SilentlyContinue
    if ($k) { $caddyExe = $k.Source }
    else { foreach ($a in @("C:\caddy\caddy.exe","C:\Program Files\Caddy\caddy.exe","C:\tools\caddy\caddy.exe")) {
             if (Test-Path $a) { $caddyExe = $a; break } } }
}
if ($caddyExe) { Bilgi ("caddy.exe: " + $caddyExe) } else { Kotu "caddy.exe bulunamadı" }

if (-not $caddyfile) {
    foreach ($a in @("C:\caddy\Caddyfile","C:\Program Files\Caddy\Caddyfile","C:\tools\caddy\Caddyfile",
                     "C:\Caddyfile","C:\inetpub\Caddyfile")) {
        if (Test-Path $a) { $caddyfile = $a; break }
    }
}
if ($caddyfile) { Iyi ("Caddyfile: " + $caddyfile) } else { Kotu "Caddyfile bulunamadı" }

# ---------- 3) HTTPS el sıkışması ----------
Baslik "3. HTTPS (sertifika)"
try {
    $tcp = New-Object Net.Sockets.TcpClient($Alan, 443)
    $ssl = New-Object Net.Security.SslStream($tcp.GetStream(), $false, { param($a,$b,$c,$d) $true })
    $ssl.AuthenticateAsClient($Alan)
    $sert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
    Iyi ("sertifika sunuluyor: " + $sert.Subject)
    Bilgi ("veren : " + $sert.Issuer)
    Bilgi ("bitiş : " + $sert.NotAfter)
    $kalan = ($sert.NotAfter - (Get-Date)).Days
    if ($kalan -lt 0)      { Kotu ("süresi " + [Math]::Abs($kalan) + " gün önce dolmuş"); $sorunlar += "sertifika" }
    elseif ($kalan -lt 10) { Kotu ($kalan + " gün sonra bitiyor — yenilenmiyor olabilir") }
    $ssl.Close(); $tcp.Close()
} catch {
    Kotu "HTTPS el sıkışması başarısız — Caddy geçerli sertifika sunamıyor. SİTENİN KAPALI OLMASININ NEDENİ BU."
    $sorunlar += "sertifika"
}

# ---------- 4) Sertifika deposu ----------
Baslik "4. Caddy sertifika deposu"
$depolar = @(
    (Join-Path $env:ProgramData "Caddy\certificates"),
    (Join-Path $env:APPDATA     "Caddy\certificates"),
    "C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy\certificates"
) | Where-Object { Test-Path $_ }
if ($depolar) {
    foreach ($d in $depolar) {
        $crt = Get-ChildItem $d -Recurse -Filter *.crt -ErrorAction SilentlyContinue
        if ($crt) { Iyi ($d + " → " + $crt.Count + " sertifika dosyası")
                    $crt | Select-Object -First 4 | ForEach-Object { Bilgi ("  " + $_.Name + "  (" + $_.LastWriteTime + ")") } }
        else { Kotu ($d + " boş — Caddy hiç sertifika alamamış"); $sorunlar += "sertifika-yok" }
    }
} else {
    Kotu "Caddy sertifika klasörü bulunamadı — hiç sertifika alınmamış olabilir"
    $sorunlar += "sertifika-yok"
}

# ---------- 5) ACME doğrulama yolu ----------
Baslik "5. Let's Encrypt doğrulama yolu (80 portu)"
try {
    $r = Invoke-WebRequest -Uri ("http://" + $Alan + "/.well-known/acme-challenge/test") `
         -MaximumRedirection 0 -TimeoutSec 10 -UseBasicParsing -ErrorAction SilentlyContinue
    $kod = $r.StatusCode
} catch { $kod = $_.Exception.Response.StatusCode.value__ }
if ($kod -eq 308 -or $kod -eq 301 -or $kod -eq 302) {
    Kotu ("doğrulama yolu https'e yönlendiriliyor (" + $kod + ") — Let's Encrypt sertifika veremez")
    Bilgi "Caddyfile'da elle yazılmış bir http→https yönlendirmesi bu yolu da kapatıyor olabilir."
    $sorunlar += "acme-yonlendirme"
} elseif ($kod -eq 404) { Iyi "doğrulama yolu açık (404 normaldir)" }
else { Bilgi ("doğrulama yolu yanıtı: " + $kod) }

# ---------- 6) Caddy günlüğü ----------
Baslik "6. Caddy günlüğü (son satırlar)"
$gunlukler = @("C:\caddy\caddy.log","C:\caddy\access.log","C:\Program Files\Caddy\caddy.log",
               (Join-Path $env:ProgramData "Caddy\caddy.log")) | Where-Object { Test-Path $_ }
if ($gunlukler) {
    foreach ($g in $gunlukler) {
        Bilgi ("--- " + $g + " ---")
        Get-Content $g -Tail 25 -ErrorAction SilentlyContinue |
            Where-Object { $_ -match "error|cert|acme|tls|fail" } | Select-Object -Last 12 |
            ForEach-Object { Write-Host ("    " + $_) -ForegroundColor DarkYellow }
    }
} else {
    Bilgi "Dosya günlüğü bulunamadı. Windows olay günlüğüne bakılıyor (10 saniye ile sınırlı):"
    try {
        Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = (Get-Date).AddDays(-3) } `
            -MaxEvents 250 -ErrorAction Stop |
            Where-Object { $_.ProviderName -like "*caddy*" -or $_.Message -like "*caddy*" } |
            Select-Object -First 10 |
            ForEach-Object { Write-Host ("    " + $_.TimeCreated + "  " + (($_.Message -split "`n")[0])) -ForegroundColor DarkYellow }
    } catch { Bilgi "olay günlüğünde caddy kaydı yok" }
}

# ---------- 7) Üyelik/panel servisi ----------
Baslik "7. Üyelik / panel servisi (API)"
try {
    $s = Invoke-WebRequest -Uri "http://127.0.0.1:8010/api/health" -TimeoutSec 6 -UseBasicParsing
    if ($s.StatusCode -eq 200) { Iyi "API yanıt veriyor" }
} catch { Kotu "API yanıt vermiyor (panel ve üye girişi 502 verir)"; $sorunlar += "api-kapali" }

$cfg = Join-Path $env:ProgramData "ModelOfWorld\nobetci.cfg"
if (Test-Path $cfg) {
    try {
        $o = Get-Content $cfg -Raw | ConvertFrom-Json
        $bozuk = $false
        if (-not $o.api  -or -not (Test-Path $o.api))                       { $bozuk = $true }
        if (-not $o.veri -or -not (Test-Path (Join-Path $o.veri "uye.db"))) { $bozuk = $true }
        if ($o.api -like "*Temp*" -or $o.veri -like "*Temp*")               { $bozuk = $true }
        if ($bozuk) { Kotu "nöbetçi ayar dosyası bozuk (geçersiz yol gösteriyor)"; $sorunlar += "nobetci" }
        else { Iyi "nöbetçi ayarları tutarlı" }
    } catch { Kotu "nobetci.cfg okunamadı"; $sorunlar += "nobetci" }
}

# ---------- 8) Onarım ----------
Baslik "8. Onarım"
if (-not $sorunlar.Count) { Iyi "Sunucu tarafında sorun görünmüyor."; return }
Bilgi ("Bulunanlar: " + ($sorunlar -join ", "))
if ($SadeceBak) { Bilgi "Yalnızca durum istendi — hiçbir şey değiştirilmedi."; return }

if ($sorunlar -contains "nobetci") {
    Remove-Item $cfg -Force -ErrorAction SilentlyContinue
    Iyi "Bozuk nobetci.cfg silindi — doğru yollar yeniden öğrenilecek"
}

if ($sorunlar -contains "api-kapali") {
    $nob = Join-Path $env:ProgramData "ModelOfWorld\api-nobetci.ps1"
    if (-not (Test-Path $nob) -and $siteKok) { $nob = Join-Path $siteKok "tools\api-nobetci.ps1" }
    if (Test-Path $nob) { Bilgi "API nöbetçisi çalıştırılıyor…"; & powershell -NoProfile -ExecutionPolicy Bypass -File $nob }
    else { Kotu "api-nobetci.ps1 bulunamadı" }
}

if ($sorunlar -match "sertifika|caddy") {
    if ($caddyfile -and $caddyExe) {
        Bilgi "Caddy yapılandırması denetleniyor…"
        & $caddyExe validate --config $caddyfile 2>&1 | ForEach-Object { Bilgi ("    " + $_) }
    }
    if ($caddyServis) {
        try { Restart-Service caddy -Force -ErrorAction Stop; Start-Sleep 6; Iyi "caddy servisi yeniden başlatıldı" }
        catch { Kotu ("caddy yeniden başlatılamadı: " + $_.Exception.Message) }
    } elseif ($caddySurec -and $caddyExe -and $caddyfile) {
        try {
            Stop-Process -Id $caddySurec.Id -Force
            Start-Sleep 2
            Start-Process -FilePath $caddyExe -ArgumentList @("run","--config",$caddyfile) -WindowStyle Hidden
            Start-Sleep 8
            Iyi "caddy yeniden başlatıldı"
        } catch { Kotu ("caddy başlatılamadı: " + $_.Exception.Message) }
    } else { Kotu "caddy yeniden başlatılamadı — caddy.exe veya Caddyfile yolu bilinmiyor" }

    Bilgi "Yeniden deneniyor…"
    Start-Sleep 5
    try {
        $t2 = New-Object Net.Sockets.TcpClient($Alan, 443)
        $s2 = New-Object Net.Security.SslStream($t2.GetStream(), $false, { param($a,$b,$c,$d) $true })
        $s2.AuthenticateAsClient($Alan); $s2.Close(); $t2.Close()
        Iyi "HTTPS artık çalışıyor — siteyi Ctrl+F5 ile deneyin."
    } catch {
        Kotu "HTTPS hâlâ çalışmıyor. Sertifika alınamıyor demektir."
        Bilgi "Sık görülen dört neden:"
        Bilgi "  1) 80 portu internete kapalı (güvenlik duvarı / modem yönlendirmesi) — doğrulama yapılamaz"
        Bilgi "  2) Caddyfile'daki genel http→https yönlendirmesi /.well-known/acme-challenge yolunu da kapatıyor"
        Bilgi "  3) Let's Encrypt haftalık deneme sınırı aşılmış (çok sık yeniden başlatma) — birkaç saat beklemek gerekir"
        Bilgi ("  4) Sunucu saati yanlis olabilir - sertifika dogrulamasi saate duyarlidir. Sunucu saati: " + (Get-Date))
        if ($caddyfile) {
            Bilgi ""
            Bilgi ("Caddyfile içeriği (" + $caddyfile + "):")
            Get-Content $caddyfile | ForEach-Object { Write-Host ("    " + $_) -ForegroundColor DarkGray }
        }
    }
}
