/* =========================================================
   VERA AGENCY — Analitik & Pazarlama Entegrasyonları (stub)
   Yayına alırken aşağıdaki ID'leri doldurup blokları açın.
   Çerez onayı (cookie consent) alınmadan etkinleştirmeyin —
   kvkk.html'deki çerez politikası da güncellenmelidir.
   ========================================================= */

/* --- Google Tag Manager ---
const GTM_ID = "GTM-XXXXXXX";
(function (w, d, s, l, i) {
  w[l] = w[l] || []; w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  var f = d.getElementsByTagName(s)[0], j = d.createElement(s);
  j.async = true; j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + "&l=" + l;
  f.parentNode.insertBefore(j, f);
})(window, document, "script", "dataLayer", GTM_ID);
*/

/* --- Meta (Facebook) Pixel ---
const PIXEL_ID = "000000000000000";
!function (f, b, e, v, n, t, s) {
  if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
  if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
  t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s)
}(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
fbq("init", PIXEL_ID);
fbq("track", "PageView");
*/

/* Dönüşüm olayları için hazır kancalar:
   - Teklif formu gönderimi  → fbq("track", "Lead") / dataLayer.push({event:"teklif_gonderildi"})
   - Başvuru gönderimi       → dataLayer.push({event:"basvuru_gonderildi"})
   forms.js -> submitTo() içinden çağrılabilir. */
