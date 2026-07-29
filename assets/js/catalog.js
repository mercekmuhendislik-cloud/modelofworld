/* =========================================================
   VERA AGENCY — Katalog: gelişmiş filtreleme & sıralama
   URL parametreleri: ?cat= &gender= &q=
   Filtreler: kategori, cinsiyet, boy, kilo, ayak no, beden,
   şehir, saç, göz, dil, ehliyet, müsaitlik + serbest arama
   ========================================================= */
(function () {
  const { TALENTS, CATEGORIES, LABELS, renderTalentCard, observeNew } = window.VERA;

  const state = {
    q: "", category: "", gender: "",
    minHeight: 130, maxWeight: 90, shoe: "", size: "",
    city: "", hair: "", eye: "", lang: "",
    sort: "featured",
  };

  /* URL'den başlangıç filtreleri */
  const params = new URLSearchParams(location.search);
  if (params.get("cat")) state.category = params.get("cat");
  if (params.get("gender")) state.gender = params.get("gender");
  if (params.get("q")) state.q = params.get("q").toLowerCase();

  /* ---- Dinamik chip grupları ---- */
  function buildChips(el, options, key) {
    el.innerHTML = `<button class="chip ${state[key] ? "" : "active"}" data-val="">Tümü</button>` +
      options.map(([val, label]) =>
        `<button class="chip ${String(state[key]) === String(val) ? "active" : ""}" data-val="${val}">${label}</button>`).join("");
  }

  const catOpts  = Object.entries(CATEGORIES).map(([k, v]) => [k, v.short || v.label]);
  const cityOpts = [...new Set(TALENTS.map(t => t.city))].map(c => [c, LABELS.city[c] || c]);
  const hairOpts = [...new Set(TALENTS.map(t => t.hair))].map(h => [h, LABELS.hair[h] || h]);
  const eyeOpts  = [...new Set(TALENTS.map(t => t.eye))].map(e => [e, LABELS.eye[e] || e]);
  const shoeOpts = [...new Set(TALENTS.map(t => t.shoe).filter(Boolean))].sort((a, b) => a - b).map(s => [s, s]);
  const sizeOpts = [...new Set(TALENTS.map(t => t.size).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "tr", { numeric: true })).map(s => [s, s]);
  const langOpts = [...new Set(TALENTS.flatMap(t => t.languages || []))]
    .filter(l => l !== "Türkçe").map(l => [l, l]);

  /* Kategori: ÇOKLU seçim (diğer filtreler tekli) */
  const catEl = document.getElementById("fCategory");
  const catActive = () => state.category ? state.category.split(",") : [];
  catEl.innerHTML = `<button class="chip ${state.category ? "" : "active"}" data-val="">Tümü</button>` +
    catOpts.map(([val, label]) =>
      `<button class="chip ${catActive().includes(val) ? "active" : ""}" data-val="${val}">${label}</button>`).join("");
  catEl.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (chip.dataset.val === "") {
      state.category = "";
      catEl.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.val === ""));
    } else {
      chip.classList.toggle("active");
      const act = [...catEl.querySelectorAll('.chip.active[data-val]:not([data-val=""])')].map(c => c.dataset.val);
      state.category = act.join(",");
      catEl.querySelector('[data-val=""]').classList.toggle("active", !act.length);
    }
    apply();
  });
  buildChips(document.getElementById("fCity"), cityOpts, "city");
  buildChips(document.getElementById("fHair"), hairOpts, "hair");
  buildChips(document.getElementById("fEye"), eyeOpts, "eye");
  buildChips(document.getElementById("fShoe"), shoeOpts, "shoe");
  buildChips(document.getElementById("fSize"), sizeOpts, "size");
  buildChips(document.getElementById("fLang"), langOpts, "lang");

  /* URL'den gelen başlangıç filtrelerini statik chip'lere ve arama kutusuna yansıt */
  document.querySelectorAll("#fGender .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.val === state.gender);
  });
  if (state.q) document.getElementById("fSearch").value = state.q;

  /* ---- Filtreleme ---- */
  function apply() {
    let list = TALENTS.filter(t => {
      if (state.category && !state.category.split(",").includes(t.category)) return false;
      if (state.gender && t.gender !== state.gender) return false;
      if (t.height < state.minHeight) return false;
      if (state.maxWeight < 90 && (t.weight || 0) > state.maxWeight) return false;
      if (state.shoe && String(t.shoe) !== String(state.shoe)) return false;
      if (state.size && String(t.size) !== String(state.size)) return false;
      if (state.city && t.city !== state.city) return false;
      if (state.hair && t.hair !== state.hair) return false;
      if (state.eye && t.eye !== state.eye) return false;
      if (state.lang && !(t.languages || []).includes(state.lang)) return false;
      if (state.q) {
        const hay = `${t.name} ${t.tags.join(" ")} ${(t.languages || []).join(" ")} ${t.city} ${CATEGORIES[t.category].label}`.toLowerCase();
        if (!hay.includes(state.q)) return false;
      }
      return true;
    });

    const sorters = {
      featured: (a, b) => (b.featured - a.featured) || a.name.localeCompare(b.name, "tr"),
      name: (a, b) => a.name.localeCompare(b.name, "tr"),
      "height-desc": (a, b) => b.height - a.height,
      "height-asc": (a, b) => a.height - b.height,
      "age-asc": (a, b) => a.age - b.age,
    };
    list.sort(sorters[state.sort] || sorters.featured);

    const grid = document.getElementById("catalogGrid");
    const empty = document.getElementById("emptyState");
    grid.innerHTML = list.map(renderTalentCard).join("");
    empty.classList.toggle("hidden", list.length > 0);
    document.getElementById("resultCount").innerHTML =
      `<strong>${list.length}</strong> profil listeleniyor`;
    observeNew(grid);
    /* Katalogda kartlar anında görünsün */
    grid.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  }

  /* ---- Etkileşimler ---- */
  function bindChipGroup(id, key) {
    document.getElementById(id).addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state[key] = chip.dataset.val;
      chip.parentElement.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === chip));
      apply();
    });
  }
  ["fGender:gender", "fCity:city", "fHair:hair", "fEye:eye",
   "fShoe:shoe", "fSize:size", "fLang:lang"]
    .forEach(pair => { const [id, key] = pair.split(":"); bindChipGroup(id, key); });

  function bindRange(id, outId, key, fmt) {
    const range = document.getElementById(id);
    const out = document.getElementById(outId);
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
  document.getElementById("fSearch").addEventListener("input", e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); apply(); }, 200);
  });

  document.getElementById("fSort").addEventListener("change", e => { state.sort = e.target.value; apply(); });

  document.getElementById("fClear").addEventListener("click", () => {
    Object.assign(state, {
      q: "", category: "", gender: "", minHeight: 130, maxWeight: 90,
      shoe: "", size: "", city: "", hair: "", eye: "", lang: "",
    });
    document.getElementById("fSearch").value = "";
    hRange.value = 130; document.getElementById("fHeightOut").textContent = "Tümü";
    wRange.value = 90; document.getElementById("fWeightOut").textContent = "Tümü";
    document.querySelectorAll(".filters .chip-row").forEach(row => {
      row.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.val === ""));
    });
    apply();
  });

  document.getElementById("filtersToggle").addEventListener("click", () =>
    document.getElementById("filtersPanel").classList.toggle("open"));

  apply();
})();
