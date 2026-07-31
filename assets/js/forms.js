/* =========================================================
   VERA AGENCY — Form doğrulama & gönderim
   - Başvuru: 2 aşamalı sihirbaz
   - Teklif: saat aralığı, çoklu profil, tahmini bütçe
   Backend hazır olana kadar gönderimler localStorage'a
   yazılır ("vera-submissions"). Yayına alırken submitTo()
   içine API / e-posta servisi / CRM webhook bağlanır.
   ========================================================= */
(function () {
  const { TALENTS, SERVICES, RATES, HEADCOUNT_MID, DURATION_DAYS } = window.VERA;

  /* ================= TEKLİF FORMU ================= */
  const quoteForm = document.getElementById("quoteForm");
  if (quoteForm) {
    /* Hizmet listesi */
    const serviceSelect = document.getElementById("serviceSelect");
    serviceSelect.innerHTML = `<option value="">Seçiniz…</option>` +
      SERVICES.map(s => `<option value="${s.id}">${s.title}</option>`).join("");

    /* Saat aralığı seçenekleri (00:00–23:30, yarım saat adım) */
    const timeOpts = ['<option value="">Seçiniz…</option>'];
    for (let h = 6; h <= 24; h++) {
      for (const m of ["00", "30"]) {
        if (h === 24 && m === "30") continue;
        const hh = String(h % 24).padStart(2, "0");
        timeOpts.push(`<option value="${hh}:${m}">${hh}:${m}</option>`);
      }
    }
    quoteForm.querySelector('[name="timeStart"]').innerHTML = timeOpts.join("");
    quoteForm.querySelector('[name="timeEnd"]').innerHTML = timeOpts.join("");

    /* Katalog / cast listesinden gelen profil(ler): ?talent=id veya ?talents=id1,id2 */
    const qp = new URLSearchParams(location.search);
    const ids = (qp.get("talents") || qp.get("talent") || "").split(",").filter(Boolean);
    const picked = ids.map(id => TALENTS.find(t => t.id === id)).filter(Boolean);
    if (picked.length) {
      document.getElementById("talentField").hidden = false;
      document.getElementById("talentInput").value =
        picked.map(t => `${t.name} (${t.id})`).join(", ");
      /* İlk profilin kategorisine uygun hizmeti öner */
      const map = { model: "manken-model", hostes: "fuar-hostes", yuz: "manken-model", cocuk: "manken-model" };
      if (map[picked[0].category]) serviceSelect.value = map[picked[0].category];
    }

    /* Geçmiş tarih seçilmesin */
    const dateInput = quoteForm.querySelector('[name="date"]');
    if (dateInput) dateInput.min = new Date().toISOString().split("T")[0];

    /* --- Tahmini bütçe hesaplayıcı --- */
    const box = document.getElementById("estimateBox");
    const val = document.getElementById("estimateValue");
    const meta = document.getElementById("estimateMeta");
    const fmt = n => {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".0", "") + " M";
      if (n >= 1000) return Math.round(n / 1000) + " bin";
      return String(n);
    };
    function estimate() {
      const svc = serviceSelect.value;
      if (!svc || !RATES[svc]) { box.hidden = true; return; }
      const people = HEADCOUNT_MID[quoteForm.headcount.value] || 3;
      const days = DURATION_DAYS[quoteForm.duration.value] || 1;
      /* Prodüksiyon/etkinlik proje bazlıdır — kişi çarpanı uygulanmaz */
      const perProject = ["produksiyon", "etkinlik", "moda-podyum"].includes(svc);
      const k = perProject ? days : people * days;
      const [lo, hi] = RATES[svc];
      val.textContent = `${fmt(lo * k)} – ${fmt(hi * k)} TL`;
      meta.textContent = perProject
        ? `${days} gün · proje bazlı`
        : `~${people} kişi × ${days} gün`;
      box.hidden = false;
    }
    ["change", "input"].forEach(ev => {
      serviceSelect.addEventListener(ev, estimate);
      quoteForm.headcount.addEventListener(ev, estimate);
      quoteForm.duration.addEventListener(ev, estimate);
    });
    estimate();
  }

  /* ================= BAŞVURU SİHİRBAZI ================= */
  const applyForm = document.getElementById("applyForm");
  if (applyForm) {
    const panes = applyForm.querySelectorAll(".wizard-pane");
    const steps = applyForm.querySelectorAll(".wstep");

    function showStep(n) {
      panes.forEach(p => p.classList.toggle("active", p.dataset.pane == n));
      steps.forEach(s => {
        s.classList.toggle("active", s.dataset.step == n);
        s.classList.toggle("done", +s.dataset.step < n);
      });
      applyForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    document.getElementById("toStep2").addEventListener("click", () => {
      const err = document.getElementById("wizError");
      try {
        if (validate(applyForm, applyForm.querySelector('[data-pane="1"]'))) {
          if (err) err.style.display = "none";
          showStep(2);
        } else {
          if (err) err.style.display = "block";
          applyForm.querySelector(".field.invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch (e) {
        /* Doğrulama bir nedenle patlarsa aday ilerlemekten alıkonmasın */
        console.error("Adım doğrulaması hatası:", e);
        showStep(2);
      }
    });
    document.getElementById("backStep1").addEventListener("click", () => showStep(1));
  }

  /* ================= ORTAK DOĞRULAMA ================= */
  function validate(form, scope) {
    let ok = true;
    (scope || form).querySelectorAll(".field").forEach(field => {
      const input = field.querySelector("input, select, textarea");
      if (!input) return;
      const valid = input.checkValidity();
      field.classList.toggle("invalid", !valid);
      if (!valid && ok) { input.focus(); ok = false; }
      else if (!valid) ok = false;
    });
    return ok;
  }

  function bindLiveValidation(form) {
    form.querySelectorAll("input, select, textarea").forEach(input => {
      input.addEventListener("input", () => {
        if (input.checkValidity()) input.closest(".field")?.classList.remove("invalid");
      });
    });
  }

  /* ================= GÖNDERİM (entegrasyon noktası) ================= */
  /* Sunucuya gönder ve GERÇEKTEN iletildi mi diye bak.
     Eskiden yanıt kontrol edilmiyordu: sunucu hata verse bile ziyaretçiye
     "talebiniz alındı" yazıyordu ve talep yalnızca ziyaretçinin tarayıcısında
     kalıyordu — yani ajansa hiç ulaşmıyordu. */
  async function submitTo(kind, form) {
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.skills = fd.getAll("skills").join(", ");
    delete data.photos; delete data.video;
    data.sayfa = location.pathname + location.search;
    const record = { kind, data, at: new Date().toISOString() };

    try {
      const r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      if (r.ok) return { ok: true };
      return { ok: false, kod: r.status };
    } catch {
      return { ok: false, kod: 0 };
    } finally {
      /* Ulaşmadıysa yerelde sakla — ziyaretçi tekrar denerse kaybolmasın */
      if (!navigator.onLine) {
        const all = JSON.parse(localStorage.getItem("vera-submissions") || "[]");
        all.push(record);
        localStorage.setItem("vera-submissions", JSON.stringify(all));
      }
    }
  }

  function gonderimHatasi(kod) {
    if (kod === 0) return "İnternet bağlantınıza ulaşamadık. Bağlantınızı kontrol edip tekrar gönderin.";
    if (kod >= 502 && kod <= 504)
      return "Sunucumuz şu anda geçici olarak yanıt vermiyor (hata " + kod +
             "). Bilgileriniz formda duruyor; 1–2 dakika sonra tekrar gönderin.";
    return "Talebiniz gönderilemedi (hata " + kod + "). Lütfen tekrar deneyin ya da WhatsApp'tan yazın.";
  }

  function wire(formId, successId, kind) {
    const form = document.getElementById(formId);
    const success = document.getElementById(successId);
    if (!form) return;
    bindLiveValidation(form);
    /* Hata mesajı alanı (yoksa oluşturulur) */
    let hataEl = null;
    const hataGoster = metin => {
      if (!hataEl) {
        hataEl = document.createElement("p");
        hataEl.style.cssText = "margin-top:16px;padding:13px 16px;border:1px solid var(--danger);" +
          "border-radius:10px;color:var(--danger);font-size:.9rem;" +
          "background:color-mix(in srgb, var(--danger) 8%, transparent)";
        form.appendChild(hataEl);
      }
      hataEl.innerHTML = metin +
        ' <a class="gold" href="' + window.VERA.AGENCY.waLink() + '" target="_blank" rel="noopener">WhatsApp\'tan yazın →</a>';
      hataEl.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (!validate(form)) return;
      const btn = form.querySelector('button[type="submit"]');
      const eskiMetin = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Gönderiliyor…"; }

      const sonuc = await submitTo(kind, form);

      if (btn) { btn.disabled = false; btn.textContent = eskiMetin; }
      if (!sonuc.ok) { hataGoster(gonderimHatasi(sonuc.kod)); return; }   /* başarı GÖSTERİLMEZ */

      if (hataEl) hataEl.remove(), (hataEl = null);
      form.style.display = "none";
      const wsteps = form.closest(".form-card")?.querySelector(".wizard-steps");
      if (wsteps) wsteps.style.display = "none";
      success.classList.add("show");
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  wire("applyForm", "applySuccess", "basvuru");
  wire("quoteForm", "quoteSuccess", "teklif");
})();
