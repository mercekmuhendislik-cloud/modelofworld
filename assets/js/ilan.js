/* =========================================================
   İş ilanı sayfası — başvuru formu (/api/i/<kod>)
   ---------------------------------------------------------
   · Giriş yapmış üye: tek tıkla başvurur.
   · Üye olmayan: 1 dakikalık kısa kayıt (hesap + 1-3 fotoğraf) → aynı anda
     üye kaydı açılır ve başvuru ilana bağlanır.
   · Zaten üye olan ama giriş yapmamış kişi: e-posta + şifre ile girip başvurur.
   Hangi WhatsApp grubundan gelindiği (?k=) başvuruyla birlikte kaydedilir.
   ========================================================= */
(function () {
  const I = window.MOW_ILAN;
  if (!I) return;
  const V = window.VERA || {};
  const $ = id => document.getElementById(id);
  const kok = $("ilanForm");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const telOk = t => (V.telefonGecerli ? V.telefonGecerli(t) : /^0[1-9]\d{9}$/.test(String(t).replace(/\D/g, "")));
  const KAT_KAYIT = { figuran: "oyuncu" };           // kayıt formunda karşılığı olmayan ilan türleri
  const kayitKat = KAT_KAYIT[I.category] || I.category || "model";
  const cocukIlani = I.minor === "1" || I.category === "cocuk";
  const MAKS_FOTO = 3;

  /* ---------- Paylaş düğmesi (ziyaretçi ilanı arkadaşına iletsin) ---------- */
  const paylasLink = I.link + "?k=" + encodeURIComponent(I.kaynak ? I.kaynak + "-ileti" : "ileti");
  $("ilanPaylas")?.addEventListener("click", async () => {
    const metin = `${I.title} — Model of World iş ilanı. Başvuru ücretsiz: ${paylasLink}`;
    if (navigator.share) { try { await navigator.share({ title: I.title, text: metin, url: paylasLink }); return; } catch { return; } }
    window.open("https://wa.me/?text=" + encodeURIComponent(metin), "_blank", "noopener");
  });

  if (!I.acik) {
    kok.innerHTML = `<p>${esc(I.kapali_neden)}</p>
      <p class="mt-2"><a class="btn btn-gold" href="ilanlar">Açık ilanları gör</a>
      <a class="btn btn-ghost" href="basvuru">Kadromuza katılın</a></p>
      <p class="alt-not">Kadromuzdaki üyelere yeni işler önce iletilir.</p>`;
    return;
  }

  function mesaj(el, tur, metin) { el.className = "ilan-mesaj" + (metin ? " " + tur : ""); el.innerHTML = metin || ""; }
  async function postJ(url, govde) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(govde || {}) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    return { ok: !!(r && r.ok), status: r ? r.status : 0, d };
  }
  async function basvur(not) {
    return postJ("/api/ilan-basvuru", { kod: I.kod, kaynak: I.kaynak || "", note: not || "" });
  }
  function basari(ek) {
    kok.innerHTML = `<div class="ilan-basari">
      <div class="tik">✓</div>
      <h3 style="margin:10px 0 8px">Başvurunuz alındı</h3>
      <p class="muted" style="max-width:52ch;margin-inline:auto">Casting ekibimiz başvurunuzu inceleyip uygun görülürse sizinle
        telefonla iletişime geçecek. ${ek || ""}</p>
      <p class="mt-3"><a class="btn btn-gold" href="panel">Panelime Git</a>
        <a class="btn btn-ghost" href="ilanlar">Diğer ilanlar</a></p>
    </div>`;
    kok.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- 1) Giriş yapmış üye ---------- */
  function uyeFormu(u) {
    if (u.basvurdu) {
      kok.innerHTML = `<div class="ilan-basari"><div class="tik">✓</div>
        <h3 style="margin:10px 0 8px">Bu ilana başvurdunuz</h3>
        <p class="muted">${u.durum === "secildi" ? "Tebrikler, bu iş için seçildiniz. Ekibimiz sizi arayacak."
          : u.durum === "elendi" ? "Bu iş için başka bir profille ilerlendi. Yeni ilanlarda görüşmek üzere."
          : "Başvurunuz değerlendiriliyor."}</p>
        <p class="mt-3"><a class="btn btn-ghost" href="ilanlar">Diğer ilanlar</a></p></div>`;
      return;
    }
    const veliEksik = (cocukIlani || u.resit_degil) && !u.veli_var;
    kok.innerHTML = `<div class="ilan-form">
      <p>Merhaba <strong>${esc(u.ad)}</strong>, profiliniz ve fotoğraflarınız başvurunuza otomatik eklenecek.</p>
      <div class="field full mt-2"><label>Eklemek istediğiniz not (isteğe bağlı)</label>
        <textarea id="uNot" rows="2" placeholder="Müsaitlik, deneyim, sorularınız…"></textarea></div>
      <div id="uMsg" class="ilan-mesaj"></div>
      ${veliEksik
        ? `<div class="ilan-mesaj hata" style="display:block">Bu ilan için veli bilgisi gerekiyor. Panelinizdeki <strong>Veli İzni</strong> bölümünü doldurup bu sayfaya geri dönün.</div>
           <a class="btn btn-gold" href="panel">Panelime Git</a>`
        : `<button class="btn btn-gold" id="uBtn" type="button">Tek Tıkla Başvur</button>`}
      <p class="alt-not">Siz değilseniz <a class="gold" href="#" id="cikis">çıkış yapın</a>.</p>
    </div>`;
    $("cikis").addEventListener("click", async e => { e.preventDefault(); await postJ("/api/logout"); location.reload(); });
    $("uBtn")?.addEventListener("click", async () => {
      const b = $("uBtn"); b.disabled = true; b.textContent = "Gönderiliyor…";
      const r = await basvur($("uNot").value.trim());
      if (r.ok) return basari();
      b.disabled = false; b.textContent = "Tek Tıkla Başvur";
      mesaj($("uMsg"), "hata", esc(r.d.error || "Başvuru gönderilemedi, tekrar deneyin."));
    });
  }

  /* ---------- 2) Üye olmayan: kısa kayıt + başvuru ---------- */
  function secenekler(bas, son, secili) {
    let s = "";
    for (let i = bas; i <= son; i++) s += `<option value="${i}"${i === secili ? " selected" : ""}>${i}</option>`;
    return s;
  }
  function yeniFormu() {
    const iller = V.ILLER || [], populer = V.ILLER_POPULER || [];
    const ilSec = `<option value="">Seçiniz…</option>` +
      (populer.length ? `<optgroup label="Büyük Şehirler">${populer.map(i => `<option${i === I.city ? " selected" : ""}>${esc(i)}</option>`).join("")}</optgroup>` : "") +
      `<optgroup label="Tüm İller">${iller.map(i => `<option>${esc(i)}</option>`).join("")}</optgroup>`;
    const varsayilanYas = I.age_min || (cocukIlani ? 10 : 20);
    return `<form class="ilan-form" id="yForm" novalidate>
      <div class="form-grid">
        <div class="field"><label>Ad Soyad <span class="req">*</span></label><input name="fullname" placeholder="Adınız Soyadınız"></div>
        <div class="field"><label>Telefon <span class="req">*</span></label><input name="phone" type="tel" inputmode="numeric" maxlength="14" placeholder="0532 555 55 55"></div>
        <div class="field"><label>E-posta <span class="req">*</span></label><input name="email" type="email" autocomplete="email" placeholder="ornek@mail.com"></div>
        <div class="field"><label>Şifre belirleyin <span class="req">*</span></label><input name="password" type="password" autocomplete="new-password" placeholder="En az 6 karakter"></div>
        <div class="field"><label>Cinsiyet <span class="req">*</span></label>
          <select name="gender"><option value="">Seçiniz…</option>
            <option value="kadin"${I.gender === "kadin" ? " selected" : ""}>Kadın</option>
            <option value="erkek"${I.gender === "erkek" ? " selected" : ""}>Erkek</option></select></div>
        <div class="field"><label>Yaş <span class="req">*</span></label><select name="age">${secenekler(1, 50, Math.min(50, varsayilanYas))}</select></div>
        <div class="field"><label>Şehir <span class="req">*</span></label><select name="city">${ilSec}</select></div>
        <div class="field"><label>Boy (cm)</label><input name="height" type="number" min="50" max="230" placeholder="örn. 172"></div>
        <div class="field full" id="yVeli" hidden>
          <div class="form-grid" style="gap:14px">
            <div class="field"><label>Veli Ad Soyad <span class="req">*</span></label><input name="parent_name" placeholder="Anne / baba / vasi"></div>
            <div class="field"><label>Veli Telefon <span class="req">*</span></label><input name="parent_phone" type="tel" inputmode="numeric" maxlength="14" placeholder="0532 555 55 55"></div>
          </div>
        </div>
        <div class="field full"><label>Fotoğraflarınız <span class="req">*</span> <span class="muted" style="text-transform:none;letter-spacing:0">1 yakın portre + 1 boy fotoğrafı önerilir (en fazla ${MAKS_FOTO})</span></label>
          <div class="ilan-fotolar" id="yFotolar"></div>
          <input type="file" id="yFotoInput" accept="image/*" multiple hidden></div>
        <div class="field full"><label>Not (isteğe bağlı)</label><textarea name="note" rows="2" placeholder="Deneyim, müsaitlik, Instagram…"></textarea></div>
        <div class="field full"><div class="checkbox-row"><input type="checkbox" id="yKvkk">
          <label for="yKvkk" style="margin:0;text-transform:none;letter-spacing:.02em;font-size:.84rem">Kişisel verilerimin başvuru değerlendirme amacıyla
          <a class="gold" href="kvkk" target="_blank">KVKK Aydınlatma Metni</a> kapsamında işlenmesini ve
          <a class="gold" href="sozlesme" target="_blank">çalışma şartlarını</a> kabul ediyorum. Bu başvuruyla Model of World'de ücretsiz üyeliğim açılır.</label></div></div>
      </div>
      <div id="yMsg" class="ilan-mesaj"></div>
      <button class="btn btn-gold" type="submit" id="yBtn" style="min-width:220px">Başvurumu Gönder</button>
      <p class="alt-not">Başvuru ücretsizdir. Telefonunuz ve e-postanız hiçbir yerde yayınlanmaz.</p>
    </form>`;
  }
  function uyeGirisFormu() {
    return `<form class="ilan-form" id="gForm" novalidate>
      <div class="form-grid">
        <div class="field"><label>E-posta</label><input name="email" type="email" autocomplete="email"></div>
        <div class="field"><label>Şifre</label><input name="password" type="password" autocomplete="current-password"></div>
        <div class="field full"><label>Not (isteğe bağlı)</label><textarea name="note" rows="2"></textarea></div>
      </div>
      <div id="gMsg" class="ilan-mesaj"></div>
      <button class="btn btn-gold" type="submit" id="gBtn">Giriş Yap ve Başvur</button>
      <p class="alt-not">Şifrenizi mi unuttunuz? <a class="gold" href="${esc(V.AGENCY?.waLink?.("Merhaba, şifremi unuttum. " + I.title + " ilanına başvurmak istiyorum.") || "iletisim")}" target="_blank" rel="noopener">WhatsApp'tan yazın</a>.</p>
    </form>`;
  }
  function misafir() {
    kok.innerHTML = `<div class="ilan-sekme">
        <button type="button" class="on" data-sekme="yeni">İlk kez başvuruyorum</button>
        <button type="button" data-sekme="uye">Zaten üyeyim</button>
      </div><div id="sekmeIc"></div>`;
    const ic = $("sekmeIc");
    const goster = s => {
      kok.querySelectorAll("[data-sekme]").forEach(b => b.classList.toggle("on", b.dataset.sekme === s));
      ic.innerHTML = s === "yeni" ? yeniFormu() : uyeGirisFormu();
      s === "yeni" ? yeniBagla() : girisBagla();
    };
    kok.querySelectorAll("[data-sekme]").forEach(b => b.addEventListener("click", () => goster(b.dataset.sekme)));
    goster("yeni");
  }

  function girisBagla() {
    const f = $("gForm"), v = n => (f.querySelector(`[name="${n}"]`).value || "").trim();
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const b = $("gBtn"); b.disabled = true; b.textContent = "Giriş yapılıyor…";
      const g = await postJ("/api/login", { email: v("email").toLowerCase(), password: f.querySelector('[name="password"]').value });
      if (!g.ok) { b.disabled = false; b.textContent = "Giriş Yap ve Başvur"; return mesaj($("gMsg"), "hata", esc(g.d.error || "Giriş yapılamadı")); }
      b.textContent = "Başvuru gönderiliyor…";
      const r = await basvur(v("note"));
      if (r.ok) return basari(g.d.sifre_belirle ? "Panelinize ilk girişinizde yeni şifrenizi belirlemeniz istenecek." : "");
      b.disabled = false; b.textContent = "Giriş Yap ve Başvur";
      mesaj($("gMsg"), "hata", esc(r.d.error || "Başvuru gönderilemedi"));
    });
  }

  function yeniBagla() {
    const f = $("yForm");
    const alan = n => f.querySelector(`[name="${n}"]`);
    const v = n => (alan(n)?.value || "").trim();
    const FOTO = [];
    const resitDegil = () => cocukIlani || (+v("age") > 0 && +v("age") < 18);
    const veliGoster = () => { $("yVeli").hidden = !resitDegil(); };
    alan("age").addEventListener("change", veliGoster); veliGoster();

    function fotoCiz() {
      $("yFotolar").innerHTML = FOTO.map((x, i) => `<div class="kutu"><img src="${x.url}" alt=""><button type="button" class="sil" data-sil="${i}">✕</button></div>`).join("") +
        (FOTO.length < MAKS_FOTO ? `<button type="button" class="ekle" id="yEkle"><span style="font-size:1.4rem">＋</span>Fotoğraf</button>` : "");
    }
    $("yFotolar").addEventListener("click", e => {
      if (e.target.closest("#yEkle")) return $("yFotoInput").click();
      const s = e.target.closest("[data-sil]");
      if (s) { const [x] = FOTO.splice(+s.dataset.sil, 1); URL.revokeObjectURL(x.url); fotoCiz(); }
    });
    $("yFotoInput").addEventListener("change", async e => {
      const dosyalar = [...e.target.files].slice(0, MAKS_FOTO - FOTO.length); e.target.value = "";
      for (const d of dosyalar) {
        if (d.size > 12 * 1024 * 1024) { mesaj($("yMsg"), "hata", "Fotoğraf 12 MB'tan büyük olamaz."); continue; }
        mesaj($("yMsg"), "bilgi", "Fotoğraf hazırlanıyor…");
        const out = V.fotoHazirla ? await V.fotoHazirla(d) : { blob: d, ad: d.name };
        FOTO.push({ ...out, url: URL.createObjectURL(out.blob) });
        fotoCiz();
      }
      mesaj($("yMsg"), "", "");
    });
    fotoCiz();
    f.addEventListener("input", e => e.target.closest(".field")?.classList.remove("invalid"));

    function dogrula() {
      let ilk = null;
      const isaret = (n, kotu) => { const fl = alan(n)?.closest(".field"); fl?.classList.toggle("invalid", !!kotu); if (kotu && !ilk) ilk = fl; };
      isaret("fullname", v("fullname").split(/\s+/).filter(Boolean).length < 2);
      isaret("phone", !telOk(v("phone")));
      isaret("email", !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email")));
      isaret("password", alan("password").value.length < 6);
      isaret("gender", !v("gender"));
      isaret("city", !v("city"));
      if (resitDegil()) { isaret("parent_name", v("parent_name").split(/\s+/).filter(Boolean).length < 2); isaret("parent_phone", !telOk(v("parent_phone"))); }
      if (!ilk && !FOTO.length) { mesaj($("yMsg"), "hata", "En az 1 fotoğraf eklemelisiniz."); return false; }
      if (!ilk && !$("yKvkk").checked) { mesaj($("yMsg"), "hata", "Devam etmek için KVKK onay kutusunu işaretleyin."); return false; }
      if (ilk) { mesaj($("yMsg"), "hata", "Kırmızıyla işaretlenen alanları kontrol edin."); ilk.scrollIntoView({ behavior: "smooth", block: "center" }); return false; }
      return true;
    }

    f.addEventListener("submit", async e => {
      e.preventDefault();
      if (!dogrula()) return;
      const b = $("yBtn"); b.disabled = true; b.textContent = "Hesabınız açılıyor…";
      const bitir = m => { b.disabled = false; b.textContent = "Başvurumu Gönder"; mesaj($("yMsg"), "hata", m); };
      const govde = {
        fullname: v("fullname"), phone: v("phone"), email: v("email").toLowerCase(), password: alan("password").value,
        category: cocukIlani ? "cocuk" : kayitKat, gender: v("gender"), age: v("age"), city: v("city"),
        languages: "Türkçe", about: v("note"), consent_kvkk: "1", consent_contract: "1",
      };
      if (resitDegil()) { govde.parent_name = v("parent_name"); govde.parent_phone = v("parent_phone"); }
      const k = await postJ("/api/register", govde);
      if (!k.ok) {
        if (k.status === 409) {
          alan("email").closest(".field").classList.add("invalid");
          return bitir('Bu e-posta ile zaten üyeliğiniz var. Yukarıdaki <strong>Zaten üyeyim</strong> sekmesinden giriş yapıp başvurun.');
        }
        return bitir(esc(k.d.error || (k.status ? "Kayıt açılamadı (hata " + k.status + ")" : "İnternet bağlantınızı kontrol edin")));
      }
      /* Boy bilgisi kayıt formunda yok — profil uç noktasıyla eklenir */
      if (+v("height")) await postJ("/api/profile", { height: v("height") }).catch(() => {});
      let yuklenen = 0;
      for (let i = 0; i < FOTO.length; i++) {
        b.textContent = `Fotoğraf yükleniyor ${i + 1}/${FOTO.length}…`;
        const fd = new FormData();
        fd.append("kind", "photo"); fd.append("album", "genel");
        fd.append("file", FOTO[i].blob, FOTO[i].ad || "foto.jpg");
        if (FOTO[i].kucuk) fd.append("thumb", FOTO[i].kucuk, "k.webp");
        const r = await fetch("/api/upload", { method: "POST", body: fd }).catch(() => null);
        if (r && r.ok) yuklenen++;
      }
      b.textContent = "Başvuru gönderiliyor…";
      const r = await basvur(v("note"));
      if (!r.ok) return bitir("Üyeliğiniz açıldı ama başvuru gönderilemedi: " + esc(r.d.error || "") + " Sayfayı yenileyip tekrar başvurun.");
      basari(yuklenen < FOTO.length ? "Bazı fotoğraflarınız yüklenemedi, panelinizden tekrar ekleyebilirsiniz." :
        "Üyeliğiniz de açıldı; ölçülerinizi panelinizden tamamlarsanız öne çıkarsınız.");
    });
  }

  /* ---------- Başlangıç: oturum var mı? ---------- */
  postJ("/api/ilan-durumum", { kod: I.kod }).then(r => (r.ok && r.d.uye) ? uyeFormu(r.d) : misafir());
})();
