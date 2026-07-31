# =========================================================
#  MODEL OF WORLD — API Nöbetçisi
#  1) Servis (server.py) yanıt vermiyorsa yeniden başlatır.
#  2) Web köküne yeni bir server.py indiyse onu API klasörüne kopyalar ve
#     servisi yeniden başlatır — yoksa API bellekteki eski kodla çalışmaya
#     devam eder ve yapılan sunucu güncellemeleri devreye girmez.
#
#  Kullanım:
#    · Her dakika nöbet      → NOBETCI-KUR.bat  (zamanlanmış görev kurar)
#    · Tek seferlik kurtarma → API-BASLAT.bat
#    · Bekleyen güncellemeyi
#      hemen uygula          → API-GUNCELLE.bat   (-Zorla)
#
#  Kendi kendini yapılandırır: API çalışırken süreç komut satırından python ve
#  server.py yollarını öğrenip %ProgramData%\ModelOfWorld\nobetci.cfg dosyasına
#  yazar; sonraki çalışmalarda oradan okur.
#
#  GÜVENLİK: Veri klasöründe uye.db yoksa hiçbir şey başlatmaz. Böylece yanlış
#  klasörde boş bir veritabanı oluşup site boş görünmez.
# =========================================================
param(
    [string]$Api  = "",     # server.py tam yolu (API klasöründeki çalışan kopya)
    [string]$Py   = "",     # python.exe tam yolu
    [string]$Veri = "",     # veri klasörü (uye.db burada)
    [string]$Site = "",     # web kökü (içinde api\server.py güncel kopya bulunur)
    [int]$Port    = 8010,
    [switch]$SadeceKontrol, # başlatmadan yalnızca durum yaz
    [switch]$Zorla          # sağlıklı olsa da yeniden başlat (bekleyen kodu yükler)
)

$ErrorActionPreference = "Continue"
$klasor = Join-Path $env:ProgramData "ModelOfWorld"
if (-not (Test-Path $klasor)) { New-Item -ItemType Directory -Path $klasor -Force | Out-Null }
$kayit = Join-Path $klasor "nobetci.log"
$ayar  = Join-Path $klasor "nobetci.cfg"

function Yaz($metin) {
    $satir = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $metin
    Add-Content -Path $kayit -Value $satir -Encoding utf8
    Write-Host $satir
}
function Saglikli {
    try { return ((Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5 -UseBasicParsing).StatusCode -eq 200) }
    catch { return $false }
}
function CalisanSurec {
    try {
        return Get-CimInstance Win32_Process -Filter "Name like '%python%'" |
               Where-Object { $_.CommandLine -and $_.CommandLine -like "*server.py*" } |
               Select-Object -First 1
    } catch { return $null }
}
function Ozet($yol) {
    try { return (Get-FileHash -Path $yol -Algorithm SHA256).Hash } catch { return "" }
}

# ---------- Ayarlar: çalışan süreçten öğren → dosyadan oku → adaylardan bul ----------
$surec = CalisanSurec
if ($surec -and $surec.CommandLine -match '^\s*"?([^"]+python[^"]*\.exe)"?\s+"?([^"]+server\.py)"?') {
    if (-not $Py)  { $Py  = $Matches[1] }
    if (-not $Api) { $Api = $Matches[2] }
}
if ((-not $Api -or -not $Py -or -not $Site) -and (Test-Path $ayar)) {
    try {
        $o = Get-Content $ayar -Raw | ConvertFrom-Json
        if (-not $Api)  { $Api  = $o.api }
        if (-not $Py)   { $Py   = $o.py }
        if (-not $Veri) { $Veri = $o.veri }
        if (-not $Site) { $Site = $o.site }
    } catch { }
}
if (-not $Api) {
    foreach ($a in @("C:\inetpub\modelofworld-api\server.py", "C:\inetpub\modelofworld\api\server.py")) {
        if (Test-Path $a) { $Api = $a; break }
    }
}
if (-not $Py) {
    $k = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($k) { $Py = $k.Source }
    else {
        foreach ($a in @("C:\Program Files\Python314\python.exe", "C:\Program Files\Python313\python.exe",
                         "C:\Program Files\Python312\python.exe", "C:\Program Files\Python311\python.exe")) {
            if (Test-Path $a) { $Py = $a; break }
        }
    }
}
if (-not $Veri) { $Veri = "C:\inetpub\modelofworld-data" }
if (-not $Site) {
    foreach ($a in @("C:\inetpub\modelofworld", "C:\inetpub\wwwroot\modelofworld")) {
        if (Test-Path (Join-Path $a "index.html")) { $Site = $a; break }
    }
}

# Öğrenilenleri sakla (API kapalıyken de doğru komut bilinsin)
if ($Api -and $Py) {
    @{ api = $Api; py = $Py; veri = $Veri; site = $Site } | ConvertTo-Json | Set-Content -Path $ayar -Encoding utf8
}

if ($SadeceKontrol) {
    Yaz ("DURUM: saglik={0} · api={1} · python={2} · veri={3} · site={4}" -f (Saglikli), $Api, $Py, $Veri, $Site)
    exit 0
}

# ---------- Bekleyen kod güncellemesi var mı? ----------
$kodGuncellendi = $false
if ($Site -and $Api) {
    $yeni = Join-Path $Site "api\server.py"
    if ((Test-Path $yeni) -and (Test-Path $Api) -and ((Ozet $yeni) -ne (Ozet $Api))) {
        try {
            Copy-Item -Path $yeni -Destination $Api -Force
            $kodGuncellendi = $true
            Yaz "Yeni server.py web kokunden API klasorune kopyalandi."
        } catch { Yaz ("UYARI: server.py kopyalanamadi: " + $_.Exception.Message) }
    }
}

# ---------- Sağlıklıysa ve yapacak iş yoksa çık ----------
if ((Saglikli) -and -not $kodGuncellendi -and -not $Zorla) { exit 0 }
if (-not (Saglikli) -and -not $kodGuncellendi -and -not $Zorla) {
    Start-Sleep -Seconds 6                    # anlık takılma olabilir
    if (Saglikli) { exit 0 }
}

# ---------- Ön koşullar ----------
if (-not $Api -or -not (Test-Path $Api)) { Yaz "HATA: server.py bulunamadi ($Api)."; exit 1 }
if (-not $Py  -or -not (Test-Path $Py))  { Yaz "HATA: python.exe bulunamadi ($Py).";  exit 1 }
if (-not (Test-Path (Join-Path $Veri "uye.db"))) {
    Yaz "HATA: Veri klasorunde uye.db yok ($Veri). Guvenlik icin baslatilmadi."
    exit 1
}

# ---------- Çalışan süreci kapat ----------
$asili = CalisanSurec
if ($asili) {
    Stop-Process -Id $asili.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

# ---------- Başlat ----------
$env:MOW_DATA = $Veri
Start-Process -FilePath $Py -ArgumentList "`"$Api`"" -WindowStyle Hidden -WorkingDirectory (Split-Path $Api)

$sebep = if ($kodGuncellendi) { "yeni kod yuklendi" } elseif ($Zorla) { "elle yeniden baslatildi" } else { "yanit vermiyordu" }
foreach ($bekle in 5, 8, 10) {
    Start-Sleep -Seconds $bekle
    if (Saglikli) { Yaz "API yeniden baslatildi ve saglikli ($sebep)."; exit 0 }
}
Yaz "UYARI: Yeniden baslatildi ama saglik kontrolu gecmedi ($sebep). Kayit: $kayit"
exit 1
