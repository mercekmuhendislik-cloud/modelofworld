/* =========================================================
   VERA AGENCY — Model Detay / Sedcard
   model-detay?id=<talent-id>
   Galeri sekmeleri: Stüdyo / Podyum / Polaroid / Video Book
   ========================================================= */
(function () {
  const { TALENTS, CATEGORIES, LABELS, talentPlaceholder, formatLanguages } = window.VERA;

  const id = new URLSearchParams(location.search).get("id");
  const t = TALENTS.find(x => x.id === id) || TALENTS[0];

  document.title = `${t.name} — Sedcard | VERA Agency`;

  const cat = CATEGORIES[t.category];
  const city = LABELS.city[t.city] || t.city;
  const hair = LABELS.hair[t.hair] || t.hair;
  const eye = LABELS.eye[t.eye] || t.eye;

  /* Sedcard ölçüleri — kategoriye göre alanlar değişir */
  const rows = [
    ["Boy", `${t.height} cm`],
    ...(t.weight ? [["Kilo", `${t.weight} kg`]] : []),
    ["Yaş", t.age],
    ...(t.bust ? [["Göğüs", `${t.bust} cm`], ["Bel", `${t.waist} cm`], ["Basen", `${t.hip} cm`]] : []),
    ...(t.shoe ? [["Ayakkabı", t.shoe]] : []),
    ...(t.size ? [["Beden", t.size]] : []),
    ["Saç", hair],
    ["Göz", eye],
    ["Şehir", city],
    ["Deneyim", t.experience],
  ];

  /* Foto varyantları — kendi çekimleriniz eklenene kadar ana fotoğrafın
     farklı kadraj/tonlarından üretilir (photos.studio vb. doldurulursa onlar kullanılır) */
  const v = (extra, w = 640, h = 854) =>
    `${t.photo}?q=80&auto=format&fit=crop&w=${w}&h=${h}${extra}`;
  const variants = {
    studio:   t.photos?.studio?.length   ? t.photos.studio   : t.photo ? [v("&crop=faces"), v("&crop=entropy"), v("", 640, 960), v("&crop=edges")] : [],
    podium:   t.photos?.podium?.length   ? t.photos.podium   : t.photo ? [v("&crop=top", 640, 960), v("&crop=entropy&con=15"), v("&crop=faces&con=10")] : [],
    polaroid: t.photos?.polaroid?.length ? t.photos.polaroid : t.photo ? [v("&sat=-85"), v("&sat=-85&crop=faces"), v("&sat=-60&con=-5", 640, 960)] : [],
  };

  const media = t.photo
    ? `<img src="${v("&crop=faces", 900, 1200)}" alt="${t.name} — ${cat.label} sedcard fotoğrafı">`
    : talentPlaceholder(t, true);

  document.getElementById("detailRoot").innerHTML = `
    <div class="detail-media reveal in">${media}</div>
    <div>
      <span class="detail-cat">${cat.icon} ${cat.label}</span>
      <div class="detail-name">
        <h1>${t.name}</h1>
      </div>
      <p class="detail-bio">${t.bio}</p>

      <dl class="sedcard">
        ${rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("")}
        <div><dt>Diller</dt><dd style="font-size:1rem;line-height:1.5">${formatLanguages(t) || "—"}</dd></div>
      </dl>

      <div class="tag-row">
        ${t.tags.map(tag => `<span class="tag">${tag}</span>`).join("")}
      </div>

      <div class="detail-actions no-print">
        <a class="btn btn-gold" href="teklif?talent=${t.id}">Bu Profili Talep Et / Kirala</a>
        <button class="btn btn-ghost" onclick="window.print()">Sedcard PDF İndir</button>
        <button class="btn btn-ghost fav-btn" data-fav="${t.id}" style="position:static;width:auto;height:auto;border-radius:999px;padding:14px 24px;background:none;backdrop-filter:none">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 21s-7.5-4.8-10-9.3C.6 8.4 2.4 4.5 6 4.5c2.2 0 3.6 1.2 6 3.8 2.4-2.6 3.8-3.8 6-3.8 3.6 0 5.4 3.9 4 7.2C19.5 16.2 12 21 12 21Z"/></svg>
          &nbsp;Cast Listeme Ekle
        </button>
      </div>
    </div>`;

  /* Detay sayfasındaki kalp durumunu senkronize et */
  if (window.VERA.isFav?.(t.id)) document.querySelector(`.detail-actions .fav-btn`)?.classList.add("active");

  /* ---- Galeri sekmeleri ---- */
  function fillPane(key) {
    const pane = document.querySelector(`#pane-${key} .gallery-grid`);
    if (!pane) return;
    const imgs = variants[key];
    pane.innerHTML = imgs.length
      ? imgs.map(src => `<div class="g-item" data-cursor="Büyüt"><img src="${src}" alt="${t.name} ${key} fotoğrafı" loading="lazy" style="width:100%;height:100%;object-fit:cover;aspect-ratio:3/4"></div>`).join("")
      : Array.from({ length: 3 }, (_, i) =>
          `<div class="g-item" data-cursor="Büyüt">${talentPlaceholder({ ...t, gradient: i % 2 ? [t.gradient[1], t.gradient[0]] : t.gradient })}</div>`).join("");
  }
  ["studio", "podium", "polaroid"].forEach(fillPane);

  /* Video Book sekmesi */
  document.getElementById("pane-video").innerHTML = t.video
    ? `<video controls playsinline style="width:100%;border-radius:14px" src="${t.video}"></video>`
    : `<div class="video-slot">
         <div class="play">▶</div>
         <strong style="color:var(--text)">Video book hazırlanıyor</strong>
         <span>Catwalk / tanıtım videosu için ajansımızla iletişime geçin — talep üzerine WhatsApp'tan iletilir.</span>
       </div>`;

  document.getElementById("galleryTabs").addEventListener("click", e => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll("#galleryTabs .tab-btn").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + btn.dataset.tab));
  });

  /* CTA kişiselleştirme */
  document.getElementById("ctaName").textContent = `${t.name} ile çalışmak ister misiniz?`;
  document.getElementById("ctaQuote").href = `teklif?talent=${t.id}`;
})();
