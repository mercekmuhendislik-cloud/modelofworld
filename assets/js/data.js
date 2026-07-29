/* =========================================================
   MODEL OF WORLD — Örnek Veri Katmanı
   Gerçek ortamda bu veriler bir API / CMS'ten gelecektir.

   GİZLİLİK KURALI (madde 34): Sitede yeteneklerin yalnızca
   adı + soyad baş harfi yayınlanır. Telefon, soyadı, kişisel
   sosyal medya hesapları ASLA bu dosyaya eklenmemelidir.
   ========================================================= */

/* Fotoğraflar: Unsplash (ücretsiz lisans) profesyonel görselleri.
   Yayın öncesi kendi çekimlerinizle değiştirmek için sadece bu URL'leri güncelleyin. */
const IMG = id => `https://images.unsplash.com/photo-${id}`;
const pic = (url, w, extra = "") => `${url}?q=80&auto=format&fit=crop&w=${w}${extra}`;

const AGENCY = {
  name: "Model of World",
  phone: "+90 (212) 000 00 00",
  whatsapp: "+90 (532) 000 00 00",
  email: "info@modelofworld.com",
  address: "Nişantaşı, İstanbul",
  instagram: "https://instagram.com/",
  /* Resmi ticari bilgiler — yayın öncesi gerçek değerlerle doldurulacak */
  legal: {
    title: "Model of World Ajans Organizasyon ve Prodüksiyon Ltd. Şti.",
    taxOffice: "Şişli V.D.",
    taxNo: "000 000 0000",
    mersis: "0000-0000-0000-0000",
    iskur: "İŞKUR Özel İstihdam Bürosu İzin Belgesi No: 000",
  },
  domain: "https://www.modelofworld.com",
};

/* Kategori tanımları */
const CATEGORIES = {
  model:  { label: "Manken / Model",        short: "Model",       icon: "◆" },
  hostes: { label: "Fuar / Kongre Hostesi", short: "Hostes",      icon: "◈" },
  yuz:    { label: "Yüz Modeli",            short: "Yüz Modeli",  icon: "◇" },
  cocuk:  { label: "Çocuk Model",           short: "Çocuk Model", icon: "✦" },
};

/* ---------------------------------------------------------
   Yetenekler
   available : müsaitlik (iç yönetim — takvim entegrasyonuna hazır)
   license   : ehliyet
   langLevels: dil → seviye (CEFR)
   photos    : { studio: [], podium: [], polaroid: [] }  · video / video360: url
   --------------------------------------------------------- */
