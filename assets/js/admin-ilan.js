/* =========================================================
   Yönetim paneli — İş İlanları modülü
   ---------------------------------------------------------
   admin.html'in genel kapsamındaki yardımcıları kullanır:
   $, api, toast, esc, DATA, load, onayIste, showAtab
   Bölümler:
     1. Hazır ilan şablonları
     2. İlan formu (oluştur / düzenle)
     3. Otomatik ilan görseli (önizleme kartı 1200×630, kare, hikâye)
     4. WhatsApp paylaşım metni + grup etiketli bağlantı
     5. Grup bazlı tıklama / başvuru istatistiği
     6. Başvurular (seç / ele / WhatsApp / iş teklifine dönüştür)
     7. Kadrodan uygun üyeleri bulma
   ========================================================= */
(function () {
  const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const KAT = { model: "Model", hostes: "Hostes", yuz: "Yüz Modeli", el_ayak: "El / Ayak Modeli", cocuk: "Çocuk Model",
    fitness: "Fitness Modeli", plus: "Büyük Beden Model", oyuncu: "Oyuncu", dans: "Dansçı", promo: "Promosyon Ekibi", figuran: "Figüran" };
  /* İlan türü → kadrodaki kategori eşleşmesi (uygun üye bulma) */
  const KAT_UYE = { figuran: ["oyuncu", "model"], promo: ["promo", "hostes"], plus: ["plus"], cocuk: ["cocuk"] };
  const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tarihTr = (t, yil) => { const d = new Date(String(t || "").slice(0, 10)); return isNaN(d) ? "" : d.getDate() + " " + AY[d.getMonth()] + (yil ? " " + d.getFullYear() : ""); };
  const kaynakTemiz = s => String(s || "").trim().toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/i̇/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const waNo = t => { let d = String(t || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "90" + d.slice(1); else if (d.length === 10 && d[0] === "5") d = "90" + d; return d; };
  const kriter = i => [i.gender === "kadin" ? "Kadın" : i.gender === "erkek" ? "Erkek" : "",
    i.age_min && i.age_max ? `${i.age_min}–${i.age_max} yaş` : i.age_min ? `${i.age_min}+ yaş` : i.age_max ? `${i.age_max} yaşa kadar` : "",
    i.height_min ? `${i.height_min} cm+` : ""].filter(Boolean).join(" · ");

  async function kopyala(metin) {
    try { await navigator.clipboard.writeText(metin); return true; }
    catch {
      const t = document.createElement("textarea"); t.value = metin; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok;
    }
  }

  /* =========================================================
     1. Hazır şablonlar — her ilan aynı profesyonellikte çıksın
     ========================================================= */
  const SABLON = {
    reklam_model: { ad: "📸 Reklam çekimi · Model", title: "Reklam çekimi için model aranıyor", category: "model", gender: "kadin", age_min: 18, age_max: 30, height_min: 165,
      description: "Ulusal bir marka için yapılacak reklam çekiminde yer alacak model arıyoruz.\nÇekim tek gün sürecek; saç, makyaj ve kostüm ekibimiz tarafından hazırlanacak.",
      requirements: "• Bakımlı cilt ve saç\n• Kamera karşısında rahat, doğal ifade\n• Çekim günü tam gün müsaitlik\n• Belirgin dövme olmaması tercih sebebidir" },
    katalog: { ad: "👗 Katalog / e-ticaret çekimi", title: "E-ticaret katalog çekimi için model", category: "model", gender: "kadin", age_min: 18, age_max: 32, height_min: 168,
      description: "Moda markasının yeni sezon katalog ve web sitesi çekimleri için model arıyoruz.\nStüdyo çekimidir, kıyafetler marka tarafından sağlanır.",
      requirements: "• Beden 34-38\n• Düzgün duruş ve poz verme deneyimi\n• Güncel boy ve beden ölçüleri" },
    defile: { ad: "✨ Defile / podyum", title: "Defile için podyum modeli aranıyor", category: "model", gender: "kadin", age_min: 18, age_max: 28, height_min: 174,
      description: "Moda haftası kapsamındaki defilede yürüyecek modeller arıyoruz.\nProva ve defile aynı hafta içinde yapılacaktır.",
      requirements: "• En az 174 cm boy\n• Podyum yürüyüşü deneyimi\n• Prova günlerine katılım" },
    hostes: { ad: "🎤 Fuar / etkinlik hostesi", title: "Fuar standı için hostes aranıyor", category: "hostes", gender: "kadin", age_min: 19, age_max: 30, height_min: 165,
      description: "Uluslararası fuarda marka standında ziyaretçi karşılama ve yönlendirme yapacak hostes arıyoruz.\nKıyafet ve yemek organizasyon tarafından karşılanır.",
      requirements: "• Güler yüzlü ve iletişimi güçlü\n• İngilizce bilmek tercih sebebidir\n• Fuar günlerinin tamamına katılım" },
    reklam_oyuncu: { ad: "🎬 Reklam filmi · Oyuncu", title: "Reklam filmi için oyuncu aranıyor", category: "oyuncu", gender: "", age_min: 20, age_max: 45,
      description: "Televizyon ve dijital mecralarda yayınlanacak reklam filmi için oyuncu arıyoruz.\nSeçmeler kamera karşısında kısa bir deneme çekimiyle yapılacaktır.",
      requirements: "• Kamera önü deneyimi\n• Doğal oyunculuk\n• Seçme ve çekim günlerinde müsaitlik" },
    figuran: { ad: "🎞 Dizi / film figüranı", title: "Dizi çekimi için figüran aranıyor", category: "figuran", gender: "", age_min: 18, age_max: 60,
      description: "Yayındaki bir dizinin sahneleri için figüranlar arıyoruz.\nÇekim saatleri set programına göre değişebilir.",
      requirements: "• Çekim günü esnek saat\n• Sete zamanında gelebilme\n• Kendi kıyafetlerinden seçenek getirebilme" },
    cocuk: { ad: "🧒 Çocuk oyuncu / model", title: "Reklam çekimi için çocuk oyuncu aranıyor", category: "cocuk", gender: "", age_min: 5, age_max: 12, minor: 1,
      description: "Aile ürünleri reklamı için çocuk oyuncu arıyoruz.\nÇekim boyunca velinin yanında bulunması zorunludur, mola saatleri çocuğa göre planlanır.",
      requirements: "• Veli onayı ve veli refakati\n• Kamera karşısında rahat\n• Çekim günü müsaitlik" },
    fitness: { ad: "💪 Fitness / spor", title: "Spor markası için fitness modeli", category: "fitness", gender: "", age_min: 18, age_max: 35,
      description: "Spor giyim markasının kampanya çekimi için fitness modeli arıyoruz.\nÇekim stüdyo ve dış mekânda yapılacaktır.",
      requirements: "• Atletik fiziksel yapı\n• Hareketli pozlarda deneyim\n• Güncel boy ve kilo bilgisi" },
    guzellik: { ad: "💄 Güzellik / yüz modeli", title: "Kozmetik çekimi için yüz modeli", category: "yuz", gender: "kadin", age_min: 18, age_max: 35,
      description: "Kozmetik markasının ürün tanıtım çekimi için yüz modeli arıyoruz.\nYakın plan çekimdir, makyaj ekibimiz tarafından yapılır.",
      requirements: "• Temiz, bakımlı cilt\n• Düzgün kaş ve dudak hattı\n• Yakın plan çekim deneyimi tercih sebebidir" },
    promo: { ad: "🛍 Promosyon / tanıtım ekibi", title: "Mağaza tanıtımı için promosyon ekibi", category: "promo", gender: "", age_min: 18, age_max: 35,
      description: "AVM ve mağazalarda ürün tanıtımı yapacak promosyon ekibi arıyoruz.\nEğitim ilk gün verilecektir.",
      requirements: "• İletişimi güçlü, enerjik\n• Hafta sonu çalışabilme\n• Ayakta uzun süre çalışabilme" },
    dans: { ad: "💃 Dansçı / performans", title: "Etkinlik için dansçı aranıyor", category: "dans", gender: "", age_min: 18, age_max: 32,
      description: "Lansman etkinliğinde sahne alacak dansçılar arıyoruz.\nKoreografi provaları etkinlikten önce yapılacaktır.",
      requirements: "• Sahne deneyimi\n• Prova günlerine katılım\n• Video ile kısa bir dans kaydı gönderebilme" },
  };

  /* =========================================================
     2. İlan formu
     ========================================================= */
  const ALAN = ["title", "category", "city", "location", "date", "deadline", "fee", "spots", "gender", "age_min", "age_max", "height_min", "description", "requirements", "minor"];
  function formHtml(i) {
    i = i || {};
    const sec = (v, x) => String(v ?? "") === String(x) ? " selected" : "";
    return `<div class="form-card" style="margin-top:12px;background:var(--bg-2)">
      <div class="adm-row" style="margin-bottom:10px">
        <strong>${i.id ? "✏️ İlanı Düzenle" : "📝 Yeni İlan"}</strong>
        ${i.id ? "" : `<select class="adm-input" id="iSablon"><option value="">Hazır şablondan başla…</option>
          ${Object.entries(SABLON).map(([k, s]) => `<option value="${k}">${s.ad}</option>`).join("")}</select>`}
      </div>
      <div class="form-grid">
        <div class="field full"><label>İlan Başlığı *</label><input id="i_title" value="${h(i.title)}" placeholder="örn. Reklam çekimi için model aranıyor"></div>
        <div class="field"><label>Aranan</label><select id="i_category">${Object.entries(KAT).map(([k, v]) => `<option value="${k}"${sec(i.category || "model", k)}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>Şehir</label><input id="i_city" value="${h(i.city || "İstanbul")}"></div>
        <div class="field"><label>Yer / Lokasyon</label><input id="i_location" value="${h(i.location)}" placeholder="örn. Kadıköy stüdyo"></div>
        <div class="field"><label>Çekim / İş Tarihi</label><input type="date" id="i_date" value="${h(i.date)}"></div>
        <div class="field"><label>Son Başvuru Tarihi</label><input type="date" id="i_deadline" value="${h(i.deadline)}"></div>
        <div class="field"><label>Ücret</label><input id="i_fee" value="${h(i.fee)}" placeholder="örn. 5.000 TL / gün"></div>
        <div class="field"><label>Kaç kişi aranıyor (kontenjan)</label><input type="number" min="0" id="i_spots" value="${h(i.spots || "")}" placeholder="boş = sınırsız"></div>
        <div class="field"><label>Cinsiyet</label><select id="i_gender"><option value="">Fark etmez</option>
          <option value="kadin"${sec(i.gender, "kadin")}>Kadın</option><option value="erkek"${sec(i.gender, "erkek")}>Erkek</option></select></div>
        <div class="field"><label>Yaş aralığı</label><div class="adm-row"><input type="number" id="i_age_min" value="${h(i.age_min)}" placeholder="en az" style="width:90px">
          <input type="number" id="i_age_max" value="${h(i.age_max)}" placeholder="en çok" style="width:90px"></div></div>
        <div class="field"><label>En az boy (cm)</label><input type="number" id="i_height_min" value="${h(i.height_min)}" placeholder="örn. 170"></div>
        <div class="field full"><label>İş Hakkında</label><textarea id="i_description" rows="3">${h(i.description)}</textarea></div>
        <div class="field full"><label>Aranan Özellikler</label><textarea id="i_requirements" rows="3">${h(i.requirements)}</textarea></div>
        <div class="field full"><div class="checkbox-row"><input type="checkbox" id="i_minor"${i.minor === "1" ? " checked" : ""}>
          <label for="i_minor" style="margin:0;text-transform:none;letter-spacing:.02em;font-size:.86rem">18 yaş altı adaylar da başvurabilir (veli onayı otomatik zorunlu olur)</label></div></div>
        <div class="full adm-row">
          <button class="btn btn-gold btn-sm" id="iKaydet">${i.id ? "💾 Kaydet" : "📣 İlanı Yayınla"}</button>
          <button class="btn btn-ghost btn-sm" id="iVazgec">Vazgeç</button>
          <span class="mini" id="iMsg"></span>
        </div>
      </div>
    </div>`;
  }
  function formAc(ilan) {
    const w = $("ilanFormWrap");
    w.innerHTML = formHtml(ilan); w.hidden = false;
    $("iSablon")?.addEventListener("change", e => {
      const s = SABLON[e.target.value]; if (!s) return;
      ALAN.forEach(k => {
        const el = $("i_" + k); if (!el || k === "city" || k === "location" || k === "date" || k === "deadline" || k === "fee" || k === "spots") return;
        if (el.type === "checkbox") el.checked = !!s[k]; else el.value = s[k] ?? "";
      });
      toast("Şablon dolduruldu — tarih, yer ve ücreti girin");
    });
    $("i_category").addEventListener("change", e => { if (e.target.value === "cocuk") $("i_minor").checked = true; });
    $("iVazgec").addEventListener("click", () => { w.hidden = true; w.innerHTML = ""; });
    $("iKaydet").addEventListener("click", async () => {
      const govde = { id: ilan?.id || undefined };
      ALAN.forEach(k => { const el = $("i_" + k); govde[k] = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.value.trim(); });
      if (!govde.title) { $("iMsg").textContent = "Başlık gerekli"; return; }
      if (govde.deadline && govde.date && govde.deadline > govde.date) { $("iMsg").textContent = "Son başvuru, iş tarihinden sonra olamaz"; return; }
      $("iKaydet").disabled = true; $("iMsg").textContent = "Kaydediliyor…";
      const r = await api("/api/admin/ilan", govde);
      if (!r.ok) { $("iKaydet").disabled = false; $("iMsg").textContent = r.err || "Kaydedilemedi"; return; }
      $("iMsg").textContent = "Paylaşım görseli hazırlanıyor…";
      const ok = await gorselYukle({ ...govde, id: r.data.id, kod: r.data.kod });
      w.hidden = true; w.innerHTML = "";
      toast(ilan?.id ? "✓ İlan güncellendi" : "📣 İlan yayında — aşağıdan grubunuzu seçip paylaşın" + (ok ? "" : " (görsel yüklenemedi)"), ok ? "" : "hata");
      acikIlan = r.data.id;
      await load();
    });
    w.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* =========================================================
     3. Otomatik ilan görseli
     ========================================================= */
  const RENK = { zemin1: "#fdf1f5", zemin2: "#f5cfdb", vurgu: "#d34f6e", vurgu2: "#b8385a", metin: "#241318", ikincil: "#7a5562" };
  function resimYukle(src) {
    return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  /* Görsele konacak kadro fotoğrafları: kategori + cinsiyete uyan, yayındaki üyelerin kapakları */
  async function kadroFotolari(ilan, adet) {
    const kats = KAT_UYE[ilan.category] || [ilan.category];
    const aday = (DATA.users || []).filter(u => {
      const p = u.profile || {};
      if (p.published !== "1" || p.status !== "onaylandi" || p.privacy !== "public") return false;
      if (ilan.gender && p.gender && p.gender !== ilan.gender) return false;
      const uk = (p.category || "").split(",");
      return kats.some(k => uk.includes(k));
    });
    const havuz = aday.length >= adet ? aday : (DATA.users || []).filter(u => u.profile?.published === "1" && u.profile?.status === "onaylandi" &&
      (!ilan.gender || u.profile?.gender === ilan.gender));
    const karisik = havuz.slice().sort(() => Math.random() - .5);
    const out = [];
    for (const u of karisik) {
      if (out.length >= adet) break;
      const f = (u.media || []).filter(m => m.kind === "photo" && !m.deleted && m.album !== "sanatsal");
      const k = f.find(m => String(m.id) === String(u.profile?.cover_photo)) || f[0];
      if (!k) continue;
      const im = await resimYukle(`/api/photo/${k.id}?k=1`);
      if (im) out.push(im);
    }
    return out;
  }
  function kapla(x, im, dx, dy, dw, dh) {     /* object-fit: cover, yüz üstte kalsın */
    const s = Math.max(dw / im.width, dh / im.height);
    const sw = dw / s, sh = dh / s;
    x.drawImage(im, (im.width - sw) / 2, (im.height - sh) * 0.18, sw, sh, dx, dy, dw, dh);
  }
  function yuvarlak(x, a, b, w, hh, r) { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, hh, r) : x.rect(a, b, w, hh); }
  function satirla(x, metin, maks) {
    const kel = String(metin).split(/\s+/); const out = []; let s = "";
    kel.forEach(k => { const d = s ? s + " " + k : k; if (x.measureText(d).width > maks && s) { out.push(s); s = k; } else s = d; });
    if (s) out.push(s); return out;
  }
  async function fontlarHazir() {
    try { await Promise.all(['600 60px "Cormorant Garamond"', '500 30px "Jost"', '600 30px "Jost"', '64px "Great Vibes"'].map(f => document.fonts.load(f))); } catch {}
  }
  async function gorselCiz(ilan, tur) {
    await fontlarHazir();
    const boyut = { og: [1200, 630], kare: [1080, 1080], hikaye: [1080, 1920] }[tur];
    const [W, H] = boyut;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, RENK.zemin1); g.addColorStop(1, RENK.zemin2);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    /* dekoratif halkalar */
    x.strokeStyle = "rgba(211,79,110,.14)"; x.lineWidth = 2;
    [[W * .92, H * .1, H * .35], [W * .05, H * .95, H * .28]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.stroke(); });

    const yatay = tur === "og", hikaye = tur === "hikaye";
    const fotolar = await kadroFotolari(ilan, 3);
    /* --- Fotoğraf kolajı --- */
    if (fotolar.length) {
      const fw = yatay ? 230 : (tur === "kare" ? 250 : 360), fh = fw * 4 / 3;
      const alanX = yatay ? W - 520 : (W - fw * 2.24) / 2, alanY = yatay ? 70 : (tur === "kare" ? 60 : 170);
      const yer = [[0, 50, -6], [fw * .62, 0, 3], [fw * 1.24, 60, 8]];
      fotolar.forEach((im, i) => {
        const [ox, oy, aci] = yer[i];
        x.save();
        x.translate(alanX + ox + fw / 2, alanY + oy + fh / 2); x.rotate(aci * Math.PI / 180);
        x.shadowColor = "rgba(120,30,60,.28)"; x.shadowBlur = 30; x.shadowOffsetY = 12;
        x.fillStyle = "#fff"; yuvarlak(x, -fw / 2 - 8, -fh / 2 - 8, fw + 16, fh + 16, 14); x.fill();
        x.shadowColor = "transparent";
        yuvarlak(x, -fw / 2, -fh / 2, fw, fh, 10); x.save(); x.clip(); kapla(x, im, -fw / 2, -fh / 2, fw, fh); x.restore();
        x.restore();
      });
    }
    /* --- Metin bloğu --- */
    const solX = yatay ? 64 : 80;
    const metinW = yatay ? (fotolar.length ? 600 : W - 128) : W - 160;
    let y = yatay ? 78 : (fotolar.length ? (tur === "kare" ? 520 : 890) : 200);
    x.textBaseline = "alphabetic"; x.textAlign = "left";
    x.fillStyle = RENK.vurgu2; x.font = '600 22px "Jost"';
    x.letterSpacing = "6px"; x.fillText("MODEL OF WORLD", solX, y); x.letterSpacing = "0px";
    y += yatay ? 70 : 90;
    x.fillStyle = RENK.vurgu; x.font = `${yatay ? 62 : 80}px "Great Vibes"`; x.fillText("Casting Çağrısı", solX - 4, y);
    y += yatay ? 50 : 70;
    x.fillStyle = RENK.metin; x.font = `600 ${yatay ? 26 : 32}px "Jost"`;
    x.letterSpacing = "3px"; x.fillText(((KAT[ilan.category] || "Model") + " aranıyor").toLocaleUpperCase("tr-TR"), solX, y); x.letterSpacing = "0px";
    y += yatay ? 18 : 24;
    x.font = `600 ${yatay ? 50 : 64}px "Cormorant Garamond"`;
    const sat = satirla(x, ilan.title || "", metinW).slice(0, yatay ? 3 : 4);
    sat.forEach(s => { y += yatay ? 54 : 70; x.fillText(s, solX, y); });
    y += yatay ? 40 : 56;
    x.fillStyle = RENK.ikincil; x.font = `500 ${yatay ? 24 : 32}px "Jost"`;
    const detay = [ilan.city, ilan.date ? tarihTr(ilan.date) : "", kriter(ilan)].filter(Boolean).join("  ·  ");
    satirla(x, detay, metinW).slice(0, 2).forEach((s, i) => { x.fillText(s, solX, y + i * (yatay ? 32 : 44)); });
    y += yatay ? 64 : 96;
    /* CTA hapı */
    const cta = "Başvuru ücretsiz  ·  modelofworld.com";
    x.font = `600 ${yatay ? 24 : 32}px "Jost"`;
    const cw = x.measureText(cta).width + (yatay ? 56 : 72), ch = yatay ? 56 : 76;
    const cg = x.createLinearGradient(solX, 0, solX + cw, 0); cg.addColorStop(0, "#c73a5e"); cg.addColorStop(1, "#e8718e");
    x.fillStyle = cg; yuvarlak(x, solX, y - ch + (yatay ? 16 : 22), cw, ch, ch / 2); x.fill();
    x.fillStyle = "#fff"; x.fillText(cta, solX + (yatay ? 28 : 36), y + (yatay ? 2 : 4));
    if (ilan.deadline) {
      x.fillStyle = RENK.metin; x.font = `500 ${yatay ? 20 : 28}px "Jost"`;
      x.fillText("Son başvuru: " + tarihTr(ilan.deadline, false), solX, y + (yatay ? 52 : 80));
    }
    /* Dikey (durum/hikâye) görselde alt bant: güven satırları + yönlendirme */
    if (hikaye) {
      const by = H - 300;
      x.fillStyle = "rgba(255,255,255,.62)"; yuvarlak(x, 60, by, W - 120, 200, 28); x.fill();
      x.fillStyle = RENK.metin; x.font = '500 30px "Jost"';
      ["✓  Başvuru ücretsizdir", "✓  Sözleşmeli ve güvenli çalışma", "✓  1 dakikada online başvuru"]
        .forEach((s, i) => x.fillText(s, 100, by + 62 + i * 50));
      x.fillStyle = RENK.vurgu; x.font = '600 30px "Jost"'; x.textAlign = "center";
      x.fillText("Başvuru linki mesajda  ↑", W / 2, H - 50); x.textAlign = "left";
    }
    return c;
  }
  async function gorselYukle(ilan) {
    try {
      const c = await gorselCiz(ilan, "og");
      let q = .88, b = null;
      do { b = await new Promise(r => c.toBlob(r, "image/jpeg", q)); q -= .08; } while (b && b.size > 600 * 1024 && q > .5);
      const fd = new FormData(); fd.append("id", ilan.id); fd.append("file", b, "ilan.jpg");
      const r = await fetch("/api/admin/ilan-gorsel", { method: "POST", body: fd }).catch(() => null);
      return !!(r && r.ok);
    } catch (e) { console.warn("ilan görseli", e); return false; }
  }
  async function gorselIndir(ilan, tur) {
    const c = await gorselCiz(ilan, tur);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", .92));
    const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = `${ilan.kod}-${tur}.jpg`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* =========================================================
     4. WhatsApp paylaşım metni
     ========================================================= */
  function paylasimLinki(ilan, grup) { const k = kaynakTemiz(grup); return ilan.link + (k ? "?k=" + k : ""); }
  function paylasimMetni(ilan, grup, kisa) {
    const link = paylasimLinki(ilan, grup);
    const kat = (KAT[ilan.category] || "Model").toLocaleUpperCase("tr-TR");
    const cocuk = ilan.minor === "1" || ilan.category === "cocuk";
    if (kisa) {
      return `🎬 *${kat} ARANIYOR*${ilan.city ? " · " + ilan.city : ""}\n${ilan.title}\n` +
        [ilan.date ? "📅 " + tarihTr(ilan.date, true) : "", kriter(ilan) ? "👤 " + kriter(ilan) : ""].filter(Boolean).join("  ") +
        `\n✅ Başvuru ücretsiz 👉 ${link}`;
    }
    const s = [`🎬 *${kat} ARANIYOR*${ilan.city ? " · " + ilan.city : ""}`, "", `*${ilan.title}*`];
    if (ilan.date) s.push("📅 Tarih: " + tarihTr(ilan.date, true));
    if (ilan.location || ilan.city) s.push("📍 Yer: " + [ilan.location, ilan.city].filter(Boolean).join(", "));
    if (kriter(ilan)) s.push("👤 Aranan: " + kriter(ilan));
    if (ilan.fee) s.push("💰 Ücret: " + ilan.fee);
    if (ilan.spots) s.push("🎯 Kontenjan: " + ilan.spots + " kişi" + (ilan.kalan != null && ilan.kalan < ilan.spots ? ` (kalan ${ilan.kalan})` : ""));
    if (ilan.deadline) s.push("⏳ Son başvuru: " + tarihTr(ilan.deadline, true));
    s.push("", "✅ Başvuru ücretsizdir, sizden hiçbir ücret istenmez.", "✍️ Tüm işler sözleşmelidir, ücret önceden bildirilir.");
    if (cocuk) s.push("👨‍👩‍👧 18 yaş altı için veli onayı ve veli refakati zorunludur.");
    s.push("", "👉 Detaylar ve 1 dakikada başvuru:", link, "", "_Model of World_");
    return s.join("\n");
  }

  /* =========================================================
     5-7. İlan kartları
     ========================================================= */
  let acikIlan = null;                         /* hangi kart açık kalsın */
  const seciliGrup = {};                      /* ilan id → paylaşım için seçilen grup (yenilemede korunur) */
  const acikBolum = {};                       /* ilan id → açık alt bölüm (başvuru / uygun) */
  const grupAdi = k => {
    if (!k) return "Doğrudan / grupsuz";
    if (k === "site") return "Sitedeki ilanlar sayfası";
    if (k === "kadro") return "Kadroya doğrudan mesaj";
    const ileti = k.endsWith("-ileti");
    const kok = ileti ? k.slice(0, -6) : k;
    const ad = (DATA.wa_gruplar || []).find(g => kaynakTemiz(g) === kok) || kok;
    return ileti ? ad + " (arkadaşına iletilen)" : ad;
  };
  function durumRozet(i) {
    if (i.status === "kapali") return '<span class="adm-badge">⏸ kapalı</span>';
    if (!i.acik) return `<span class="adm-badge eksik" title="${h(i.kapali_neden)}">⏹ otomatik kapandı</span>`;
    return '<span class="adm-badge" style="color:#20744c;border-color:#4da878">● yayında</span>';
  }
  function istatistik(i) {
    const kaynaklar = [...new Set([...Object.keys(i.ziyaret || {}), ...Object.keys(i.kaynak_basvuru || {})])];
    if (!kaynaklar.length) return '<p class="mini">Henüz tıklama yok. Paylaştıkça hangi gruptan kaç kişinin geldiği burada görünür.</p>';
    kaynaklar.sort((a, b) => ((i.kaynak_basvuru[b] || 0) - (i.kaynak_basvuru[a] || 0)) || ((i.ziyaret[b] || 0) - (i.ziyaret[a] || 0)));
    return `<table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <tr style="text-align:left;color:var(--text-2)"><th style="padding:6px">Grup</th><th>Tıklama</th><th>Başvuru</th><th>Dönüşüm</th></tr>
      ${kaynaklar.map(k => { const z = i.ziyaret[k] || 0, b = i.kaynak_basvuru[k] || 0;
        return `<tr style="border-top:1px solid var(--line)"><td style="padding:6px">${h(grupAdi(k))}</td><td>${z}</td><td><strong>${b}</strong></td>
          <td>${z ? Math.round(b / z * 100) + "%" : "—"}</td></tr>`; }).join("")}
    </table>`;
  }
  function basvuruListesi(i) {
    const L = i.basvurular || [];
    if (!L.length) return '<p class="mini">Henüz başvuru yok.</p>';
    const ROZ = { yeni: ["🆕 yeni", ""], secildi: ["✓ seçildi", "color:#20744c;border-color:#4da878"], elendi: ["✕ elendi", "opacity:.6"] };
    return `<div class="adm-row" style="margin-bottom:8px">
        <button class="btn btn-gold btn-sm" data-il-teklif="${i.id}" title="Seçilen adaylara iş teklifi gönderir — teklif üyelerin paneline düşer">💼 Seçilenlere İş Teklifi Gönder</button>
        <button class="btn btn-ghost btn-sm" data-il-csv="${i.id}">⬇ Excel'e aktar</button>
      </div>
      ${L.map(b => `<div class="adm-row" style="border-top:1px solid var(--line);padding:8px 0;align-items:flex-start;gap:12px">
        ${b.foto ? `<a href="/api/photo/${b.foto}" target="_blank"><img src="/api/photo/${b.foto}?k=1" style="width:58px;height:77px;object-fit:cover;border-radius:8px;border:1px solid var(--line)" loading="lazy"></a>` : '<div style="width:58px;height:77px;border-radius:8px;background:var(--bg-2)"></div>'}
        <div style="flex:1;min-width:200px">
          <strong style="color:var(--text)">${h(b.fullname)}</strong>
          <span class="adm-badge" style="${ROZ[b.status]?.[1] || ""}">${ROZ[b.status]?.[0] || b.status}</span>
          ${b.uye_durum !== "onaylandi" ? '<span class="adm-badge eksik" title="Bu ilanla yeni üye oldu, üyeliği henüz onaylanmadı">yeni üye · onay bekliyor</span>' : ""}
          <div class="mini">${[b.age ? b.age + " yaş" : "", b.height ? b.height + " cm" : "", b.city].filter(Boolean).join(" · ") || "ölçü yok"} · 📞 ${h(b.phone)} · gruptan: ${h(grupAdi(b.source))} · ${h((b.created || "").slice(0, 10))}</div>
          ${b.parent_name ? `<div class="mini">👨‍👩‍👧 Veli: ${h(b.parent_name)} ${h(b.parent_phone)}</div>` : ""}
          ${b.note ? `<div class="mini">💬 ${h(b.note)}</div>` : ""}
        </div>
        <div class="adm-row">
          ${b.status !== "secildi" ? `<button class="btn btn-gold btn-sm" data-il-bd="${b.id}" data-st="secildi">✓ Seç</button>` : ""}
          ${b.status !== "elendi" ? `<button class="btn btn-ghost btn-sm" data-il-bd="${b.id}" data-st="elendi">✕ Ele</button>` : ""}
          ${b.status !== "yeni" ? `<button class="btn btn-ghost btn-sm" data-il-bd="${b.id}" data-st="yeni" title="Değerlendirmeye geri al">↺</button>` : ""}
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${waNo(b.parent_phone && b.age < 18 ? b.parent_phone : b.phone)}?text=${encodeURIComponent(`Merhaba ${(b.fullname || "").split(" ")[0]}, Model of World'den yazıyoruz. "${i.title}" ilanına başvurunuz için teşekkür ederiz.`)}">🟢 WhatsApp</a>
          <a class="btn btn-ghost btn-sm" target="_blank" href="sedcard?id=${b.user_id}">🪪</a>
        </div>
      </div>`).join("")}`;
  }
  /* 7. Kadrodan uygun üyeler */
  function uygunUyeler(i, sadeceSehir) {
    const kats = KAT_UYE[i.category] || [i.category];
    const basvuran = new Set((i.basvurular || []).map(b => b.user_id));
    return (DATA.users || []).filter(u => {
      const p = u.profile || {};
      if (p.status !== "onaylandi" || p.frozen === "1" || basvuran.has(u.id)) return false;
      if (i.gender && p.gender !== i.gender) return false;
      const yas = +p.age || 0, boy = +p.height || 0;
      if (i.age_min && yas && yas < i.age_min) return false;
      if (i.age_max && yas && yas > i.age_max) return false;
      if ((i.age_min || i.age_max) && !yas) return false;
      if (i.height_min && boy && boy < i.height_min) return false;
      if (!(i.minor === "1" || i.category === "cocuk") && yas && yas < 18) return false;
      if (sadeceSehir && i.city && (p.city || "").toLocaleLowerCase("tr") !== i.city.toLocaleLowerCase("tr")) return false;
      return kats.some(k => (p.category || "").split(",").includes(k));
    });
  }
  const yazildi = () => { try { return JSON.parse(localStorage.getItem("mow-ilan-yazildi") || "{}"); } catch { return {}; } };
  function uygunHtml(i) {
    const sehir = localStorage.getItem("mow-ilan-sehir") !== "0";
    const L = uygunUyeler(i, sehir);
    const yz = yazildi()[i.id] || [];
    const link = paylasimLinki(i, "kadro");
    return `<div class="adm-row" style="margin-bottom:6px">
        <label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-il-sehir="${i.id}"${sehir ? " checked" : ""}> Yalnızca ${h(i.city || "aynı şehir")}</label>
        <span class="mini">${L.length} uygun üye · ${yz.length} kişiye yazıldı</span>
      </div>
      ${L.length ? L.slice(0, 80).map(u => {
        const p = u.profile || {}, ad = (u.fullname || "").split(" ")[0];
        const tel = (+p.age < 18 && p.parent_phone) ? p.parent_phone : u.phone;
        const metin = `Merhaba ${ad}, Model of World'den yazıyoruz. Profilinize uygun yeni bir iş var:\n\n*${i.title}*` +
          (i.city || i.date ? `\n📍 ${[i.city, i.date ? tarihTr(i.date, true) : ""].filter(Boolean).join(" · ")}` : "") +
          (i.fee ? `\n💰 ${i.fee}` : "") + `\n\nDetaylar ve tek tıkla başvuru: ${link}`;
        const oldu = yz.includes(u.id);
        return `<div class="adm-row" style="border-top:1px solid var(--line);padding:6px 0">
          <span style="flex:1;min-width:180px">${oldu ? "✅ " : ""}<strong>${h(u.fullname)}</strong> <span class="mini">${[p.age ? p.age + " yaş" : "", p.height ? p.height + " cm" : "", p.city].filter(Boolean).join(" · ")}</span></span>
          <a class="btn ${oldu ? "btn-ghost" : "btn-gold"} btn-sm" data-il-yaz="${i.id}" data-uid="${u.id}" target="_blank" rel="noopener"
             href="https://wa.me/${waNo(tel)}?text=${encodeURIComponent(metin)}">🟢 ${oldu ? "Tekrar yaz" : "WhatsApp'tan yaz"}</a>
        </div>`; }).join("") : '<p class="mini">Kriterlere uyan onaylı üye bulunamadı. Şehir filtresini kaldırmayı deneyin.</p>'}
      ${L.length > 80 ? `<p class="mini">İlk 80 üye gösteriliyor.</p>` : ""}`;
  }

  function kartHtml(i) {
    const acik = acikIlan === i.id;
    const yeni = (i.basvurular || []).filter(b => b.status === "yeni").length;
    const secilen = (i.basvurular || []).filter(b => b.status === "secildi").length;
    const gruplar = DATA.wa_gruplar || [];
    const bolum = acikBolum[i.id] || "basvuru";
    return `<div class="adm-user${acik ? " open" : ""}" data-ilan="${i.id}">
      <div class="adm-head" data-il-ac="${i.id}" style="cursor:pointer;display:flex;gap:12px;align-items:center;padding:12px 14px;flex-wrap:wrap">
        ${i.gorsel ? `<img src="${h(i.gorsel)}" style="width:96px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--line)">` : ""}
        <div style="flex:1;min-width:200px">
          <strong style="color:var(--text)">${h(i.title)}</strong> ${durumRozet(i)}
          <div class="mini">${h(KAT[i.category] || "")} · ${h([i.city, i.date ? tarihTr(i.date, true) : ""].filter(Boolean).join(" · "))}${i.deadline ? " · son başvuru " + tarihTr(i.deadline) : ""}</div>
        </div>
        <span class="adm-badge">👁 ${i.ziyaret_toplam || 0} tıklama</span>
        <span class="adm-badge"${yeni ? ' style="color:#c33;border-color:#d95a5a"' : ""}>📥 ${(i.basvurular || []).length} başvuru${yeni ? ` (${yeni} yeni)` : ""}</span>
        ${i.spots ? `<span class="adm-badge">🎯 ${secilen}/${i.spots} seçildi</span>` : ""}
      </div>
      <div class="adm-body"${acik ? ' style="display:block"' : ""}>
        ${!i.acik && i.kapali_neden ? `<p class="mini" style="color:var(--danger)">${h(i.kapali_neden)}</p>` : ""}
        <div class="form-card" style="background:var(--bg-2);margin-bottom:12px">
          <strong>📤 WhatsApp'ta paylaş</strong>
          <div class="adm-row" style="margin-top:8px">
            <select class="adm-input" data-il-grup="${i.id}">
              <option value="">Grup seçin (takip için)…</option>
              ${gruplar.map(g => `<option value="${h(g)}"${seciliGrup[i.id] === g ? " selected" : ""}>${h(g)}</option>`).join("")}
              <option value="__yeni">+ Yeni grup ekle…</option>
            </select>
            <label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-il-kisa="${i.id}"> Kısa metin</label>
          </div>
          <textarea class="adm-input" data-il-metin="${i.id}" rows="9" style="width:100%;margin-top:8px;font-family:inherit;font-size:.84rem">${h(paylasimMetni(i, seciliGrup[i.id] || "", false))}</textarea>
          <div class="adm-row" style="margin-top:8px">
            <button class="btn btn-gold btn-sm" data-il-wa="${i.id}">🟢 WhatsApp'ta Aç</button>
            <button class="btn btn-ghost btn-sm" data-il-kopya="${i.id}">📋 Metni Kopyala</button>
            <button class="btn btn-ghost btn-sm" data-il-linkkopya="${i.id}">🔗 Linki Kopyala</button>
            <a class="btn btn-ghost btn-sm" href="${h(i.link)}" target="_blank" rel="noopener">👁 İlan Sayfası</a>
          </div>
          <div class="adm-row" style="margin-top:8px">
            <span class="mini">Görsel indir:</span>
            <button class="btn btn-ghost btn-sm" data-il-gorsel="${i.id}" data-tur="kare">⬛ Kare (gönderi)</button>
            <button class="btn btn-ghost btn-sm" data-il-gorsel="${i.id}" data-tur="hikaye">📱 Dikey (durum / hikâye)</button>
            <button class="btn btn-ghost btn-sm" data-il-gorsel="${i.id}" data-tur="og">🖼 Yatay</button>
            <button class="btn btn-ghost btn-sm" data-il-yenile="${i.id}" title="Önizleme kartındaki görseli yeni kadro fotoğraflarıyla yeniden üretir">🔄 Kart görselini yenile</button>
          </div>
          <p class="mini" style="margin-top:6px">İpucu: Linki gruba attıktan sonra önizleme kartının yüklenmesi için 1-2 saniye bekleyip gönderin.</p>
        </div>

        <strong>📊 Hangi gruptan kaç kişi geldi?</strong>
        <div style="margin:6px 0 14px">${istatistik(i)}</div>

        <div class="adm-row" style="margin-bottom:8px">
          <button class="btn ${bolum === "basvuru" ? "btn-gold" : "btn-ghost"} btn-sm" data-il-bolum="${i.id}" data-b="basvuru">📥 Başvurular (${(i.basvurular || []).length})</button>
          <button class="btn ${bolum === "uygun" ? "btn-gold" : "btn-ghost"} btn-sm" data-il-bolum="${i.id}" data-b="uygun">🎯 Kadrodan Uygun Üyeler</button>
        </div>
        <div>${bolum === "uygun" ? uygunHtml(i) : basvuruListesi(i)}</div>

        <div class="adm-row" style="margin-top:14px;border-top:1px solid var(--line);padding-top:10px">
          <button class="btn btn-ghost btn-sm" data-il-duzenle="${i.id}">✏️ Düzenle</button>
          ${i.status === "acik" ? `<button class="btn btn-ghost btn-sm" data-il-durum="${i.id}" data-st="kapali">⏸ Başvuruları Kapat</button>`
                                : `<button class="btn btn-gold btn-sm" data-il-durum="${i.id}" data-st="acik">▶ Yeniden Aç</button>`}
          <button class="btn btn-tehlike btn-sm" data-il-durum="${i.id}" data-st="silindi">🗑 Sil</button>
        </div>
      </div>
    </div>`;
  }

  window.renderIlanlar = function () {
    if (!$("ilanList")) return;
    const L = (DATA.ilanlar || []).filter(i => i.status !== "silindi");
    const yayinda = L.filter(i => i.acik).length;
    const yeni = L.reduce((n, i) => n + (i.basvurular || []).filter(b => b.status === "yeni").length, 0);
    $("ilanOzet").textContent = `${yayinda} ilan yayında · ${yeni} yeni başvuru`;
    $("ilanList").innerHTML = L.length ? L.map(kartHtml).join("")
      : '<div class="bos-durum"><span class="ikon">📣</span>Henüz ilan yok. <strong>+ Yeni İlan</strong> ile ilk ilanınızı oluşturun.</div>';
  };

  /* ---------- Grup yönetimi ---------- */
  $("ilanGrupBtn")?.addEventListener("click", () => {
    const w = $("ilanGrupWrap");
    if (!w.hidden) { w.hidden = true; return; }
    w.hidden = false;
    w.innerHTML = `<div class="form-card" style="margin-top:12px;background:var(--bg-2)">
      <strong>👥 WhatsApp Gruplarım</strong>
      <p class="mini" style="margin:6px 0">Paylaşım yaptığınız grupların adlarını her satıra bir tane yazın. Her gruba ayrı takip bağlantısı üretilir; hangi gruptan kaç başvuru geldiğini görürsünüz.</p>
      <textarea class="adm-input" id="grupMetin" rows="7" style="width:100%" placeholder="Kadıköy Oyuncular&#10;İstanbul Model Casting&#10;Fuar Hostesleri">${h((DATA.wa_gruplar || []).join("\n"))}</textarea>
      <div class="adm-row" style="margin-top:8px"><button class="btn btn-gold btn-sm" id="grupKaydet">Kaydet</button></div>
    </div>`;
    $("grupKaydet").addEventListener("click", async () => {
      const gruplar = $("grupMetin").value.split("\n").map(s => s.trim()).filter(Boolean);
      const r = await api("/api/admin/wa-gruplar", { gruplar });
      if (!r.ok) return toast(r.err || "Kaydedilemedi", "hata");
      toast("✓ " + r.data.gruplar.length + " grup kaydedildi"); w.hidden = true; load();
    });
  });
  $("ilanYeniBtn")?.addEventListener("click", () => formAc(null));

  /* ---------- Kart olayları ---------- */
  const bul = id => (DATA.ilanlar || []).find(x => x.id === +id);
  const metinGuncelle = id => {
    const i = bul(id); if (!i) return;
    const grup = document.querySelector(`[data-il-grup="${id}"]`)?.value || "";
    const kisa = document.querySelector(`[data-il-kisa="${id}"]`)?.checked;
    const ta = document.querySelector(`[data-il-metin="${id}"]`);
    seciliGrup[id] = grup === "__yeni" ? "" : grup;
    if (ta) ta.value = paylasimMetni(i, seciliGrup[id], kisa);
  };
  $("ilanList")?.addEventListener("change", async e => {
    const g = e.target.closest("[data-il-grup]");
    if (g && g.value === "__yeni") {
      const ad = (prompt("Yeni WhatsApp grubunun adı:") || "").trim();
      if (!ad) { g.value = ""; return; }
      const gruplar = [...(DATA.wa_gruplar || []), ad];
      const r = await api("/api/admin/wa-gruplar", { gruplar });
      if (r.ok) {
        DATA.wa_gruplar = r.data.gruplar;
        const opt = document.createElement("option"); opt.value = ad; opt.textContent = ad;
        g.insertBefore(opt, g.querySelector('[value="__yeni"]')); g.value = ad;
        toast("✓ Grup eklendi: " + ad);
      }
    }
    if (g || e.target.closest("[data-il-kisa]")) metinGuncelle((g || e.target).dataset.ilGrup || e.target.dataset.ilKisa);
    const s = e.target.closest("[data-il-sehir]");
    if (s) { localStorage.setItem("mow-ilan-sehir", s.checked ? "1" : "0"); window.renderIlanlar(); }
  });
  $("ilanList")?.addEventListener("click", async e => {
    const t = e.target;
    const ac = t.closest("[data-il-ac]");
    if (ac && !t.closest("a,button,select,input")) {
      const id = +ac.dataset.ilAc; acikIlan = acikIlan === id ? null : id; window.renderIlanlar(); return;
    }
    const d = el => t.closest(el);
    let el;
    if ((el = d("[data-il-wa]"))) {
      const id = el.dataset.ilWa;
      const metin = document.querySelector(`[data-il-metin="${id}"]`).value;
      window.open("https://wa.me/?text=" + encodeURIComponent(metin), "_blank", "noopener");
      return;
    }
    if ((el = d("[data-il-kopya]"))) {
      const ok = await kopyala(document.querySelector(`[data-il-metin="${el.dataset.ilKopya}"]`).value);
      return toast(ok ? "📋 Metin kopyalandı — gruba yapıştırın" : "Kopyalanamadı", ok ? "" : "hata");
    }
    if ((el = d("[data-il-linkkopya]"))) {
      const i = bul(el.dataset.ilLinkkopya);
      const grup = document.querySelector(`[data-il-grup="${i.id}"]`)?.value || "";
      const ok = await kopyala(paylasimLinki(i, grup === "__yeni" ? "" : grup));
      return toast(ok ? "🔗 Link kopyalandı" : "Kopyalanamadı", ok ? "" : "hata");
    }
    if ((el = d("[data-il-gorsel]"))) {
      el.disabled = true; toast("🖼 Görsel hazırlanıyor…");
      await gorselIndir(bul(el.dataset.ilGorsel), el.dataset.tur); el.disabled = false; return;
    }
    if ((el = d("[data-il-yenile]"))) {
      el.disabled = true;
      const ok = await gorselYukle(bul(el.dataset.ilYenile));
      toast(ok ? "🔄 Kart görseli yenilendi" : "Görsel yüklenemedi", ok ? "" : "hata"); el.disabled = false;
      if (ok) load(); return;
    }
    if ((el = d("[data-il-bolum]"))) { acikBolum[el.dataset.ilBolum] = el.dataset.b; window.renderIlanlar(); return; }
    if ((el = d("[data-il-yaz]"))) {
      const y = yazildi(), id = el.dataset.ilYaz; y[id] = [...new Set([...(y[id] || []), +el.dataset.uid])];
      localStorage.setItem("mow-ilan-yazildi", JSON.stringify(y));
      setTimeout(() => window.renderIlanlar(), 300); return;       /* bağlantı açıldıktan sonra işaretle */
    }
    if ((el = d("[data-il-bd]"))) {
      const r = await api("/api/admin/ilan-basvuru-durum", { id: +el.dataset.ilBd, status: el.dataset.st });
      if (!r.ok) return toast(r.err || "Güncellenemedi", "hata");
      toast(el.dataset.st === "secildi" ? "✓ Aday seçildi" : el.dataset.st === "elendi" ? "Aday elendi" : "Değerlendirmeye alındı");
      return load();
    }
    if ((el = d("[data-il-duzenle]"))) { formAc(bul(el.dataset.ilDuzenle)); return; }
    if ((el = d("[data-il-durum]"))) {
      const st = el.dataset.st, i = bul(el.dataset.ilDurum);
      const soru = st === "silindi" ? "İlan silinecek; paylaşılan bağlantı artık açılmaz. Başvurular kayıtlarda kalır."
        : st === "kapali" ? "İlan başvurulara kapatılacak. Bağlantı açılır ama 'Başvurular kapandı' yazar." : "İlan yeniden başvuruya açılacak.";
      if (!(await onayIste(soru, st === "silindi" ? "🗑 Sil" : st === "kapali" ? "⏸ Kapat" : "▶ Aç", i.title, "", st === "silindi"))) return;
      const r = await api("/api/admin/ilan-durum", { id: i.id, status: st });
      if (!r.ok) return toast(r.err || "Hata", "hata");
      toast(st === "silindi" ? "🗑 İlan silindi" : st === "kapali" ? "⏸ Başvurular kapatıldı" : "▶ İlan yeniden açık");
      return load();
    }
    if ((el = d("[data-il-teklif]"))) {
      const i = bul(el.dataset.ilTeklif);
      const secilen = (i.basvurular || []).filter(b => b.status === "secildi");
      if (!secilen.length) return toast("Önce adayları ✓ Seç ile işaretleyin", "hata");
      if (!(await onayIste(`${secilen.length} seçilen adaya "${i.title}" için iş teklifi gönderilecek. Teklif üyelerin paneline düşer, kabul/red yanıtları İşler sekmesinde görünür.`,
        "💼 Teklif Gönder", "İş Teklifi"))) return;
      const r = await api("/api/admin/job", {
        title: i.title, date: i.date, location: [i.location, i.city].filter(Boolean).join(", "), fee: i.fee,
        note: "İlan başvurusu üzerinden seçildiniz.", user_ids: secilen.map(b => b.user_id),
      });
      if (!r.ok) return toast(r.err || "Teklif gönderilemedi", "hata");
      toast("💼 " + secilen.length + " adaya iş teklifi gönderildi"); return load();
    }
    if ((el = d("[data-il-csv]"))) {
      const i = bul(el.dataset.ilCsv);
      const satir = [["ad soyad", "telefon", "e-posta", "yaş", "boy", "şehir", "grup", "durum", "not", "tarih"]].concat(
        (i.basvurular || []).map(b => [b.fullname, b.phone, b.email, b.age, b.height, b.city, grupAdi(b.source), b.status, b.note, (b.created || "").slice(0, 16)]));
      const csv = "﻿" + satir.map(s => s.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `basvurular-${i.kod}.csv`; a.click(); return;
    }
  });

  /* Görsel üretimi ve metin şablonu dışarıdan da çağrılabilsin (test / ileride toplu üretim) */
  window.MOW_ILAN_ADMIN = { gorselCiz, paylasimMetni, paylasimLinki, uygunUyeler, SABLON };

  /* Panel verisi bu dosyadan önce geldiyse hemen çiz */
  if (window.DATA || (typeof DATA !== "undefined" && DATA)) { try { window.renderIlanlar(); } catch {} }
})();
