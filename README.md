# VERA Agency — Web Sitesi

Manken/Model, Fuar Hostesi, Liman & Yat VIP Karşılama, Fotoğraf/Prodüksiyon ve Etkinlik Yönetimi hizmetleri sunan premium ajans web sitesi. Build aracı gerektirmeyen statik HTML/CSS/JS mimarisi.

## Yerelde Çalıştırma

```powershell
# Python varsa:
python -m http.server 8080
# veya Node varsa:
npx serve .
```

`http://localhost:8080` adresini açın. (index.html'e çift tıklamak da çalışır; fotoğraflar için internet bağlantısı gerekir.)

## Sayfalar

| Sayfa | İçerik |
|---|---|
| `index.html` | Hero + hızlı cast arama, sayaçlar, carousel, markalar, projeler, hizmetler, yorumlar |
| `katalog.html` | 12 kriterli filtreleme (kategori, cinsiyet, boy, kilo, ayak, beden, şehir, saç, göz, dil, ehliyet, müsaitlik) |
| `model-detay.html?id=` | Sedcard, galeri sekmeleri (stüdyo/podyum/polaroid/video book), PDF yazdırma |
| `cast-listem.html` | Favori profiller; link paylaşımı (`?ids=`), PDF, toplu teklif |
| `basvuru.html` | 2 aşamalı başvuru sihirbazı + foto kılavuzu + video yükleme + aday SSS |
| `teklif.html` | Teklif modülü + saat aralığı + tahmini bütçe hesaplayıcı + müşteri SSS |
| `hizmetler.html` | 10 hizmet, paket karşılaştırma, üniforma, lokasyon ağı |
| `produksiyon.html` | Çekim türleri, önce/sonra slider, ekip, stüdyo, mekân kataloğu, moodboard, telif |
| `blog.html` | İçerik pazarlaması placeholder'ları + sosyal medya |
| `hakkimizda.html` | Ajans, yasal belgeler, basında biz, sosyal sorumluluk |
| `iletisim.html` | İletişim formu + Google Maps |
| `kvkk.html`, `sozlesme.html` | Hukuki metinler (taslak — avukat onayı gerekli) |

## İçerik Güncelleme (tek dosya: `assets/js/data.js`)

- **AGENCY**: telefon, WhatsApp, e-posta, adres, vergi/MERSİS/İŞKUR bilgileri
- **TALENTS**: profiller. `photo:` alanındaki Unsplash URL'sini kendi çekiminizle değiştirin; `photos: {studio:[], podium:[], polaroid:[]}` doldurulursa sekmelerde onlar kullanılır. `video:` alanına video book URL'si. `available:` müsaitlik rozetini kontrol eder.
- **SERVICES / PACKAGES / LOCATIONS / RATES**: hizmetler, karşılaştırma tablosu, lokasyon ağı, bütçe hesaplayıcı tarifesi (temsili — gerçek tarifeyle güncelleyin)
- **FAQ_CANDIDATES / FAQ_CLIENTS / BLOG_POSTS / BRANDS / TESTIMONIALS / PROJECTS**

> **Gizlilik kuralı:** Yeteneklerin soyadı, telefonu ve kişisel sosyal medyası bu dosyaya asla eklenmez; sitede yalnızca ad + soyad baş harfi yayınlanır.

## Fotoğraflar

Tüm görseller şu an **Unsplash** (ücretsiz lisans) üzerinden geliyor — site gerçek görünür ancak yayın öncesi kendi çekimlerinizle değiştirilmesi önerilir (marka tutarlılığı + aynı kişinin farklı pozları için). WebP/AVIF otomatik: URL'lerdeki `auto=format` parametresi tarayıcıya göre en verimli formatı sunar; `loading="lazy"` tüm kartlarda aktif.

## Yayın Öncesi Yapılacaklar

1. **Form backend'i**: `assets/js/forms.js → submitTo()` — şu an localStorage'a yazıyor (`vera-submissions`). API, Formspree veya CRM webhook (HubSpot/Zoho) bağlanacak.
2. **Analytics**: `assets/js/analytics.js` — GTM ve Meta Pixel blokları hazır/yorumda; ID girip açın, çerez onayı (cookie consent banner) ekleyin.
3. **Alan adı**: `data.js AGENCY.domain`, OG etiketleri, `sitemap.xml`, `robots.txt` içindeki `modelofworld.com` değerlerini gerçek alan adıyla değiştirin.
4. **Hukuki metinler**: kvkk.html ve sozlesme.html avukat onayından geçmeli; footer'daki vergi/MERSİS numaraları doldurulmalı.
5. **Showreel**: `assets/media/showreel.mp4` ekleyip index.html'deki yorumu açın.
6. **Hosting**: Statik hosting yeterli — Cloudflare Pages / Vercel / Netlify (ücretsiz CDN + SSL + %100 uptime).

## Backend Gerektiren (İleri Faz) Özellikler

- Aday profil paneli (model login) ve başvuru durum sorgulama
- Kurumsal müşteri paneli (geçmiş fatura/sözleşme)
- Online ödeme / sanal POS (iyzico, PayTR vb.)
- Etkinlik sonrası otomatik anket e-postası
- Canlı Instagram/TikTok feed (API onayı gerekir)
- Çoklu dil (i18n) — içerik çevirisi ile birlikte
- Model detay sayfaları için sunucu tarafı SEO (SSG/CMS'e geçiş)
