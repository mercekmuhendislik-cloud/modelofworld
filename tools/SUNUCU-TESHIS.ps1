# =========================================================
#  MODEL OF WORLD — Sunucu Teşhis ve Kurtarma
#
#  NE ZAMAN KULLANILIR
#  Site açılmıyorsa (tarayıcı "güvenli bağlantı kurulamadı" /
#  "site ulaşılamıyor" diyorsa) SUNUCUDA çalıştırın — kendi
#  bilgisayarınızda değil, uzak masaüstüyle bağlandığınız makinede.
#
#  NASIL ÇALIŞTIRILIR
#  Başlat → PowerShell'e sağ tık → "Yönetici olarak çalıştır" →
#      powershell -ExecutionPolicy Bypass -File C:\ajans-web-sitesi\tools\SUNUCU-TESHIS.ps1
#
#  Yalnızca durum görmek isterseniz sonuna  -SadeceBak  ekleyin.
# =========================================================
param(
    [switch]$SadeceBak,                       # hiçbir şeyi yeniden başlatma, yalnızca rapor ver
    [string]$Alan = "www.modelofworld.com"
)

$ErrorActionPreference = "Continue"
function Baslik($m) { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Cyan }
function Iyi($m)    { Write-Host "  [TAMAM] $m" -ForegroundColor Green }
function Kotu($m)   { Write-Host "  [SORUN] $m" -ForegroundColor Red }
function Bilgi($m)  { Write-Host "  $m" -ForegroundColor Gray }

$sorunlar = @()

# ---------- 1) Web sunucusu (Caddy) ayakta mı? ----------
Baslik "1. Web sunucusu (Caddy)"
$caddyServis = Get-Service -Name caddy -ErrorAction SilentlyContinue
$caddySurec  = Get-Process -Name caddy -ErrorAction SilentlyContinue
if ($caddyServis) {
    if ($caddyServis.Status -eq "Running") { Iyi "caddy servisi çalışıyor" }
    else { Kotu "caddy servisi durmuş (durum: $($caddyServis.Status))"; $sorunlar += "caddy-durmus" }
} elseif ($caddySurec) {
    Iyi "caddy süreci çalışıyor (servis olarak kurulu değil, PID $($caddySurec.Id))"
} else {
    Kotu "caddy hiç çalışmıyor"; $sorunlar += "caddy-yok"
}

# ---------- 2) Portlar ----------
Baslik "2. Portlar"
foreach ($p in 80, 443, 8010) {
    $dinleniyor = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
    if ($dinleniyor) { Iyi "$p dinleniyor" } else { Kotu "$p dinlenmiyor"; $sorunlar += "port-$p" }
}

# ---------- 3) HTTPS gerçekten çalışıyor mu? ----------
Baslik "3. HTTPS el sıkışması"
try {
    $tcp = New-Object Net.Sockets.TcpClient($Alan, 443)
    $ssl = New-Object Net.Security.SslStream($tcp.GetStream(), $false, { $true })
    $ssl.AuthenticateAsClient($Alan)
    $sert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
    Iyi "sertifika sunuluyor: $($sert.Subject)"
    Bilgi "veren : $($sert.Issuer)"
    Bilgi "bitiş : $($sert.NotAfter)"
    $kalan = ($sert.NotAfter - (Get-Date)).Days
    if ($kalan -lt 0)      { Kotu "sertifikanın süresi $([Math]::Abs($kalan)) gün önce dolmuş"; $sorunlar += "sertifika-bitmis" }
    elseif ($kalan -lt 10) { Kotu "sertifika $kalan gün sonra bitiyor — yenilenmiyor olabilir" }
    $ssl.Close(); $tcp.Close()
} catch {
    Kotu "HTTPS el sıkışması başarısız — sunucu geçerli sertifika sunamıyor"
    Bilgi $_.Exception.Message
    $sorunlar += "tls-elsikisma"
}

# ---------- 4) Üyelik/panel servisi ----------
Baslik "4. Üyelik / panel servisi (API)"
try {
    $s = Invoke-WebRequest -Uri "http://127.0.0.1:8010/api/health" -TimeoutSec 6 -UseBasicParsing
    if ($s.StatusCode -eq 200) { Iyi "API yanıt veriyor" }
} catch {
    Kotu "API yanıt vermiyor (panel ve üye girişi 502 verir)"
    $sorunlar += "api-kapali"
}

