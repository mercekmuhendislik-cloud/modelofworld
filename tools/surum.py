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

toplam = 0
for f in glob.glob("*.html"):
    s = io.open(f, encoding="utf-8").read()
    yeni, n = pat.subn(r'\1?v=' + stamp, s)
    if n and yeni != s:
        io.open(f, "w", encoding="utf-8").write(yeni)
        toplam += n
print(f"Sürüm damgası uygulandı: v={stamp} ({toplam} bağlantı güncellendi)")
