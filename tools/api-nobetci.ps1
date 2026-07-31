# =========================================================
#  MODEL OF WORLD — API Nöbetçisi
#  Üyelik/panel servisi (server.py) yanıt vermiyorsa yeniden başlatır.
#
#  Kullanım:
#    · Tek seferlik kurtarma  → API-BASLAT.bat
#    · Her dakika nöbet       → NOBETCI-KUR.bat  (zamanlanmış görev kurar)
#
#  Kendi kendini yapılandırır: API çalışırken süreç komut satırından
#  python ve server.py yollarını öğrenip %ProgramData%\ModelOfWorld\
#  nobetci.cfg dosyasına yazar; sonraki çalışmalarda oradan okur.
#
#  GÜVENLİK: Veri klasöründe uye.db yoksa hiçbir şey başlatmaz. Böylece
#  yanlış klasörde boş bir veritabanı oluşup site boş görünmez.
# =========================================================
param(
    [string]$Api  = "",                                 # server.py tam yolu
    [string]$Py   = "",                                 # python.exe tam yolu
    [string]$Veri = "",                                 # veri klasörü (uye.db burada)
    [int]$Port    = 8010,
    [switch]$SadeceKontrol                              # başlatmadan yalnızca durum yaz
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

# ---------- Ayarları belirle: çalışan süreçten öğren → dosyadan oku → adaylardan bul ----------
$surec = CalisanSurec
if ($surec -and $surec.CommandLine -match '^\s*"?([^"]+python[^"]*\.exe)"?\s+"?([^"]+server\.py)"?') {
    if (-not $Py)  { $Py  = $Matches[1] }
    if (-not $Api) { $Api = $Matches[2] }
}
if ((-not $Api -or -not $Py) -and (Test-Path $ayar)) {
    try {
        $o = Get-Content $ayar -Raw | ConvertFrom-Json
        if (-not $Api)  { $Api  = $o.api }
        if (-not $Py)   { $Py   = $o.py }
        if (-not $Veri) { $Veri = $o.veri }
    } catch { }
}
if (-not $Api) {
    foreach ($a in @("C:\inetpub\modelofworld-api\server.py", "C:\inetpub\modelofworld\api\server.py",
                     "C:\inetpub\wwwroot\modelofworld\api\server.py")) {
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

# Öğrenilen ayarları sakla (API kapalıyken de doğru komutla başlatılabilsin)
if ($Api -and $Py -and (Test-Path $Api) -and (Test-Path $Py)) {
    @{ api = $Api; py = $Py; veri = $Veri } | ConvertTo-Json | Set-Content -Path $ayar -Encoding utf8
}

if ($SadeceKontrol) {
    Yaz ("DURUM: saglik={0} · api={1} · python={2} · veri={3}" -f (Saglikli), $Api, $Py, $Veri)
    exit 0
}

# ---------- 1) Çalışıyorsa dokunma ----------
if (Saglikli) { exit 0 }
# ---------- 2) Anlık takılma olabilir, 6 saniye sonra tekrar bak ----------
Start-Sleep -Seconds 6
if (Saglikli) { exit 0 }

# ---------- 3) Ön koşullar ----------
if (-not $Api -or -not (Test-Path $Api)) { Yaz "HATA: server.py bulunamadi ($Api). -Api ile yol verin."; exit 1 }
if (-not $Py  -or -not (Test-Path $Py))  { Yaz "HATA: python.exe bulunamadi ($Py). -Py ile yol verin.";  exit 1 }
if (-not (Test-Path (Join-Path $Veri "uye.db"))) {
    Yaz "HATA: Veri klasorunde uye.db yok ($Veri). Guvenlik icin baslatilmadi."
    exit 1
}

# ---------- 4) Asılı kalmış süreci kapat ----------
$asili = CalisanSurec
if ($asili) {
    Yaz "Yanit vermeyen surec kapatiliyor (PID $($asili.ProcessId))."
    Stop-Process -Id $asili.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

# ---------- 5) Başlat ----------
$env:MOW_DATA = $Veri
Start-Process -FilePath $Py -ArgumentList "`"$Api`"" -WindowStyle Hidden -WorkingDirectory (Split-Path $Api)

foreach ($bekle in 5, 8, 10) {
    Start-Sleep -Seconds $bekle
    if (Saglikli) { Yaz "API yanit vermiyordu, yeniden baslatildi ve saglikli."; exit 0 }
}
Yaz "UYARI: Yeniden baslatildi ama saglik kontrolu gecmedi. Kayit: $kayit"
exit 1
