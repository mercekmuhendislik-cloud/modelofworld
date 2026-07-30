/* =========================================================
   MODEL OF WORLD — Sürüm kontrolü
   Sunucu HTML için Cache-Control göndermediği için tarayıcılar
   sayfanın eski kopyasını gösterebiliyor. Bu betik sayfanın kendi
   sürüm damgasını (<meta name="mow-surum">) sunucudaki surum.txt ile
   karşılaştırır; farklıysa sayfayı bir kez tazeler.
   Döngü koruması: aynı sürüm için yalnızca bir yenileme denenir.
   ========================================================= */
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
