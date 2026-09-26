/* =========================================================
   Beyaz fonlu kapak üretici (yönetim paneli, tarayıcıda çalışır)
   ---------------------------------------------------------
   Bir fotoğrafın arka planını kaldırır, kişiyi beyaz fona 3:4 oturtur,
   tek düzen kadraj uygular ve filigran ekler. Sunucuya hiçbir kütüphane
   kurulmaz: arka plan kaldırma modeli (IMG.LY, ~80 MB) ilk kullanımda
   tarayıcıya iner ve önbellekte kalır.

   Kullanım:
     const s = await window.MOW_BEYAZ.uret(blob, durum => console.log(durum));
     s → { blob, kucuk, uzanti }   ·  hata → throw
   Kadraj kuralı (26 Eyl 2026 toplu düzenlemeyle aynı):
     baş çerçevenin %5 altında; tam boy karede baştan kalçaya (kişi boyunun %58'i)
   ========================================================= */
(function () {
  const CDN = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
  const W = 1200, H = 1600;                 // 3:4 — katalog kartı oranı
  const FILIGRAN = "MODEL OF WORLD ©";
  let modulSoz = null;

  function modul() {
    if (!modulSoz) modulSoz = import(CDN).catch(e => { modulSoz = null; throw e; });
    return modulSoz;
  }

  const toBlob = (c, tur, kalite) => new Promise(res => c.toBlob(res, tur, kalite));

  async function sikistir(c, kalite) {
    let b = await toBlob(c, "image/webp", kalite);
    if (b && /webp/.test(b.type)) return { blob: b, uzanti: ".webp" };
    b = await toBlob(c, "image/jpeg", kalite);
    return b ? { blob: b, uzanti: ".jpg" } : null;
  }

  /* Alfa kanalından kişinin çerçevesini çıkar (küçültülmüş kopya üzerinde — hızlı) */
  function siluet(bmp) {
    const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(bmp, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const satirEn = new Array(c.height).fill(0);
    let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      let n = 0;
      for (let px = 0; px < c.width; px++) {
        if (d[(y * c.width + px) * 4 + 3] > 40) {
          n++;
          if (px < x0) x0 = px; if (px > x1) x1 = px;
        }
      }
      satirEn[y] = n;
      if (n) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;                         // kişi bulunamadı
    /* kaynak koordinatlarına geri ölçekle */
    const s = 1 / k;
    const ph = (y1 - y0 + 1) * s, pw = (x1 - x0 + 1) * s;
    const altBas = Math.max(y0, Math.round(y1 - (y1 - y0) * 0.10));
    let altEn = 0, n = 0;
    for (let y = altBas; y <= y1; y++) { altEn += satirEn[y]; n++; }
    altEn = n ? altEn / n : 0;
    const enGenis = Math.max(...satirEn);
    return { bx0: x0 * s, by0: y0 * s, bx1: (x1 + 1) * s, by1: (y1 + 1) * s, ph, pw,
             ayakGorunur: (y1 + 1) * s < bmp.height * 0.97,
             inceUzun: ph / Math.max(1, pw) > 2.3,
             altDar: altEn < 0.55 * enGenis };
  }

  function kadraj(bmp, sil) {
    const ih = bmp.height;
    let fh, ust;
    const tamBoy = sil.ayakGorunur || sil.inceUzun || sil.altDar;
    if (tamBoy) {
      fh = sil.ph * 0.58 / 0.95;
      ust = Math.max(0, sil.by0 - fh * 0.05);
    } else {
      fh = (ih - sil.by0) / 0.95;
      ust = ih - fh;
      if (ust < 0) { ust = 0; fh = ih; }
    }
    const fw = fh * 3 / 4;
    const cx = (sil.bx0 + sil.bx1) / 2;
    return { fx0: cx - fw / 2, fy0: ust, fw, fh, tamBoy };
  }

  function filigran(x, w, h) {
    const fs = Math.max(14, Math.round(w * 0.032));
    x.font = `bold ${fs}px Georgia, "Times New Roman", serif`;
    x.textAlign = "right"; x.textBaseline = "bottom";
    x.fillStyle = "rgba(120,96,108,.92)";
    x.fillText(FILIGRAN, w - fs * 0.6, h - fs * 0.55);
  }

  async function uret(kaynak, durum) {
    const bildir = m => { try { durum && durum(m); } catch {} };
    bildir("Arka plan kaldırma modeli hazırlanıyor…");
    const mod = await modul();
    const remove = mod.removeBackground || mod.default;
    let sonIlerleme = 0;
    const png = await remove(kaynak, {
      output: { format: "image/png", quality: 1 },
      progress: (anahtar, su, toplam) => {
        if (!toplam) return;
        const y = Math.round(su / toplam * 100);
        if (y !== sonIlerleme && /fetch|download/i.test(anahtar)) {
          sonIlerleme = y; bildir(`Model iniyor… %${y} (yalnızca ilk kullanımda)`);
        }
      }
    });
    bildir("Kadraj ayarlanıyor…");
    const bmp = await createImageBitmap(png);
    const sil = siluet(bmp);
    if (!sil) throw new Error("Fotoğrafta kişi bulunamadı");
    const f = kadraj(bmp, sil);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    const olcek = W / f.fw;
    x.imageSmoothingQuality = "high";
    x.drawImage(bmp, -f.fx0 * olcek, -f.fy0 * olcek, bmp.width * olcek, bmp.height * olcek);
    filigran(x, W, H);
    bildir("Sıkıştırılıyor…");
    const buyuk = await sikistir(c, 0.86);
    if (!buyuk) throw new Error("Görüntü sıkıştırılamadı");
    const kc = document.createElement("canvas");
    kc.width = 480; kc.height = 640;
    kc.getContext("2d").drawImage(c, 0, 0, 480, 640);
    const kucuk = await sikistir(kc, 0.75);
    return { blob: buyuk.blob, uzanti: buyuk.uzanti, kucuk: kucuk ? kucuk.blob : null, tamBoy: f.tamBoy };
  }

  window.MOW_BEYAZ = { uret, DOSYA_ADI: "kapak-beyaz-fon" };
})();