const TALENTS = [
  {
    id: "elif-a", name: "Elif A.", category: "model", gender: "kadin",
    age: 24, height: 178, weight: 58, bust: 86, waist: 61, hip: 89, shoe: 39, size: "36",
    hair: "kahverengi", eye: "ela", city: "istanbul", license: true, available: true,
    languages: ["Türkçe", "İngilizce"], langLevels: { "İngilizce": "C1" },
    experience: "5 yıl", featured: true,
    tags: ["podyum", "editoryal", "katalog çekimi"],
    gradient: ["#2b1d34", "#7a5c8f"],
    photo: IMG("1534528741775-53994a69daeb"),
    photos: {}, video: "", bio: "Uluslararası markalarla podyum ve editoryal çekim deneyimi. İstanbul Moda Haftası'nda düzenli olarak yer almaktadır."
  },
  {
    id: "kaan-y", name: "Kaan Y.", category: "model", gender: "erkek",
    age: 27, height: 188, weight: 82, bust: 100, waist: 78, hip: 96, shoe: 44, size: "50",
    hair: "siyah", eye: "kahverengi", city: "istanbul", license: true, available: true,
    languages: ["Türkçe", "İngilizce", "Almanca"], langLevels: { "İngilizce": "C2", "Almanca": "B1" },
    experience: "6 yıl", featured: true,
    tags: ["podyum", "reklam", "fitness"],
    gradient: ["#101820", "#37596b"],
    photo: IMG("1507003211169-0a1dd7228f2d"),
    photos: {}, video: "", bio: "Reklam filmleri ve erkek giyim katalog çekimlerinde uzman. Fitness ve spor markaları ile aktif çalışmaktadır."
  },
  {
    id: "selin-k", name: "Selin K.", category: "hostes", gender: "kadin",
    age: 25, height: 172, weight: 55, bust: 88, waist: 63, hip: 92, shoe: 38, size: "36",
    hair: "sari", eye: "mavi", city: "istanbul", license: false, available: true,
    languages: ["Türkçe", "İngilizce", "Rusça"], langLevels: { "İngilizce": "C1", "Rusça": "B2" },
    experience: "4 yıl", featured: true,
    tags: ["fuar", "kongre", "lansman", "tercüman hostes"],
    gradient: ["#332417", "#9c7a4a"],
    photo: IMG("1494790108377-be9c29b29330"),
    photos: {}, video: "", bio: "CNR ve TÜYAP fuarlarında uluslararası stant deneyimi. Rusça ve İngilizce akıcı; teknik ürün sunumu yapabilmektedir."
  },
  {
    id: "zeynep-t", name: "Zeynep T.", category: "model", gender: "kadin",
    age: 22, height: 180, weight: 60, bust: 84, waist: 60, hip: 88, shoe: 40, size: "36",
    hair: "siyah", eye: "kahverengi", city: "izmir", license: false, available: true,
    languages: ["Türkçe", "İngilizce"], langLevels: { "İngilizce": "B2" },
    experience: "3 yıl", featured: true,
    tags: ["podyum", "beauty", "editoryal"],
    gradient: ["#2e1520", "#8c4a63"],
    photo: IMG("1517841905240-472988babdf9"),
    photos: {}, video: "", bio: "Beauty ve kozmetik markaları için yüz mankeni olarak çalışmaktadır. Editoryal moda çekimlerinde deneyimlidir."
  },
  {
    id: "arda-c", name: "Arda C.", category: "hostes", gender: "erkek",
    age: 26, height: 182, weight: 78, bust: 98, waist: 79, hip: 95, shoe: 43, size: "48",
    hair: "kahverengi", eye: "yesil", city: "ankara", license: true, available: true,
    languages: ["Türkçe", "İngilizce"], langLevels: { "İngilizce": "C1" },
    experience: "3 yıl", featured: false,
    tags: ["fuar", "kongre", "host", "ağır sanayi fuarı"],
    gradient: ["#14231a", "#4a7a5c"],
    photo: IMG("1500648767791-00dcc994a43e"),
    photos: {}, video: "", bio: "Kongre ve teknoloji fuarlarında host olarak görev almaktadır. Sahne önü anons ve yönlendirme deneyimi vardır."
  },
  {
    id: "melis-o", name: "Melis Ö.", category: "hostes", gender: "kadin",
    age: 23, height: 170, weight: 53, bust: 84, waist: 60, hip: 89, shoe: 37, size: "34",
    hair: "kizil", eye: "ela", city: "izmir", license: false, available: true,
    languages: ["Türkçe", "İngilizce", "İtalyanca"], langLevels: { "İngilizce": "B2", "İtalyanca": "B1" },
    experience: "2 yıl", featured: false,
    tags: ["fuar", "lansman", "tanıtım"],
    gradient: ["#33200f", "#a3663a"],
    photo: IMG("1529626455594-4ff0802cfb7e"),
    photos: {}, video: "", bio: "Ürün lansmanları ve butik etkinliklerde hostes olarak çalışmaktadır. İtalyanca konuşabilmektedir."
  },
  {
    id: "efe-s", name: "Efe S.", category: "model", gender: "erkek",
    age: 29, height: 190, weight: 88, bust: 102, waist: 80, hip: 98, shoe: 45, size: "52",
    hair: "sari", eye: "mavi", city: "istanbul", license: true, available: false,
    languages: ["Türkçe", "İngilizce"], langLevels: { "İngilizce": "B2" },
    experience: "7 yıl", featured: false,
    tags: ["reklam", "katalog çekimi", "karakter"],
    gradient: ["#26261a", "#6b6b3f"],
    photo: IMG("1552374196-c4e7ffc6e126"),
    photos: {}, video: "", bio: "Karakter oyunculuğu ve reklam çekimlerinde deneyimli. Ulusal TV reklamlarında yer almıştır."
  },
  {
    id: "cansu-e", name: "Cansu E.", category: "model", gender: "kadin",
    age: 25, height: 176, weight: 57, bust: 88, waist: 62, hip: 91, shoe: 38, size: "38",
    hair: "kahverengi", eye: "kahverengi", city: "ankara", license: true, available: true,
    languages: ["Türkçe", "İngilizce"], langLevels: { "İngilizce": "B1" },
    experience: "4 yıl", featured: false,
    tags: ["katalog çekimi", "e-ticaret", "beauty"],
    gradient: ["#2b1a2e", "#6b3f78"],
    photo: IMG("1544005313-94ddf0286df2"),
    photos: {}, video: "", bio: "E-ticaret ve katalog çekimlerinde yüksek tempolu çalışma deneyimine sahiptir."
  },
  {
    id: "baris-k", name: "Barış K.", category: "hostes", gender: "erkek",
    age: 28, height: 185, weight: 81, bust: 101, waist: 80, hip: 97, shoe: 44, size: "50",
    hair: "siyah", eye: "siyah", city: "istanbul", license: true, available: true,
    languages: ["Türkçe", "İngilizce", "İspanyolca"], langLevels: { "İngilizce": "C1", "İspanyolca": "B2" },
    experience: "5 yıl", featured: false,
    tags: ["fuar", "kongre", "protokol"],
    gradient: ["#1c1c26", "#3f5c7a"],
    photo: IMG("1539571696357-5a69c17a67c6"),
    photos: {}, video: "", bio: "Uluslararası kongrelerde protokol karşılama ve simultane yönlendirme görevlerinde deneyimlidir."
  },
  {
    id: "lina-r", name: "Lina R.", category: "yuz", gender: "kadin",
    age: 21, height: 168, weight: 52, bust: 82, waist: 59, hip: 87, shoe: 37, size: "34",
    hair: "kahverengi", eye: "yesil", city: "istanbul", license: false, available: true,
    languages: ["Türkçe", "İngilizce"], langLevels: { "İngilizce": "B2" },
    experience: "2 yıl", featured: false,
    tags: ["beauty", "kozmetik", "yüz modeli", "saç modeli"],
    gradient: ["#301a26", "#96556e"],
    photo: IMG("1508214751196-bcfd4ca60f91"),
    photos: {}, video: "", bio: "Kozmetik, cilt bakımı ve saç markaları için yüz modeli olarak çalışmaktadır. Yakın plan çekim deneyimi yüksektir."
  },
  {
    id: "ada-y", name: "Ada Y.", category: "cocuk", gender: "kadin",
    age: 9, height: 134, weight: 29, shoe: 33, size: "8-9 Yaş",
    hair: "kahverengi", eye: "kahverengi", city: "istanbul", license: false, available: true,
    languages: ["Türkçe"], langLevels: {},
    experience: "1 yıl", featured: false,
    tags: ["çocuk giyim", "katalog çekimi", "reklam"],
    gradient: ["#1d2b2e", "#5c8a7a"],
    photo: IMG("1503454537195-1dcabb73ffb9"),
    photos: {}, video: "", bio: "Çocuk giyim katalogları ve reklam çekimlerinde veli refakatinde görev almaktadır. Tüm çalışmaları çocuk mevzuatına uygun yürütülür."
  },
];