# ---------- 5) Nöbetçi ayar dosyası doğru mu? ----------
Baslik "5. Nöbetçi ayarları"
$cfg = Join-Path $env:ProgramData "ModelOfWorld\nobetci.cfg"
if (Test-Path $cfg) {
    try {
        $o = Get-Content $cfg -Raw | ConvertFrom-Json
        Bilgi "api  : $($o.api)"
        Bilgi "veri : $($o.veri)"
        $bozuk = $false
        if (-not $o.api -or -not (Test-Path $o.api))                    { Kotu "ayardaki server.py yolu geçersiz"; $bozuk = $true }
        if (-not $o.veri -or -not (Test-Path (Join-Path $o.veri "uye.db"))) { Kotu "ayardaki veri klasöründe uye.db yok"; $bozuk = $true }
        if ($o.api -like "*Temp*" -or $o.veri -like "*Temp*")           { Kotu "ayar geçici (Temp) bir klasörü gösteriyor"; $bozuk = $true }
        if ($bozuk) { $sorunlar += "nobetci-ayari" } else { Iyi "nöbetçi ayarları tutarlı" }
    } catch { Kotu "nobetci.cfg okunamadı"; $sorunlar += "nobetci-ayari" }
} else {
    Bilgi "nobetci.cfg yok — ilk çalıştırmada kendisi oluşturur"
}

# ---------- 6) Kurtarma ----------
Baslik "6. Kurtarma"
if (-not $sorunlar.Count) {
    Iyi "Sunucu tarafında sorun görünmüyor. Site hâlâ açılmıyorsa alan adı (DNS) ayarlarına bakın."
    return
}
if ($SadeceBak) {
    Bilgi "Yalnızca durum istendi; hiçbir şey değiştirilmedi. Onarmak için -SadeceBak olmadan çalıştırın."
    return
}

if ($sorunlar -contains "nobetci-ayari") {
    Remove-Item $cfg -Force -ErrorAction SilentlyContinue
    Iyi "Bozuk nobetci.cfg silindi — nöbetçi doğru yolları yeniden öğrenecek"
}

if ($sorunlar -match "caddy") {
    if ($caddyServis) {
        try { Restart-Service caddy -Force -ErrorAction Stop; Start-Sleep 4; Iyi "caddy servisi yeniden başlatıldı" }
        catch { Kotu "caddy yeniden başlatılamadı: $($_.Exception.Message)" }
    } else {
        Kotu "caddy servis olarak kurulu değil — elle başlatmanız gerekiyor (caddy run --config <Caddyfile>)"
    }
}

if ($sorunlar -contains "api-kapali") {
    $nob = Join-Path $env:ProgramData "ModelOfWorld\api-nobetci.ps1"
    if (-not (Test-Path $nob)) { $nob = "C:\ajans-web-sitesi\tools\api-nobetci.ps1" }
    if (Test-Path $nob) {
        Bilgi "API nöbetçisi çalıştırılıyor…"
        & powershell -NoProfile -ExecutionPolicy Bypass -File $nob
    } else { Kotu "api-nobetci.ps1 bulunamadı" }
}

if ($sorunlar -contains "tls-elsikisma" -or $sorunlar -contains "sertifika-bitmis") {
    Baslik "Sertifika sorunu — elle bakılması gerekenler"
    Bilgi "Caddy sertifikayı Let's Encrypt'ten kendisi alır. Alamıyorsa nedeni günlüğünde yazar."
    Bilgi "Günlüğü görmek için (kurulumunuza göre biri):"
    Bilgi "   Get-Content C:\caddy\caddy.log -Tail 40"
    Bilgi "   Get-EventLog -LogName Application -Source caddy -Newest 40"
    Bilgi "Sık görülen nedenler:"
    Bilgi "   · 80 portu dışarıya kapalı — Let's Encrypt doğrulaması yapamıyor (güvenlik duvarı / modem yönlendirmesi)"
    Bilgi "   · Caddyfile'da http bloğunda genel yönlendirme /.well-known/acme-challenge yolunu da kapatıyor"
    Bilgi "   · Aynı alan adı için çok fazla deneme yapılmış (Let's Encrypt haftalık sınırı)"
    Bilgi "   · Sunucu saati yanlış — sertifika doğrulaması saate duyarlıdır"
}

Baslik "Özet"
Bilgi ("Bulunan sorunlar: " + ($sorunlar -join ", "))
Bilgi "İşlem sonrası siteyi Ctrl+F5 ile deneyin."
