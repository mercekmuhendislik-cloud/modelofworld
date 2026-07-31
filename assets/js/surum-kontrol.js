/* =========================================================
   MODEL OF WORLD — Her sayfada çalışan yardımcılar
   1) Sürüm kontrolü (önbellekte kalan eski sayfayı tazeler)
   2) Temiz adres yönlendirmesi (/sayfa.html → /sayfa)
   3) Şifre alanlarında göster/gizle düğmesi + Caps Lock uyarısı

   --- Sürüm kontrolü ---
   Sunucu HTML için Cache-Control göndermediği için tarayıcılar
   sayfanın eski kopyasını gösterebiliyor. Bu betik sayfanın kendi
   sürüm damgasını (<meta name="mow-surum">) sunucudaki surum.txt ile
   karşılaştırır; farklıysa sayfayı bir kez tazeler.
   Döngü koruması: aynı sürüm için yalnızca bir yenileme denenir.
   ========================================================= */
/* --- Temiz adres: /sayfa.html açıldıysa /sayfa adresine geç --- */
(function () {
  const y = location.pathname;
  if (!/\.html$/i.test(y)) return;
  const hedef = /\/index\.html$/i.test(y) ? "/" : y.replace(/\.html$/i, "");
  location.replace(hedef + location.search + location.hash);
})();

(function () {
  const benim = document.querySelector('meta[name="mow-surum"]')?.content?.trim();
  if (!benim) return;

  fetch("/surum.txt?t=" + Date.now(), { cache: "no-store" })
    .then(r => (r.ok ? r.text() : null))
    .then(metin => {
      const canli = (metin || "").trim();
      if (!canli || canli === benim) return;                    /* güncel */
      if (sessionStorage.getItem("mow-surum-denendi") === canli) return;  /* bir kez dene */
      sessionStorage.setItem("mow-surum-denendi", canli);
      /* Sorgu parametresi değişince tarayıcı önbelleği atlanır */
      const url = new URL(location.href);
      url.searchParams.set("_v", canli);
      location.replace(url.toString());
    })
    .catch(() => { /* çevrimdışı: sessizce geç */ });
})();

/* =========================================================
   Şifre göster / gizle
   "Ne yazdığımı göremiyorum" sorununu çözer; Caps Lock açıksa uyarır.
   Tüm input[type=password] alanlarına kendiliğinden uygulanır
   (yönetici girişi, üye girişi, başvuru formu, panel şifre değiştirme).
   ========================================================= */
(function sifreGozu() {
  const ACIK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const KAPALI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>' +
    '<path d="M3 3l18 18"/></svg>';

  function uygula(inp) {
    if (inp.dataset.gozHazir) return;
    inp.dataset.gozHazir = "1";

    const sar = document.createElement("span");
    sar.className = "sifre-sar";
    inp.parentNode.insertBefore(sar, inp);
    sar.appendChild(inp);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sifre-goz";
    btn.tabIndex = -1;                     /* Tab sırası bozulmasın */
    btn.innerHTML = ACIK;
    btn.title = "Şifreyi göster";
    btn.setAttribute("aria-label", "Şifreyi göster");
    btn.addEventListener("click", () => {
      const gizli = inp.type === "password";
      inp.type = gizli ? "text" : "password";
      btn.innerHTML = gizli ? KAPALI : ACIK;
      btn.title = gizli ? "Şifreyi gizle" : "Şifreyi göster";
      btn.setAttribute("aria-label", btn.title);
      inp.focus();
    });
    sar.appendChild(btn);

    /* Caps Lock açıkken uyar — yanlış şifre denemelerinin sık nedeni */
    const uyari = document.createElement("span");
    uyari.className = "caps-uyari";
    uyari.textContent = "⚠️ Caps Lock açık — şifre büyük harfle yazılıyor.";
    uyari.style.display = "none";
    sar.parentNode.insertBefore(uyari, sar.nextSibling);
    const capsBak = e => {
      const acik = typeof e.getModifierState === "function" && e.getModifierState("CapsLock");
      uyari.style.display = acik ? "" : "none";
    };
    inp.addEventListener("keyup", capsBak);
    inp.addEventListener("keydown", capsBak);
    inp.addEventListener("blur", () => { uyari.style.display = "none"; });
  }

  const tara = () => document.querySelectorAll('input[type="password"]').forEach(uygula);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tara);
  else tara();
  /* Sonradan basılan alanlar (panel/başvuru) için */
  new MutationObserver(tara).observe(document.documentElement, { childList: true, subtree: true });
})();
