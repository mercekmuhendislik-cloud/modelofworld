/* =========================================================
   MODEL OF WORLD — Katalog: çoklu seçimli filtreleme & sıralama
   URL parametreleri: ?cat= &gender= &q=   (virgülle birden fazla)

   Filtre mantığı:
     · Bir grup içinde ÇOKLU seçim → "veya" (mavi VEYA kahverengi göz)
     · Gruplar arasında            → "ve"  (mavi göz VE İngilizce bilen)
     · Diller grubunda ek anahtar  → "herhangi biri" / "hepsini bilen"
   ========================================================= */
(function () {
  const { TALENTS, CATEGORIES, LABELS, renderTalentCard, observeNew } = window.VERA;
  const $ = id => document.getElementById(id);

  /* Her chip grubu bir dizi tutar; boş dizi = "Tümü" */
  const state = {
    q: "",
    category: [], gender: [], city: [], hair: [], eye: [], lang: [], shoe: [], size: [],
    minHeight: 130, maxWeight: 90,
    dilHepsi: false,          /* true → seçilen dillerin HEPSİNİ bilenler */
    sort: "featured",
  };

  /* ---- URL'den başlangıç filtreleri ---- */
  const params = new URLSearchParams(location.search);
  const listeye = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
  if (params.get("cat")) state.category = listeye(params.get("cat"));
  if (params.get("gender")) state.gender = listeye(params.get("gender"));
  if (params.get("q")) state.q = params.get("q").toLowerCase();

  /* ---- Seçenekler kadrodan üretilir ---- */
  const tekil = dizi => [...new Set(dizi.filter(v => v !== undefined && v !== null && v !== ""))];
  const catOpts  = Object.entries(CATEGORIES).map(([k, v]) => [k, v.short || v.label]);
  const cityOpts = tekil(TALENTS.map(t => t.city)).map(c => [c, LABELS.city[c] || c]);
  const hairOpts = tekil(TALENTS.map(t => t.hair)).map(h => [h, LABELS.hair[h] || h]);
  const eyeOpts  = tekil(TALENTS.map(t => t.eye)).map(e => [e, LABELS.eye[e] || e]);
  const shoeOpts = tekil(TALENTS.map(t => t.shoe)).sort((a, b) => a - b).map(s => [s, s]);
  const sizeOpts = tekil(TALENTS.map(t => t.size))
    .sort((a, b) => String(a).localeCompare(String(b), "tr", { numeric: true })).map(s => [s, s]);
  const langOpts = tekil(TALENTS.flatMap(t => t.languages || []))
    .filter(l => l !== "Türkçe").map(l => [l, l]);

  /* Etiket sözlüğü — seçili filtre özetinde okunur ad göstermek için */
  const ETIKET = { category: {}, gender: { kadin: "Kadın", erkek: "Erkek" },
                   city: {}, hair: {}, eye: {}, lang: {}, shoe: {}, size: {} };
  catOpts.forEach(([v, l]) => ETIKET.category[v] = l);
  cityOpts.forEach(([v, l]) => ETIKET.city[v] = l);
  hairOpts.forEach(([v, l]) => ETIKET.hair[v] = l);
  eyeOpts.forEach(([v, l]) => ETIKET.eye[v] = l);
  langOpts.forEach(([v, l]) => ETIKET.lang[v] = l);
  shoeOpts.forEach(([v, l]) => ETIKET.shoe[v] = "Ayak " + l);
  sizeOpts.forEach(([v, l]) => ETIKET.size[v] = "Beden " + l);
  const GRUP_ADI = { category: "Kategori", gender: "Cinsiyet", city: "Şehir", hair: "Saç",
                     eye: "Göz", lang: "Dil", shoe: "Ayakkabı", size: "Beden" };

  /* ---------------------------------------------------------
     Çoklu seçimli chip grubu
     --------------------------------------------------------- */
  function grupKur(el, options, key) {
    if (!el) return;
    el.dataset.key = key;
    el.innerHTML =
      `<button class="chip ${state[key].length ? "" : "active"}" data-val="">Tümü</button>` +
      options.map(([val, label]) =>
        `<button class="chip ${state[key].map(String).includes(String(val)) ? "active" : ""}" data-val="${val}">${label}</button>`).join("");
    el.addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      if (chip.dataset.val === "") {
        state[key] = [];                                  /* Tümü → grubu temizle */
      } else {
        const v = chip.dataset.val;
        const i = state[key].map(String).indexOf(String(v));
        if (i > -1) state[key].splice(i, 1); else state[key].push(v);
      }
      grupTazele(el, key);
      apply();
    });
  }
  function grupTazele(el, key) {
    el.querySelectorAll(".chip").forEach(c => {
      c.classList.toggle("active", c.dataset.val === ""
        ? !state[key].length
        : state[key].map(String).includes(String(c.dataset.val)));
    });
  }

  grupKur($("fCategory"), catOpts, "category");
  grupKur($("fCity"), cityOpts, "city");
  grupKur($("fHair"), hairOpts, "hair");
  grupKur($("fEye"), eyeOpts, "eye");
  grupKur($("fShoe"), shoeOpts, "shoe");
  grupKur($("fSize"), sizeOpts, "size");
  grupKur($("fLang"), langOpts, "lang");

  /* Cinsiyet chip'leri sayfada sabit yazılı — aynı çoklu mantığa bağlanır */
  const genderEl = $("fGender");
  if (genderEl) {
    genderEl.dataset.key = "gender";
    genderEl.classList.add("chip-row");
    genderEl.addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      if (chip.dataset.val === "") state.gender = [];
      else {
        const i = state.gender.indexOf(chip.dataset.val);
        if (i > -1) state.gender.splice(i, 1); else state.gender.push(chip.dataset.val);
      }
      grupTazele(genderEl, "gender");
      apply();
    });
    grupTazele(genderEl, "gender");
  }

  /* Diller: "herhangi biri" ⇄ "hepsini bilen" anahtarı */
  const langEl = $("fLang");
  if (langEl && langOpts.length) {
    const sar = document.createElement("div");
    sar.className = "dil-mod";
    sar.innerHTML =
      '<button type="button" class="chip mini-chip active" data-mod="veya">herhangi biri</button>' +
      '<button type="button" class="chip mini-chip" data-mod="ve">hepsini bilen</button>';
    langEl.parentNode.insertBefore(sar, langEl.nextSibling);
    sar.addEventListener("click", e => {
      const b = e.target.closest("[data-mod]");
      if (!b) return;
      state.dilHepsi = b.dataset.mod === "ve";
      sar.querySelectorAll(".mini-chip").forEach(x => x.classList.toggle("active", x === b));
      apply();
    });
  }

  if (state.q) $("fSearch").value = state.q;

  /* ---------------------------------------------------------
     Süzme
     --------------------------------------------------------- */
  const eslesir = (secili, deger) => !secili.length || secili.map(String).includes(String(deger));

  function apply() {
    const list = TALENTS.filter(t => {
      /* Kategori: üyenin birden fazla kategorisi olabilir */
      if (state.category.length) {
        const kats = (t.categories && t.categories.length) ? t.categories : [t.category];
        if (!kats.some(k => state.category.includes(k))) return false;
      }
      if (!eslesir(state.gender, t.gender)) return false;
      if (!eslesir(state.city, t.city)) return false;
      if (!eslesir(state.hair, t.hair)) return false;
      if (!eslesir(state.eye, t.eye)) return false;
      if (!eslesir(state.shoe, t.shoe)) return false;
      if (!eslesir(state.size, t.size)) return false;

      if (state.lang.length) {
        const diller = t.languages || [];
        const uyan = state.lang.filter(l => diller.includes(l));
        if (state.dilHepsi ? uyan.length !== state.lang.length : !uyan.length) return false;
      }

      if (t.height && t.height < state.minHeight) return false;
      if (state.maxWeight < 90 && (t.weight || 0) > state.maxWeight) return false;

      if (state.q) {
        const kats = (t.categories && t.categories.length) ? t.categories : [t.category];
        const hay = `${t.name} ${(t.tags || []).join(" ")} ${(t.languages || []).join(" ")} ${t.city} ` +
          kats.map(k => (CATEGORIES[k] || {}).label || k).join(" ");
        if (!hay.toLowerCase().includes(state.q)) return false;
      }
      return true;
    });

    const sorters = {
      /* Gerçek (panelden yayınlanan) üyeler örnek profillerin önünde gelir */
      featured: (a, b) => (!!b.real - !!a.real) || (b.featured - a.featured) || a.name.localeCompare(b.name, "tr"),
      name: (a, b) => a.name.localeCompare(b.name, "tr"),
      "height-desc": (a, b) => (b.height || 0) - (a.height || 0),
      "height-asc": (a, b) => (a.height || 0) - (b.height || 0),
      "age-asc": (a, b) => (a.age || 0) - (b.age || 0),
    };
    list.sort(sorters[state.sort] || sorters.featured);

    const grid = $("catalogGrid");
    const empty = $("emptyState");
    grid.innerHTML = list.map(renderTalentCard).join("");
    empty.classList.toggle("hidden", list.length > 0);
    /* Kadro hiç yoksa (yayında üye yok ya da servise ulaşılamıyor) filtre
       mesajı yanıltıcı olur — durumu açıkça yaz. */
    if (!TALENTS.length) {
      empty.innerHTML =
        '<div class="serif">Kadromuz yayına hazırlanıyor</div>' +
        '<p>Profiller ajans onayından geçtikçe burada yayınlanır. Aradığınız profili bize iletirseniz ' +
        'uygun adayları doğrudan sunalım.</p>' +
        '<a class="btn btn-gold btn-sm mt-2" href="teklif">Profil Talebi Gönder</a>';
    }
    $("resultCount").innerHTML = `<strong>${list.length}</strong> profil listeleniyor`;
    ozetCiz();
    observeNew(grid);
    grid.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  }

  /* ---------------------------------------------------------
     Seçili filtre özeti — her etiket tek tek kaldırılabilir
     --------------------------------------------------------- */
  let ozetEl = null;
  function ozetCiz() {
    if (!ozetEl) {
      ozetEl = document.createElement("div");
      ozetEl.className = "secili-ozet";
      const sayac = $("resultCount");
      if (sayac && sayac.parentNode) sayac.parentNode.insertBefore(ozetEl, sayac.nextSibling);
      ozetEl.addEventListener("click", e => {
        const b = e.target.closest("[data-kaldir]");
        if (!b) return;
        const [key, val] = b.dataset.kaldir.split("|");
        state[key] = state[key].filter(v => String(v) !== val);
        const el = document.querySelector(`[data-key="${key}"]`);
        if (el) grupTazele(el, key);
        apply();
      });
    }
    const parcalar = [];
    Object.keys(GRUP_ADI).forEach(key => {
      state[key].forEach(v => {
        const ad = (ETIKET[key] && ETIKET[key][v]) || v;
        parcalar.push(`<button class="ozet-etiket" data-kaldir="${key}|${v}" title="${GRUP_ADI[key]} filtresinden kaldır">${ad} ✕</button>`);
      });
    });
    if (state.lang.length > 1) {
      parcalar.push(`<span class="ozet-not">diller: ${state.dilHepsi ? "hepsini bilen" : "herhangi biri"}</span>`);
    }
    ozetEl.innerHTML = parcalar.length ? `<span class="ozet-baslik">Seçili:</span> ${parcalar.join("")}` : "";
  }

  /* ---------------------------------------------------------
     Aralık, arama, sıralama, temizleme
     --------------------------------------------------------- */
  function bindRange(id, outId, key, fmt) {
    const range = $(id), out = $(outId);
    if (!range) return null;
    range.addEventListener("input", () => {
      state[key] = +range.value;
      out.textContent = fmt(+range.value);
      apply();
    });
    return range;
  }
  const hRange = bindRange("fHeight", "fHeightOut", "minHeight", v => v <= 130 ? "Tümü" : v + "+");
  const wRange = bindRange("fWeight", "fWeightOut", "maxWeight", v => v >= 90 ? "Tümü" : "≤ " + v);

  let debounce;
  $("fSearch").addEventListener("input", e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); apply(); }, 200);
  });

  $("fSort").addEventListener("change", e => { state.sort = e.target.value; apply(); });

  $("fClear").addEventListener("click", () => {
    state.q = "";
    ["category", "gender", "city", "hair", "eye", "lang", "shoe", "size"].forEach(k => state[k] = []);
    state.minHeight = 130; state.maxWeight = 90; state.dilHepsi = false;
    $("fSearch").value = "";
    if (hRange) { hRange.value = 130; $("fHeightOut").textContent = "Tümü"; }
    if (wRange) { wRange.value = 90; $("fWeightOut").textContent = "Tümü"; }
    document.querySelectorAll(".filters .chip-row").forEach(row => {
      row.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.val === ""));
    });
    document.querySelectorAll(".dil-mod .mini-chip").forEach((x, i) => x.classList.toggle("active", i === 0));
    apply();
  });

  $("filtersToggle").addEventListener("click", () => $("filtersPanel").classList.toggle("open"));

  apply();
})();
