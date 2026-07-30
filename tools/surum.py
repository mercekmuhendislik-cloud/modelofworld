# -*- coding: utf-8 -*-
"""
Sürüm damgalayıcı — her dağıtımda CSS/JS bağlantılarına ?v=<git-hash> ekler.
Böylece ziyaretçi tarayıcıları eski dosyaları önbellekten göstermez.
GUNCELLE.bat bu betiği commit'ten önce otomatik çalıştırır.
"""
import io, re, glob, os, subprocess

os.chdir(os.path.join(os.path.dirname(__file__), ".."))

try:
    stamp = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode().strip()
except Exception:
    import time
    stamp = time.strftime("%Y%m%d%H%M")

pat = re.compile(r'(assets/(?:css|js)/[a-zA-Z0-9_\-]+\.(?:css|js))(\?v=[a-zA-Z0-9]+)?')

# Sunucu HTML için Cache-Control göndermiyor; sayfalar kendi sürümünü
# surum.txt ile karşılaştırıp eski kaldıysa bir kez tazeleniyor.
io.open("surum.txt", "w", encoding="utf-8").write(stamp + "\n")

META = '<meta name="mow-surum" content="%s">' % stamp
BETIK = '<script src="assets/js/surum-kontrol.js?v=%s"></script>' % stamp

toplam = damga = 0
for f in glob.glob("*.html"):
    s = io.open(f, encoding="utf-8").read()
    yeni, n = pat.subn(r'\1?v=' + stamp, s)

    # Sürüm damgası <head> içinde güncel tutulur
    if 'name="mow-surum"' in yeni:
        yeni = re.sub(r'<meta name="mow-surum" content="[^"]*">', META, yeni)
    else:
        yeni = yeni.replace("</head>", "  " + META + "\n</head>", 1)
        damga += 1

    # Tazeleme betiği her sayfada bulunur (sürüm damgası pat ile güncellenir)
    if "surum-kontrol.js" not in yeni:
        yeni = yeni.replace("</body>", "  " + BETIK + "\n</body>", 1)
        damga += 1

    if yeni != s:
        io.open(f, "w", encoding="utf-8").write(yeni)
        toplam += n
print(f"Sürüm damgası uygulandı: v={stamp} ({toplam} bağlantı, {damga} sayfa donanımı)")
