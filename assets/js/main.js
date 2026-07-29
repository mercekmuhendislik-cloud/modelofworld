/* =========================================================
   VERA AGENCY — Ortak Katman
   Header/footer render, tema, mobil menü, arama overlay,
   özel imleç, scroll-reveal, lazy-load
   ========================================================= */
(function () {
  const { AGENCY, TALENTS, SERVICES, CATEGORIES } = window.VERA;

  /* ---------- Ortak Header & Footer ---------- */
  const NAV = [
    { href: "katalog.html",    label: "Cast / Katalog", key: "katalog" },
    { href: "hizmetler.html",  label: "Hizmetlerimiz",  key: "hizmetler" },
    { href: "produksiyon.html",label: "Prodüksiyon",    key: "produksiyon" },
    { href: "basvuru.html",    label: "Başvuru Yap",    key: "basvuru" },
    { href: "hakkimizda.html", label: "Hakkımızda",     key: "hakkimizda" },
    { href: "iletisim.html",   label: "İletişim",       key: "iletisim" },
  ];

  /* ---------- Favoriler (Cast Listem) ---------- */
  const FAV_KEY = "vera-castlist";
  const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  const isFav = id => getFavs().includes(id);
  function toggleFav(id) {
    const favs = getFavs();
    const i = favs.indexOf(id);
    i > -1 ? favs.splice(i, 1) : favs.push(id);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    updateFavBadge();
    return i === -1;
  }
  function updateFavBadge() {
    const badge = document.getElementById("favCount");
    if (!badge) return;
    const n = getFavs().length;
    badge.textContent = n;
    badge.style.display = n ? "flex" : "none";
  }
  window.VERA.getFavs = getFavs;
  window.VERA.isFav = isFav;
  window.VERA.toggleFav = toggleFav;

  /* ---------- Marka Logosu (tüm sayfalarda tek kaynak) ---------- */
  const LOGO = `
    <a class="logo" href="index.html" aria-label="Model of World — Ana Sayfa">
      <svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="25" r="20.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M24 0.8 L25.3 4.2 L28.8 5.5 L25.3 6.8 L24 10.2 L22.7 6.8 L19.2 5.5 L22.7 4.2 Z" fill="currentColor"/>
        <text x="24" y="32" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="19" font-weight="600" letter-spacing="0.5" fill="currentColor">MW</text>
      </svg>
      <span class="logo-word">
        <span class="lw-top">MODEL<em>of</em>WORLD</span>
        <small>AGENCY</small>
      </span>
    </a>`;

  const active = document.body.dataset.page || "";

  const headerMount = document.getElementById("site-header");
  if (headerMount) {
    headerMount.outerHTML = `
    <header class="site-header" id="header">
      <div class="container header-inner">
        ${LOGO}
        <nav class="main-nav" id="mainNav" aria-label="Ana menü">
          ${NAV.map(n => `<a href="${n.href}" class="${n.key === active ? "active" : ""}">${n.label}</a>`).join("")}
        </nav>
        <div class="header-actions">
          <a class="icon-btn" href="uye.html" aria-label="Üye Girişi" title="Üye Girişi / Aday Paneli">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>
          </a>
          <a class="icon-btn" id="favHeaderBtn" href="cast-listem.html" aria-label="Cast Listem" title="Cast Listem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.8-10-9.3C.6 8.4 2.4 4.5 6 4.5c2.2 0 3.6 1.2 6 3.8 2.4-2.6 3.8-3.8 6-3.8 3.6 0 5.4 3.9 4 7.2C19.5 16.2 12 21 12 21Z"/></svg>
            <span class="fav-count" id="favCount" style="display:none">0</span>
          </a>
          <button class="icon-btn" id="searchBtn" aria-label="Ara (Ctrl+K)" title="Ara (Ctrl+K)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          </button>
          <button class="icon-btn" id="themeBtn" aria-label="Tema değiştir" title="Koyu / Açık tema">
            <svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
            <svg class="ic-sun hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          </button>
          <a class="btn btn-gold btn-sm header-cta" href="teklif.html">Teklif Al</a>
          <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menü">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
        </div>
      </div>
    </header>`;
  }

  const footerMount = document.getElementById("site-footer");
  if (footerMount) {
    const year = new Date().getFullYear();
    footerMount.outerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-about">
            ${LOGO}
            <p>Model &amp; hostes temini, prodüksiyon ve etkinlik yönetiminde premium ajans çözümleri.</p>
          </div>
          <div>
            <h4>Menü</h4>
            <ul>${NAV.map(n => `<li><a href="${n.href}">${n.label}</a></li>`).join("")}</ul>
          </div>
          <div>
            <h4>Hizmetler</h4>
            <ul>${SERVICES.map(s => `<li><a href="hizmetler.html#${s.id}">${s.title}</a></li>`).join("")}</ul>
          </div>
          <div>
            <h4>İletişim</h4>
            <ul>
              <li><a href="tel:${AGENCY.phone.replace(/[^\d+]/g, "")}">${AGENCY.phone}</a></li>
              <li><a href="mailto:${AGENCY.email}">${AGENCY.email}</a></li>
              <li><span class="muted">${AGENCY.address}</span></li>
              <li><a href="blog.html">Blog & Haberler</a></li>
              <li class="mt-2"><a class="btn btn-ghost btn-sm" href="teklif.html">Hızlı Teklif İste</a></li>
            </ul>
            <h4 style="margin-top:26px">Yeni yüzlerden haberdar olun</h4>
            <form class="newsletter" id="newsletterForm">
              <input type="email" placeholder="E-posta adresiniz" required aria-label="E-posta">
              <button class="btn btn-gold btn-sm" type="submit">Abone Ol</button>
            </form>
            <div class="newsletter-msg" id="newsletterMsg">Teşekkürler! Bültenimize kaydoldunuz.</div>
          </div>
        </div>
        <div class="trust-row" style="margin-bottom:28px">
          <span class="trust-badge">Tüm personel SGK'lı ve sözleşmeli</span>
          <span class="trust-badge">${AGENCY.legal.iskur}</span>
          <span class="trust-badge">KVKK uyumlu veri işleme</span>
          <span class="trust-badge">256-bit SSL güvenli bağlantı</span>
        </div>
        <div class="footer-bottom">
          <span>© ${year} ${AGENCY.legal.title} — ${AGENCY.legal.taxOffice} · VN: ${AGENCY.legal.taxNo} · MERSİS: ${AGENCY.legal.mersis} · ${AGENCY.address}</span>
          <span><a href="kvkk.html">KVKK & Gizlilik</a> · <a href="kvkk.html#cerez">Çerez Politikası</a> · <a href="sozlesme.html">Sözleşme & Şartlar</a></span>
        </div>
      </div>
    </footer>

    <a class="wa-float" href="https://wa.me/${AGENCY.whatsapp.replace(/[^\d]/g, "")}" target="_blank" rel="noopener" aria-label="WhatsApp ile yazın">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>
    </a>

    <div class="search-overlay" id="searchOverlay" role="dialog" aria-label="Site içi arama">
      <button class="icon-btn search-close" id="searchClose" aria-label="Kapat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Model, hostes veya hizmet arayın…" autocomplete="off">
        <div class="search-hint">İpucu: her sayfadan <kbd>Ctrl + K</kbd> ile açabilirsiniz · <kbd>Esc</kbd> ile kapanır</div>
        <div class="search-results" id="searchResults"></div>
      </div>
    </div>`;
  }

  /* ---------- Favori tıklamaları (delegasyon) + rozet ---------- */
  document.addEventListener("click", e => {
    const btn = e.target.closest(".fav-btn");
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const added = toggleFav(btn.dataset.fav);
    document.querySelectorAll(`.fav-btn[data-fav="${btn.dataset.fav}"]`)
      .forEach(b => b.classList.toggle("active", added));
    /* Cast listesi sayfasındaysak listeyi tazele */
    if (document.body.dataset.page === "cast-listem") window.dispatchEvent(new Event("favs-changed"));
  });
  updateFavBadge();

  /* ---------- Bülten ---------- */
  document.getElementById("newsletterForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const email = e.target.querySelector("input").value.trim();
    if (!email) return;
    const subs = JSON.parse(localStorage.getItem("vera-newsletter") || "[]");
    if (!subs.includes(email)) subs.push(email);
    localStorage.setItem("vera-newsletter", JSON.stringify(subs));
    e.target.style.display = "none";
    document.getElementById("newsletterMsg").style.display = "block";
  });

  /* ---------- Tema ---------- */
  const root = document.documentElement;
  const saved = localStorage.getItem("vera-theme");
  if (saved) root.dataset.theme = saved;

  /* Varsayılan tema: açık (pudra pembesi). "dark" seçilirse gece sürümü. */
  const themeBtn = document.getElementById("themeBtn");
  function syncThemeIcon() {
    const dark = root.dataset.theme === "dark";
    /* Ay ikonu açık temada görünür (koyuya geçiş), güneş koyu temada */
    themeBtn?.querySelector(".ic-moon")?.classList.toggle("hidden", dark);
    themeBtn?.querySelector(".ic-sun")?.classList.toggle("hidden", !dark);
  }
  themeBtn?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("vera-theme", next);
    syncThemeIcon();
  });
  syncThemeIcon();

  /* ---------- Sticky header ---------- */
  const header = document.getElementById("header");
  const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobil menü ---------- */
  const nav = document.getElementById("mainNav");
  document.getElementById("navToggle")?.addEventListener("click", () => nav?.classList.toggle("open"));

  /* ---------- Arama Overlay ---------- */
  const overlay = document.getElementById("searchOverlay");
  const input = document.getElementById("searchInput");
  const resultsEl = document.getElementById("searchResults");

  const INDEX = [
    ...TALENTS.map(t => ({
      label: t.name, sub: CATEGORIES[t.category].label + " · " + (window.VERA.LABELS.city[t.city] || t.city),
      href: `model-detay.html?id=${t.id}`,
      text: `${t.name} ${t.category} ${t.city} ${t.tags.join(" ")} ${(t.languages || []).join(" ")}`.toLowerCase(),
    })),
    ...SERVICES.map(s => ({
      label: s.title, sub: "Hizmet",
      href: `hizmetler.html#${s.id}`,
      text: `${s.title} ${s.short}`.toLowerCase(),
    })),
    { label: "Başvuru Formu", sub: "Model / Hostes olun", href: "basvuru.html", text: "başvuru basvuru model hostes kayıt" },
    { label: "Teklif İste", sub: "Kurumsal müşteriler", href: "teklif.html", text: "teklif fiyat proje müşteri" },
  ];

  function openSearch() { overlay?.classList.add("open"); setTimeout(() => input?.focus(), 80); }
  function closeSearch() { overlay?.classList.remove("open"); if (input) input.value = ""; renderResults(""); }

  function renderResults(q) {
    if (!resultsEl) return;
    q = q.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ""; return; }
    const hits = INDEX.filter(i => i.text.includes(q)).slice(0, 8);
    resultsEl.innerHTML = hits.length
      ? hits.map(h => `<a href="${h.href}"><span>${h.label}</span><small>${h.sub}</small></a>`).join("")
      : `<a><span class="muted">Sonuç bulunamadı</span></a>`;
  }

  document.getElementById("searchBtn")?.addEventListener("click", openSearch);
  document.getElementById("searchClose")?.addEventListener("click", closeSearch);
  overlay?.addEventListener("click", e => { if (e.target === overlay) closeSearch(); });
  input?.addEventListener("input", () => renderResults(input.value));
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") closeSearch();
  });

  /* ---------- Özel imleç ---------- */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const dot = document.createElement("div");
    const ring = document.createElement("div");
    dot.className = "cursor-dot"; ring.className = "cursor-ring";
    document.body.append(dot, ring);

    let mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener("mousemove", e => { mx = e.clientX; my = e.clientY; });
    (function loop() {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();

    document.addEventListener("mouseover", e => {
      const t = e.target.closest("[data-cursor]");
      ring.classList.toggle("zoom", !!t);
      ring.textContent = t ? (t.dataset.cursor || "İncele") : "";
    });
  }

  /* ---------- Scroll Reveal ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));

  /* ---------- Kart render yardımcıları (diğer sayfalar kullanır) ---------- */
  window.VERA.renderTalentCard = function (t) {
    const cat = CATEGORIES[t.category];
    const city = window.VERA.LABELS.city[t.city] || t.city;
    const media = t.photo
      ? `<img src="${t.photo}?q=80&auto=format&fit=crop&w=640&h=854" alt="${t.name} — ${cat.label}" loading="lazy">`
      : window.VERA.talentPlaceholder(t);
    const fav = window.VERA.isFav?.(t.id);
    return `
      <a class="talent-card reveal" href="model-detay.html?id=${t.id}" data-cursor="İncele">
        <div class="talent-media">
          <span class="talent-badge">${cat.short || cat.label}</span>
          <button class="fav-btn${fav ? " active" : ""}" data-fav="${t.id}" aria-label="Cast listeme ekle" title="Cast Listem'e ekle/çıkar">
            <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.8-10-9.3C.6 8.4 2.4 4.5 6 4.5c2.2 0 3.6 1.2 6 3.8 2.4-2.6 3.8-3.8 6-3.8 3.6 0 5.4 3.9 4 7.2C19.5 16.2 12 21 12 21Z"/></svg>
          </button>
          ${media}
        </div>
        <div class="talent-info">
          <div>
            <h3>${t.name}</h3>
            <small>${t.height} cm · ${city}</small>
          </div>
          <span class="arrow">→</span>
        </div>
      </a>`;
  };

  window.VERA.observeNew = function (scope) {
    (scope || document).querySelectorAll(".reveal:not(.in)").forEach(el => io.observe(el));
  };
})();
