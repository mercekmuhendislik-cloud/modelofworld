/* =========================================================
   MODEL OF WORLD — Model Detay / Sedcard
   model-detay?id=<talent-id>
   Bölümler: kırıntı yolu → sedcard → galeri (sekmeli, ışık kutulu)
             → önceki/sonraki model → Diğer Modellerimiz → teklif bandı
   ========================================================= */
(function () {
  const {
    TALENTS, CATEGORIES, LABELS, talentPlaceholder, formatLanguages,
    renderTalentCard, observeNew,
  } = window.VERA;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const SITE = "https://www.modelofworld.com";

  const istenenId = new URLSearchParams(location.search).get("id");
  const t = TALENTS.find(x => x.id === istenenId);

  /* Kategori listesi (gerçek üyelerde birden fazla olabilir) */
  const katsOf = x => (x.categories && x.categories.length ? x.categories : [x.category]).filter(Boolean);

  /* ---------------------------------------------------------
     Profil bulunamadı: sessizce başka profil göstermek yerine açıkla
     --------------------------------------------------------- */
  if (!t) {
    document.title = "Profil bulunamadı — Model of World";
    $("krinti").innerHTML =
      `<a href="/">Ana Sayfa</a><span class="ayrac">›</span><a href="katalog">Cast / Katalog</a>` +
      `<span class="ayrac">›</span><strong>Bulunamadı</strong>`;
    $("detailRoot").innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 20px">
        <div style="font-size:2.6rem;color:var(--gold)">🔍</div>
        <h1 style="font-size:clamp(1.6rem,4vw,2.4rem);margin:12px 0 10px">Bu profil bulunamadı</h1>
        <p class="muted" style="max-width:46ch;margin-inline:auto">Aradığınız profil kaldırılmış veya bağlantı hatalı olabilir.
        Aşağıdaki kadromuzdan devam edebilir ya da katalogda arama yapabilirsiniz.</p>
        <div class="mt-3"><a class="btn btn-gold" href="katalog">Kataloğa Git →</a></div>
      </div>`;
    document.querySelector(".gallery-strip")?.remove();
    $("modelGez")?.remove();
    $("benzerBaslik").textContent = "Kadromuzdan Seçmeler";
    benzerleriYaz(TALENTS.slice(0, 8), "");
    document.querySelector(".cta-band")?.remove();
    return;
  }

  const cat = CATEGORIES[t.category] || { label: "Model", short: "Model", icon: "◆" };
  const city = LABELS.city[t.city] || t.city || "";
  const hair = LABELS.hair[t.hair] || t.hair || "";
  const eye = LABELS.eye[t.eye] || t.eye || "";

  /* ---------------------------------------------------------
     Sayfa üst verileri (başlık, açıklama, canonical, paylaşım kartı)
     --------------------------------------------------------- */
  const baslik = `${t.name} — ${cat.label}${city ? " · " + city : ""} | Model of World`;
  const ozet = [
    `${t.name}, Model of World kadrosunda ${cat.label.toLowerCase()}.`,
    t.height ? `Boy ${t.height} cm.` : "",
    city ? `Şehir: ${city}.` : "",
    "Ölçü kartı, portfolyo ve müsaitlik bilgisi için teklif isteyin.",
  ].filter(Boolean).join(" ");
  document.title = baslik;
  const meta = (sec, deger) => { const el = document.querySelector(sec); if (el) el.setAttribute("content", deger); };
  meta('meta[name="description"]', ozet);
  meta('meta[property="og:title"]', baslik);
  meta('meta[property="og:description"]', ozet);
  meta('meta[name="twitter:title"]', baslik);
  meta('meta[name="twitter:description"]', ozet);
  const sayfaUrl = `${SITE}/model-detay?id=${encodeURIComponent(t.id)}`;
  meta('meta[property="og:url"]', sayfaUrl);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", sayfaUrl);
  const kapak = t.photo ? (t.real ? SITE + t.photo : `${t.photo}?q=80&auto=format&fit=crop&w=1200&h=630&crop=faces`) : "";
  if (kapak) { meta('meta[property="og:image"]', kapak); meta('meta[name="twitter:image"]', kapak); }

  /* ---------------------------------------------------------
     Kırıntı yolu (+ arama motorları için BreadcrumbList)
     --------------------------------------------------------- */
  $("krinti").innerHTML = [
    `<a href="/">Ana Sayfa</a>`,
    `<a href="katalog">Cast / Katalog</a>`,
    `<a href="katalog?cat=${t.category}">${esc(cat.label)}</a>`,
    `<strong>${esc(t.name)}</strong>`,
  ].join('<span class="ayrac">›</span>');

  const ld = $("ldJson");
  if (ld) ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Cast / Katalog", item: SITE + "/katalog" },
          { "@type": "ListItem", position: 3, name: cat.label, item: `${SITE}/katalog?cat=${t.category}` },
          { "@type": "ListItem", position: 4, name: t.name, item: sayfaUrl },
        ],
      },
      {
        "@type": "Person",
        name: t.name,
        jobTitle: cat.label,
        url: sayfaUrl,
        ...(kapak ? { image: kapak } : {}),
        ...(t.height ? { height: `${t.height} cm` } : {}),
        ...(city ? { homeLocation: { "@type": "Place", name: city } } : {}),
        ...(t.languages?.length ? { knowsLanguage: t.languages } : {}),
        worksFor: { "@type": "Organization", name: "Model of World", url: SITE },
      },
    ],
  });

  /* ---------------------------------------------------------
     Ölçü kartı — boş alanlar gösterilmez
     --------------------------------------------------------- */
  const rows = [
    ["Boy", t.height && `${t.height} cm`],
    ["Kilo", t.weight && `${t.weight} kg`],
    ["Yaş", t.age || ""],
    ["Göğüs", t.bust && `${t.bust} cm`],
    ["Bel", t.waist && `${t.waist} cm`],
    ["Basen", t.hip && `${t.hip} cm`],
    ["Ayakkabı", t.shoe || ""],
    ["Beden", t.size || ""],
    ["Saç", hair],
    ["Göz", eye],
    ["Şehir", city],
    ["Deneyim", t.experience || ""],
  ].filter(([, v]) => v);

  /* Foto varyantları — gerçek üyede yalnızca kendi yüklediği fotoğraflar,
     demo profilde ana fotoğrafın farklı kadraj/tonları */
  const v = (extra, w = 640, h = 854) => `${t.photo}?q=80&auto=format&fit=crop&w=${w}&h=${h}${extra}`;
  const albumler = t.real
    ? {
        studio: t.photos?.studio || [], podium: t.photos?.podium || [], polaroid: t.photos?.polaroid || [],
      }
    : {
        studio:   t.photos?.studio?.length   ? t.photos.studio   : t.photo ? [v("&crop=faces"), v("&crop=entropy"), v("", 640, 960), v("&crop=edges")] : [],
        podium:   t.photos?.podium?.length   ? t.photos.podium   : t.photo ? [v("&crop=top", 640, 960), v("&crop=entropy&con=15"), v("&crop=faces&con=10")] : [],
        polaroid: t.photos?.polaroid?.length ? t.photos.polaroid : t.photo ? [v("&sat=-85"), v("&sat=-85&crop=faces"), v("&sat=-60&con=-5", 640, 960)] : [],
      };
  const tumFotolar = [...albumler.studio, ...albumler.podium, ...albumler.polaroid];

  const anaFoto = t.photo ? (t.real ? t.photo : v("&crop=faces", 900, 1200)) : "";
  const media = anaFoto
    ? `<img src="${anaFoto}" alt="${esc(t.name)} — ${esc(cat.label)} sedcard fotoğrafı" data-buyut="0">`
    : talentPlaceholder(t, true);

  /* ---------------------------------------------------------
     Üst blok
     --------------------------------------------------------- */
  const katEtiketleri = katsOf(t).map(k => {
    const c = CATEGORIES[k];
    return c ? `<a href="katalog?cat=${k}" title="${esc(c.label)} kategorisindeki tüm profiller">${c.icon} ${esc(c.label)}</a>` : "";
  }).join("");

  $("detailRoot").innerHTML = `
    <div class="detail-media reveal in">${media}</div>
    <div>
      <span class="detail-cat">${cat.icon} ${esc(cat.label)}</span>
      <div class="detail-name"><h1>${esc(t.name)}</h1></div>
      <div class="detail-meta">
        ${katEtiketleri}
        ${city ? `<a href="katalog?q=${encodeURIComponent(t.city)}" title="${esc(city)} şehrindeki profiller">📍 ${esc(city)}</a>` : ""}
        ${t.available ? '<a class="musait" href="teklif?talent=' + t.id + '" title="Uygunluk takvimi için teklif isteyin">✓ Müsait</a>' : ""}
        ${tumFotolar.length ? `<a href="#galeri">📷 ${tumFotolar.length} fotoğraf</a>` : ""}
      </div>
      ${t.bio ? `<p class="detail-bio">${esc(t.bio)}</p>` : '<div style="height:18px"></div>'}

      <dl class="sedcard">
        ${rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join("")}
        ${formatLanguages(t) ? `<div><dt>Diller</dt><dd style="font-size:1rem;line-height:1.5">${esc(formatLanguages(t))}</dd></div>` : ""}
      </dl>

      ${t.tags?.length ? `<div class="tag-row">${t.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>` : ""}

      <div class="detail-actions no-print">
        <a class="btn btn-gold" href="teklif?talent=${t.id}">Bu Profili Talep Et / Kirala</a>
        <a class="btn btn-ghost" href="sedcard?id=${t.id}" target="_blank">Sedcard (PDF / Yazdır)</a>
        <button class="btn btn-ghost fav-btn" data-fav="${t.id}" style="position:static;width:auto;height:auto;border-radius:999px;padding:14px 24px;background:none;backdrop-filter:none">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 21s-7.5-4.8-10-9.3C.6 8.4 2.4 4.5 6 4.5c2.2 0 3.6 1.2 6 3.8 2.4-2.6 3.8-3.8 6-3.8 3.6 0 5.4 3.9 4 7.2C19.5 16.2 12 21 12 21Z"/></svg>
          &nbsp;Cast Listeme Ekle
        </button>
      </div>

      <div class="paylas-row no-print">
        <span id="paylasEtiket">Profili paylaş</span>
        <button class="paylas-btn" id="paylasWa" title="WhatsApp ile paylaş" aria-label="WhatsApp ile paylaş">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.1 14.2c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.7-.1-.4-.1-1-.3-1.7-.6-2.4-1-3.9-3.5-4-3.6-.1-.2-.9-1.2-.9-2.3 0-1.1.6-1.6.8-1.9.2-.2.4-.3.6-.3h.4c.2 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.2.4-.3.3c-.1.1-.2.2-.1.4.1.2.5.9 1.1 1.4.8.7 1.4.9 1.6 1 .2.1.3.1.4 0l.6-.7c.1-.2.3-.2.5-.1l1.6.8c.2.1.3.2.4.3 0 .1 0 .6-.2 1.2Z"/></svg>
        </button>
        <button class="paylas-btn" id="paylasMail" title="E-posta ile paylaş" aria-label="E-posta ile paylaş">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 6.5 9 6 9-6"/></svg>
        </button>
        <button class="paylas-btn" id="paylasKopya" title="Bağlantıyı kopyala" aria-label="Bağlantıyı kopyala">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>
        </button>
      </div>
    </div>`;

  if (window.VERA.isFav?.(t.id)) document.querySelector(".detail-actions .fav-btn")?.classList.add("active");

  /* ---------- Paylaşım ---------- */
  const paylasMetni = `${t.name} — ${cat.label}${city ? " · " + city : ""} | Model of World`;
  $("paylasWa").onclick = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(paylasMetni + "\n" + sayfaUrl)}`, "_blank");
  $("paylasMail").onclick = () => {
    location.href = `mailto:?subject=${encodeURIComponent(paylasMetni)}&body=${encodeURIComponent(paylasMetni + "\n\n" + sayfaUrl)}`;
  };
  $("paylasKopya").onclick = async () => {
    const etiket = $("paylasEtiket");
    try {
      await navigator.clipboard.writeText(sayfaUrl);
      etiket.textContent = "✓ Bağlantı kopyalandı";
    } catch {
      etiket.textContent = sayfaUrl;
    }
    setTimeout(() => etiket.textContent = "Profili paylaş", 2600);
  };

  /* ---------------------------------------------------------
     Galeri — yalnızca fotoğrafı olan sekmeler gösterilir
     --------------------------------------------------------- */
  const SEKME_ADI = { studio: "Stüdyo", podium: "Podyum / Saha", polaroid: "Polaroid (Doğal)" };
  const doluSekmeler = Object.keys(SEKME_ADI).filter(k => albumler[k].length);
  const sekmeler = doluSekmeler.length ? doluSekmeler : ["studio"];

  $("galleryTabs").innerHTML =
    sekmeler.map((k, i) =>
      `<button class="tab-btn ${i ? "" : "active"}" data-tab="${k}">${SEKME_ADI[k]} <span class="muted" style="font-size:.75em">${albumler[k].length || ""}</span></button>`).join("") +
    `<button class="tab-btn" data-tab="video">Video Book</button>`;

  $("galleryPanes").innerHTML =
    sekmeler.map((k, i) => `<div class="tab-pane ${i ? "" : "active"}" id="pane-${k}"><div class="gallery-grid"></div></div>`).join("") +
    `<div class="tab-pane" id="pane-video"></div>`;

  function fillPane(key) {
    const pane = document.querySelector(`#pane-${key} .gallery-grid`);
    if (!pane) return;
    const imgs = albumler[key];
    pane.innerHTML = imgs.length
      ? imgs.map(src => {
          const sira = tumFotolar.indexOf(src);
          return `<div class="g-item" data-cursor="Büyüt" data-buyut="${sira}"><img src="${src}" alt="${esc(t.name)} ${SEKME_ADI[key]} fotoğrafı" loading="lazy" style="width:100%;height:100%;object-fit:cover;aspect-ratio:3/4"></div>`;
        }).join("")
      : Array.from({ length: 3 }, (_, i) =>
          `<div class="g-item">${talentPlaceholder({ ...t, gradient: i % 2 ? [t.gradient[1], t.gradient[0]] : t.gradient })}</div>`).join("");
  }
  sekmeler.forEach(fillPane);

  $("pane-video").innerHTML = t.video
    ? `<video controls playsinline style="width:100%;max-width:720px;border-radius:14px" src="${esc(t.video)}"></video>`
    : `<div class="video-slot">
         <div class="play">▶</div>
         <strong style="color:var(--text)">Video book hazırlanıyor</strong>
         <span>Catwalk / tanıtım videosu için ajansımızla iletişime geçin — talep üzerine WhatsApp'tan iletilir.</span>
       </div>`;

  $("galleryTabs").addEventListener("click", e => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll("#galleryTabs .tab-btn").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll("#galleryPanes .tab-pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + btn.dataset.tab));
  });

  /* ---------------------------------------------------------
     Işık kutusu — tıkla büyüt, oklarla gez, Esc ile kapat
     --------------------------------------------------------- */
  const buyukler = tumFotolar.length ? tumFotolar : (anaFoto ? [anaFoto] : []);
  let aktifIndeks = 0;

  function isikGoster(i) {
    if (!buyukler.length) return;
    aktifIndeks = (i + buyukler.length) % buyukler.length;
    const src = buyukler[aktifIndeks];
    $("isikFoto").src = t.real ? src : src.replace(/w=\d+&h=\d+/, "w=1000&h=1333");
    $("isikFoto").alt = `${t.name} — fotoğraf ${aktifIndeks + 1}`;
    $("isikSayac").textContent = `${aktifIndeks + 1} / ${buyukler.length}`;
    const tekli = buyukler.length < 2;
    $("isikGeri").style.display = tekli ? "none" : "";
    $("isikIleri").style.display = tekli ? "none" : "";
    $("isikKutu").classList.add("open");
    document.body.classList.add("isik-acik");
  }
  function isikKapat() {
    $("isikKutu").classList.remove("open");
    document.body.classList.remove("isik-acik");
    $("isikFoto").src = "";
  }
  document.addEventListener("click", e => {
    const hedef = e.target.closest("[data-buyut]");
    if (hedef && !e.target.closest(".isik-kutu")) {
      e.preventDefault();
      isikGoster(+hedef.dataset.buyut || 0);
    }
  });
  $("isikKapat").onclick = isikKapat;
  $("isikGeri").onclick = () => isikGoster(aktifIndeks - 1);
  $("isikIleri").onclick = () => isikGoster(aktifIndeks + 1);
  $("isikKutu").addEventListener("click", e => { if (e.target === $("isikKutu")) isikKapat(); });
  document.addEventListener("keydown", e => {
    if (!$("isikKutu").classList.contains("open")) return;
    if (e.key === "Escape") isikKapat();
    if (e.key === "ArrowLeft") isikGoster(aktifIndeks - 1);
    if (e.key === "ArrowRight") isikGoster(aktifIndeks + 1);
  });

  /* ---------------------------------------------------------
     Önceki / sonraki model (aynı kategoride)
     --------------------------------------------------------- */
  const ayniKat = TALENTS
    .filter(x => katsOf(x).some(k => katsOf(t).includes(k)))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const yer = ayniKat.findIndex(x => x.id === t.id);
  const komsu = (x, yon) => x
    ? `<a href="model-detay?id=${x.id}">${yon === "geri" ? "←" : ""}
         ${x.photo ? `<img src="${x.real ? x.photo : x.photo + "?q=70&auto=format&fit=crop&w=84&h=108&crop=faces"}" alt="" loading="lazy">` : ""}
         <span>${yon === "geri" ? "Önceki" : "Sonraki"} model<br><strong style="color:var(--text)">${esc(x.name)}</strong></span>
         ${yon === "ileri" ? "→" : ""}</a>`
    : "<span></span>";
  if (ayniKat.length > 1) {
    $("modelGez").innerHTML =
      komsu(ayniKat[yer - 1] || ayniKat[ayniKat.length - 1], "geri") +
      komsu(ayniKat[yer + 1] || ayniKat[0], "ileri");
  } else {
    $("modelGez").remove();
  }

  /* ---------------------------------------------------------
     Diğer Modellerimiz — aynı kategori / şehir önceliğiyle
     --------------------------------------------------------- */
  function benzerlik(x) {
    let p = 0;
    if (katsOf(x).some(k => katsOf(t).includes(k))) p += 4;
    if (x.city && x.city === t.city) p += 2;
    if (x.gender === t.gender) p += 1;
    if (x.featured) p += 1;
    if (x.photo) p += 1;
    if (x.real) p += 3;        /* gerçek kadro örnek profillerin önünde önerilir */
    return p;
  }
  const benzer = TALENTS
    .filter(x => x.id !== t.id)
    .map(x => ({ x, p: benzerlik(x) }))
    .sort((a, b) => b.p - a.p || a.x.name.localeCompare(b.x.name, "tr"))
    .slice(0, 8)
    .map(o => o.x);
  benzerleriYaz(benzer, `${cat.label} kadromuzdan diğer profiller — beğendiklerinizi kalp simgesiyle cast listenize ekleyip tek seferde teklif alabilirsiniz.`);
  $("benzerTumu").href = `katalog?cat=${t.category}`;

  /* CTA kişiselleştirme */
  $("ctaName").textContent = `${t.name} ile çalışmak ister misiniz?`;
  $("ctaQuote").href = `teklif?talent=${t.id}`;

  /* ---------------------------------------------------------
     Yardımcı: benzer profil kartlarını bas
     --------------------------------------------------------- */
  function benzerleriYaz(liste, altMetin) {
    const grid = $("benzerGrid");
    if (!grid) return;
    if (!liste.length) { document.getElementById("benzerBolum").remove(); return; }
    grid.innerHTML = liste.map(renderTalentCard).join("");
    $("benzerAlt").textContent = altMetin || "";
    observeNew(grid);
    grid.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  }
})();