/* Filtre seçeneklerinde gösterilecek etiketler */
const LABELS = {
  gender: { kadin: "Kadın", erkek: "Erkek" },
  hair:   { siyah: "Siyah", kahverengi: "Kahverengi", sari: "Sarı", kizil: "Kızıl" },
  eye:    { kahverengi: "Kahverengi", mavi: "Mavi", yesil: "Yeşil", ela: "Ela", siyah: "Siyah" },
  city:   { istanbul: "İstanbul", ankara: "Ankara", izmir: "İzmir" },
};

/* ---------------------------------------------------------
   Hizmetler — hizmetler.html, ana sayfa ve teklif formu
   --------------------------------------------------------- */
const SERVICES = [
  {
    id: "manken-model", img: IMG("1524504388940-b1c1722653e1"),
    title: "Manken & Model Temini",
    short: "Podyum, katalog, editoryal ve reklam projeleri için profesyonel model kadrosu.",
    details: [
      "Podyum / defile organizasyonu için manken kadrosu",
      "E-ticaret ve katalog çekimleri için günlük model temini",
      "Reklam filmi ve editoryal çekim castingleri",
      "Fit model, showroom ve yüz modeli temini",
    ],
    gradient: ["#2b1d34", "#7a5c8f"], catalogCat: "model",
  },
  {
    id: "fuar-hostes", img: IMG("1540575467063-178a50c2df87"),
    title: "Fuar & Kongre Hostesliği",
    short: "Ulusal ve uluslararası fuarlarda çok dilli, deneyimli hostes ekipleri.",
    details: [
      "Stant hostesi: karşılama, ürün tanıtımı, ikram yönetimi",
      "Servis hostesi: VIP lounge ve stant içi ikram servisi",
      "Tercüman hostes: EN/RU/DE/AR simultane destek",
      "Kongre & seminer host/hostes ekipleri, süpervizörlü yönetim",
    ],
    gradient: ["#332417", "#9c7a4a"], catalogCat: "hostes",
  },
  {
    id: "moda-podyum", img: IMG("1537832816519-689ad163238b"),
    title: "Moda & Podyum (Defile) Organizasyonu",
    short: "Koreografiden fitting'e, manken tedarikinden sahne yönetimine anahtar teslim defile.",
    details: [
      "Defile koreografisi ve prova yönetimi",
      "Fitting, backstage ve giyinme alanı organizasyonu",
      "Manken kadrosu tedariki ve saha süpervizörlüğü",
      "Sahne, ışık ve müzik akış koordinasyonu",
    ],
    gradient: ["#26102a", "#6e3a78"],
  },
  {
    id: "produksiyon", img: IMG("1554048612-b6a482bc67e5"),
    title: "Fotoğraf & Prodüksiyon",
    short: "Konsept geliştirmeden teslime; moda ve ürün çekimlerinde uçtan uca prodüksiyon.",
    details: [
      "Lookbook, kampanya ve e-ticaret çekimleri",
      "Video prodüksiyon, showreel ve drone çekimi",
      "Stüdyo, mekân, styling ve makyaj koordinasyonu",
      "Retouch, renk düzenleme ve teslim yönetimi",
    ],
    gradient: ["#26261a", "#8c8c4a"], link: "produksiyon.html",
  },
  {
    id: "dizi-film-cast", img: IMG("1478720568477-152d9b164e26"),
    title: "Dizi / Film / Reklam Castı",
    short: "Ana karakter, yan oyuncu ve figürasyon için hızlı ve isabetli cast çözümleri.",
    details: [
      "Reklam filmi ana karakter ve yan rol castingi",
      "Dizi/film figürasyon ekipleri (toplu tedarik)",
      "Casting stüdyosunda deneme çekimi organizasyonu",
      "Menajerlik ve set koordinasyonu",
    ],
    gradient: ["#101d2b", "#3a5a78"],
  },
  {
    id: "acilis-lansman", img: IMG("1511578314322-379afb476865"),
    title: "Açılış & Lansman Hizmetleri",
    short: "Protokol karşılama, kurdele kesim ve karşılama ekibiyle kusursuz açılış organizasyonu.",
    details: [
      "Protokol karşılama ve VIP misafir yönetimi",
      "Kurdele kesim töreni ve sahne akışı",
      "Karşılama ekibi, ikram ve yönlendirme personeli",
      "Basın ve davetli listesi koordinasyonu",
    ],
    gradient: ["#2e1520", "#8c4a63"],
  },
  {
    title: "Uluslararası Turizm Fuarı Standı", img: IMG("1587825140708-dfaf72ae4b04"),
    category: "Fuar Hostesi",
    scope: "8 çok dilli hostes · 4 gün · süpervizörlü ekip",
    date: "Mayıs 2026",
    gradient: ["#332417", "#9c7a4a"],
  },
  {
    title: "Lüks Saat Markası Lansmanı", img: IMG("1519671482749-fd09be7ccebf"),
    category: "Etkinlik & Prodüksiyon",
    scope: "Lansman organizasyonu · çekim · 12 kişilik ekip",
    date: "Nisan 2026",
    gradient: ["#2e1520", "#8c4a63"],
  },
];

/* Sayısal başarı sayaçları */
const COUNTERS = [
  { value: 1000, suffix: "+", label: "Başarılı Etkinlik" },
  { value: 500,  suffix: "+", label: "Manken & Hostes" },
  { value: 50,   suffix: "+", label: "Global Marka" },
  { value: 12,   suffix: "",  label: "Hizmet Verilen Şehir" },
];

/* Çalışılan markalar — gerçek logolar gelene kadar stilize placeholder isimler.
   Gerçek logo eklemek için: { name: "Marka", logo: "assets/media/logo-marka.svg" } */
const BRANDS = [
  { name: "MAISON NOIRE" },
  { name: "AURELIA" },
  { name: "PORTO YACHTS" },
  { name: "LUMIÈRE" },
  { name: "VESTA EXPO" },
  { name: "ATLAS GROUP" },
  { name: "RIVIERA CLUB" },
  { name: "ORION MEDIA" },
];

/* Müşteri / marka yorumları */
const TESTIMONIALS = [
  {
    quote: "Fuar boyunca standımızdaki hostes ekibi, markamızı bizden iyi anlattı. Süpervizörlü ekip yönetimi sayesinde tek bir aksaklık yaşamadık.",
    name: "B. Aydın", role: "Pazarlama Direktörü", company: "Vesta Expo",
  },
  {
    quote: "E-ticaret çekimlerimizde konsept, model ve retouch tek elden yönetildi; teslim süreleri sözleşmedekinden bile hızlıydı.",
    name: "C. Demir", role: "E-Ticaret Müdürü", company: "Atlas Group",
  },
  {
    quote: "Lansman gecemizde cast, sahne akışı ve çekim tek elden yönetildi. Teklif aşamasından teslime kadar şeffaf ve hızlıydılar.",
    name: "E. Kaya", role: "Marka Müdürü", company: "Lumière",
  },
];

/* Blog / haber yazıları (madde 92) — içerik pazarlaması placeholder'ları */
const BLOG_POSTS = [
  {
    slug: "2026-fuar-trendleri", img: IMG("1556740738-b6a63e27c4df"),
    title: "2026 Fuar Trendleri: Stantta Fark Yaratan 7 Detay",
    excerpt: "Bu yıl fuarlarda öne çıkmak isteyen markalar için hostes seçiminden interaktif stant deneyimine güncel trendler.",
    date: "15 Temmuz 2026", tag: "Fuar", gradient: ["#332417", "#9c7a4a"],
  },
  {
    slug: "basarili-lansman-organizasyonu", img: IMG("1511578314322-379afb476865"),
    title: "Başarılı Bir Lansman Organizasyonunun 6 Adımı",
    excerpt: "Davetli listesinden sahne akışına, karşılama ekibinden basın yönetimine — kusursuz bir marka lansmanının perde arkası.",
    date: "28 Haziran 2026", tag: "Etkinlik", gradient: ["#2e1520", "#8c4a63"],
  },
  {
    slug: "dogru-model-secimi", img: IMG("1581044777550-4cfa60707c03"),
    title: "Kampanyanız İçin Doğru Modeli Seçmenin 5 Kuralı",
    excerpt: "Marka kimliğiniz ile cast seçiminizin uyumu satışa doğrudan yansır. Doğru sedcard nasıl okunur?",
    date: "10 Haziran 2026", tag: "Cast", gradient: ["#2b1d34", "#7a5c8f"],
  },
];

/* ---- Placeholder görsel üretici (fotoğraf yüklenene kadar) ---- */
function talentPlaceholder(t, big = false) {
  const [c1, c2] = t.gradient || ["#222", "#555"];
  const initials = t.name.split(" ").map(w => w[0]).join("");
  return `
    <div class="ph" style="--ph1:${c1};--ph2:${c2}">
      <svg viewBox="0 0 100 130" aria-hidden="true" class="ph-fig">
        <circle cx="50" cy="42" r="17" />
        <path d="M50 62 C30 62 20 82 18 112 L82 112 C80 82 70 62 50 62 Z" />
      </svg>
      <span class="ph-initials${big ? " big" : ""}">${initials}</span>
    </div>`;
}

/* Dilleri seviyeleriyle birlikte yazdır: "İngilizce (C1), Rusça (B2)" */
function formatLanguages(t) {
  return (t.languages || [])
    .map(l => t.langLevels?.[l] ? `${l} (${t.langLevels[l]})` : l)
    .join(", ");
}

/* Diğer scriptlerin erişimi için global */
window.VERA = {
  AGENCY, CATEGORIES, TALENTS, LABELS, SERVICES, PACKAGES, LOCATIONS,
  RATES, HEADCOUNT_MID, DURATION_DAYS, FAQ_CANDIDATES, FAQ_CLIENTS,
  PROJECTS, COUNTERS, BRANDS, TESTIMONIALS, BLOG_POSTS,
  talentPlaceholder, formatLanguages,
};
