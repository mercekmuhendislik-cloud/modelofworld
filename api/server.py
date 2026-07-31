# -*- coding: utf-8 -*-
"""
VERA / modelofworld.com — Üyelik & Aday Paneli API'si  (v3)
Yalnızca Python standart kütüphanesi kullanır (pip gerekmez).
127.0.0.1:8010 dinler; dış dünyaya Caddy /api/* üzerinden açılır.

v3: albüm kategorili medya (stüdyo/podyum/polaroid), yumuşak silme (arşiv),
yönetici onay havuzu (gerekçeli red), ajans içi not/puan/etiket,
denetim günlüğü (audit), iş teklifi akışı (booking), dijital imza,
video-book linki. Eski veritabanı otomatik yükseltilir.
"""
import json, os, re, sqlite3, secrets, hashlib, mimetypes, threading, base64, struct, hmac, time as _time, shutil, ctypes, traceback, sys

START_TIME = _time.time()
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DATA_DIR = os.environ.get("MOW_DATA", r"C:\inetpub\modelofworld-data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
DB_PATH = os.path.join(DATA_DIR, "uye.db")
ADMIN_KEY_FILE = os.path.join(DATA_DIR, "admin-key.txt")
SESSION_DAYS = 30

UPLOAD_RULES = {
    "photo": ({".jpg", ".jpeg", ".png", ".webp", ".heic"}, 12 * 1024 * 1024, 30),
    "video": ({".mp4", ".mov", ".webm"}, 80 * 1024 * 1024, 3),
    "belge": ({".pdf", ".jpg", ".jpeg", ".png"}, 10 * 1024 * 1024, 3),
    "imza":  ({".png", ".jpg", ".jpeg"}, 2 * 1024 * 1024, 3),
    "kimlik": ({".pdf", ".jpg", ".jpeg", ".png"}, 8 * 1024 * 1024, 2),
    "adli":   ({".pdf", ".jpg", ".jpeg", ".png"}, 8 * 1024 * 1024, 2),
}
ALBUMS = {"studio", "podium", "polaroid", "sanatsal", "genel"}
# Geçerli başvuru kategorileri — assets/js/data.js içindeki CATEGORIES ile aynı kalmalı
CATEGORY_KEYS = {"model", "hostes", "yuz", "el_ayak", "cocuk", "nu",
                 "fitness", "plus", "oyuncu", "dans", "promo"}
MAX_BODY = 85 * 1024 * 1024

os.makedirs(UPLOAD_DIR, exist_ok=True)

if not os.path.exists(ADMIN_KEY_FILE):
    with open(ADMIN_KEY_FILE, "w") as f:
        f.write(secrets.token_urlsafe(24))
ADMIN_KEY = open(ADMIN_KEY_FILE).read().strip()

_local = threading.local()
def db():
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(DB_PATH)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn

# Üyenin kendisinin güncelleyebildiği alanlar
PROFILE_COLS = [
    "category", "gender", "birthdate", "age", "city",
    "height", "weight", "bust", "waist", "hip", "shoe", "size",
    "hair", "eye", "skin", "languages", "instagram", "about",
    "availability", "privacy", "video_link",
    "shoot_prefs", "boundaries", "chaperone",
    "tattoo_info", "scar_info", "aesthetic_info", "skills",
    "rate_catalog", "rate_runway", "rate_artistic",
    "iban", "bank_name", "account_name", "invoice_type", "tax_no",
    "parent_name", "parent_tc", "parent_phone",
    "consent_kvkk", "consent_contract",
]
# Yalnızca yönetici alanları — /api/me bunları asla döndürmez
ADMIN_COLS = ["admin_note", "admin_rating", "admin_tags"]
# Yayın bayrakları: yalnızca yönetici değiştirir, üye görebilir
FLAG_COLS = ["published", "featured"]
# Üyeye görünen ama üyenin değiştiremediği alanlar
READONLY_COLS = ["status", "review_note", "consent_at"]
LONG_COLS = {"availability": 6000, "about": 2000, "admin_note": 2000, "review_note": 1000}

def init_db():
    c = sqlite3.connect(DB_PATH)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
      fullname TEXT, phone TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS profiles(
      user_id INTEGER PRIMARY KEY, status TEXT DEFAULT 'inceleniyor');
    CREATE TABLE IF NOT EXISTS photos(
      id INTEGER PRIMARY KEY, user_id INTEGER, filename TEXT, orig TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY, user_id INTEGER, expires TEXT);
    CREATE TABLE IF NOT EXISTS submissions(
      id INTEGER PRIMARY KEY, kind TEXT, data TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS audit(
      id INTEGER PRIMARY KEY, who TEXT, action TEXT, user_id INTEGER,
      detail TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS jobs(
      id INTEGER PRIMARY KEY, title TEXT, date TEXT, location TEXT,
      hours TEXT, fee TEXT, note TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS job_offers(
      id INTEGER PRIMARY KEY, job_id INTEGER, user_id INTEGER,
      status TEXT DEFAULT 'beklemede', updated TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS shares(
      token TEXT PRIMARY KEY, user_ids TEXT, allow_sensitive INTEGER DEFAULT 0,
      expires TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS admin_users(
      id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      pass_hash TEXT, salt TEXT, role TEXT DEFAULT 'admin',
      totp_secret TEXT, totp_on INTEGER DEFAULT 0, created TEXT);
    CREATE TABLE IF NOT EXISTS admin_sessions(
      token TEXT PRIMARY KEY, username TEXT, expires TEXT,
      ip TEXT, ua TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS tasks(
      id INTEGER PRIMARY KEY, title TEXT, note TEXT,
      assigned_to TEXT, created_by TEXT, status TEXT DEFAULT 'acik',
      user_ref INTEGER, created TEXT, updated TEXT);
    """)
    for col in PROFILE_COLS + ADMIN_COLS + READONLY_COLS + FLAG_COLS:
        try: c.execute(f"ALTER TABLE profiles ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError: pass
    for col, ddl in [("kind", "TEXT DEFAULT 'photo'"), ("album", "TEXT DEFAULT 'genel'"),
                     ("deleted", "INTEGER DEFAULT 0"), ("thumb", "TEXT")]:
        try: c.execute(f"ALTER TABLE photos ADD COLUMN {col} {ddl}")
        except sqlite3.OperationalError: pass
    for col in ["sensitive", "usage"]:
        try: c.execute(f"ALTER TABLE jobs ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError: pass
    for col in ["consent_at", "checkin_at", "checkin_loc", "checkout_at", "checkout_loc",
                "feedback_rating", "feedback_note"]:
        try: c.execute(f"ALTER TABLE job_offers ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE shares ADD COLUMN client_likes TEXT DEFAULT '[]'")
    except sqlite3.OperationalError: pass
    # Gelen formlar: üyeye dönüştürülünce hangi üyeye bağlandığı işaretlenir
    for col, ddl in [("user_id", "INTEGER"), ("processed", "TEXT DEFAULT '0'")]:
        try: c.execute(f"ALTER TABLE submissions ADD COLUMN {col} {ddl}")
        except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE job_offers ADD COLUMN payment_status TEXT DEFAULT 'odenecek'")
    except sqlite3.OperationalError: pass
    # v7: üye silme artık çöp kutusuna taşır — 'deleted' silinme zamanını tutar,
    # boş/NULL ise üye etkin demektir. Kalıcı silme kaydı tamamen kaldırır.
    try: c.execute("ALTER TABLE users ADD COLUMN deleted TEXT")
    except sqlite3.OperationalError: pass
    # Yönetici şifresi ilk kurulumda mevcut anahtara eşitlenir (sonra panelden değiştirilir)
    if not c.execute("SELECT 1 FROM settings WHERE k='admin_salt'").fetchone():
        salt = secrets.token_hex(16)
        c.execute("INSERT INTO settings(k,v) VALUES('admin_salt',?)", (salt,))
        c.execute("INSERT INTO settings(k,v) VALUES('admin_hash',?)",
                  (hashlib.pbkdf2_hmac("sha256", ADMIN_KEY.encode(), bytes.fromhex(salt), 200_000).hex(),))
    try:
        c.execute("ALTER TABLE audit ADD COLUMN ip TEXT")
    except sqlite3.OperationalError:
        pass
    # v5: tekli şifreden çok kullanıcılı sisteme geçiş — 'admin' kullanıcısı
    # mevcut şifreyi (settings'teki hash) devralır, giriş bilgileri değişmez.
    if not c.execute("SELECT 1 FROM admin_users").fetchone():
        h = c.execute("SELECT v FROM settings WHERE k='admin_hash'").fetchone()[0]
        sl = c.execute("SELECT v FROM settings WHERE k='admin_salt'").fetchone()[0]
        c.execute("INSERT INTO admin_users(username,pass_hash,salt,role,created) VALUES('admin',?,?,'admin',?)",
                  (h, sl, datetime.now(timezone.utc).isoformat(timespec='seconds')))
    c.commit(); c.close()
init_db()

def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()

def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")

def audit(who, action, user_id=None, detail=""):
    db().execute("INSERT INTO audit(who,action,user_id,detail,created,ip) VALUES(?,?,?,?,?,?)",
                 (who, action, user_id, str(detail)[:400], now(), getattr(_local, "ip", "")))

# ---- TOTP (Google Authenticator) — stdlib ----
def totp_at(secret_b32, offset=0):
    key = base64.b32decode(secret_b32)
    msg = struct.pack(">Q", int(_time.time() // 30) + offset)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[-1] & 0x0F
    return "{:06d}".format((struct.unpack(">I", h[o:o+4])[0] & 0x7FFFFFFF) % 1000000)

def totp_ok(secret_b32, code):
    code = str(code or "").strip()
    return any(code == totp_at(secret_b32, d) for d in (-1, 0, 1))

def system_health():
    """RAM / disk / DB boyutu / çalışma süresi (yalnızca stdlib)."""
    out = {"uptime_min": int((_time.time() - START_TIME) / 60), "py": sys.version.split()[0]}
    try:
        class MEMSTAT(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        m = MEMSTAT(); m.dwLength = ctypes.sizeof(MEMSTAT)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        out["ram_pct"] = m.dwMemoryLoad
        out["ram_total_gb"] = round(m.ullTotalPhys / 1024**3, 1)
    except Exception:
        pass
    try:
        du = shutil.disk_usage("C:\\")
        out["disk_pct"] = round(du.used / du.total * 100)
        out["disk_free_gb"] = round(du.free / 1024**3, 1)
    except Exception:
        pass
    try:
        out["db_mb"] = round(os.path.getsize(DB_PATH) / 1024**2, 2)
        toplam = 0
        for f in os.listdir(UPLOAD_DIR):
            toplam += os.path.getsize(os.path.join(UPLOAD_DIR, f))
        out["media_mb"] = round(toplam / 1024**2, 1)
    except Exception:
        pass
    # Nöbetçi görevinin API'yi doğru komutla yeniden başlatabilmesi için
    # (system_health yalnızca yönetici uçlarından döndürülür)
    out["python"] = sys.executable
    out["script"] = os.path.abspath(__file__)
    out["data_dir"] = DATA_DIR
    return out

# Rol izinleri: hangi rol hangi işlemi yapabilir
ROLE_PERMS = {
    "admin":    {"list", "review", "note", "update", "job", "share", "users", "sessions", "finance"},
    "editor":   {"list", "review", "note", "update", "job", "share"},
    "muhasebe": {"list", "finance"},
}

def parse_multipart(body, ctype):
    m = re.search(r'boundary=([^;]+)', ctype)
    if not m: return {}, []
    b = m.group(1).strip().strip('"').encode()
    fields, files = {}, []
    for part in body.split(b"--" + b):
        part = part.strip(b"\r\n")
        if not part or part == b"--" or b"\r\n\r\n" not in part:
            continue
        head, data = part.split(b"\r\n\r\n", 1)
        if data.endswith(b"\r\n"): data = data[:-2]
        headers = head.decode("utf-8", "ignore")
        nm = re.search(r'name="([^"]+)"', headers)
        fn = re.search(r'filename="([^"]*)"', headers)
        if fn and fn.group(1):
            files.append((nm.group(1) if nm else "file", os.path.basename(fn.group(1)), data))
        elif nm:
            fields[nm.group(1)] = data.decode("utf-8", "ignore")
    return fields, files

def webp_mi(veri):
    """Küçük kopya gerçekten WebP mi? (RIFF....WEBP imzası)"""
    return len(veri) > 16 and veri[:4] == b"RIFF" and veri[8:12] == b"WEBP"


def foto_yolu(row, kucuk):
    """İstenen boyuttaki dosyanın tam yolu. Küçük kopya yoksa orijinale düşer."""
    if kucuk and row["thumb"]:
        yol = os.path.join(UPLOAD_DIR, row["thumb"])
        if os.path.exists(yol):
            return yol
    return os.path.join(UPLOAD_DIR, row["filename"])


def is_minor(uid):
    """18 yas alti veya cocuk kategorisi - sanatsal/nu icerik sistemsel olarak kapali."""
    row = db().execute("SELECT birthdate, category, age FROM profiles WHERE user_id=?", (uid,)).fetchone()
    if not row: return False
    if "cocuk" in (row["category"] or ""): return True
    try:
        y = int(str(row["age"] or "0") or 0)
        if y > 0: return y < 18
    except Exception:
        pass
    b = row["birthdate"] or ""
    try:
        bd = datetime.fromisoformat(b)
        return (datetime.now() - bd).days / 365.25 < 18
    except Exception:
        return False

def public_name(fullname):
    """Gizlilik kuralı: sitede yalnızca ad + soyad baş harfi yayınlanır."""
    parcalar = (fullname or "").strip().split()
    if not parcalar: return "İsimsiz"
    if len(parcalar) == 1: return parcalar[0]
    return " ".join(parcalar[:-1]) + " " + parcalar[-1][0].upper() + "."

def _sayi(v):
    try: return int(str(v).strip())
    except Exception: return None

def cast_list():
    """Siteye çıkacak kadro: onaylı + yayında + profili herkese açık üyeler.
       Öne çıkanlar başta. Hassas/kişisel hiçbir alan dışa verilmez."""
    rows = db().execute("""
        SELECT u.fullname, p.* FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE COALESCE(u.deleted,'') = ''
          AND COALESCE(p.published,'0') = '1'
          AND COALESCE(p.status,'') = 'onaylandi'
          AND COALESCE(p.privacy,'private') = 'public'
        ORDER BY CASE WHEN COALESCE(p.featured,'0')='1' THEN 0 ELSE 1 END, p.user_id DESC
    """).fetchall()
    liste = []
    for r in rows:
        uid = r["user_id"]
        gruplar = {"studio": [], "podium": [], "polaroid": []}
        for f in db().execute("""SELECT id, album FROM photos WHERE user_id=? AND kind='photo'
                AND deleted=0 AND COALESCE(album,'genel') != 'sanatsal' ORDER BY id""", (uid,)):
            al = f["album"] if f["album"] in gruplar else "studio"
            gruplar[al].append("/api/cast-photo/%d" % f["id"])
        tumFoto = gruplar["studio"] + gruplar["podium"] + gruplar["polaroid"]
        diller = ["Türkçe"] + [d.strip() for d in (r["languages"] or "").split(",") if d.strip()]
        try: yetenekler = (json.loads(r["skills"] or "{}").get("list") or [])
        except Exception: yetenekler = []
        katlar = [c for c in (r["category"] or "").split(",") if c]
        liste.append({
            "id": "u%d" % uid, "real": True,
            "name": public_name(r["fullname"]),
            "category": katlar[0] if katlar else "model",
            "categories": katlar,
            "gender": r["gender"] or "",
            "age": _sayi(r["age"]), "height": _sayi(r["height"]), "weight": _sayi(r["weight"]),
            "bust": _sayi(r["bust"]), "waist": _sayi(r["waist"]), "hip": _sayi(r["hip"]),
            "shoe": _sayi(r["shoe"]), "size": r["size"] or "",
            "hair": r["hair"] or "", "eye": r["eye"] or "", "skin": r["skin"] or "",
            "city": r["city"] or "", "languages": diller, "langLevels": {},
            "experience": "", "featured": (r["featured"] or "0") == "1", "available": True,
            "tags": yetenekler,
            "gradient": ["#2b1d34", "#7a5c8f"],
            "photo": tumFoto[0] if tumFoto else "",
            "photos": gruplar, "video": r["video_link"] or "",
            "bio": r["about"] or "",
        })
    return liste

def offers_of(uid):
    rows = db().execute("""SELECT o.id, o.status, o.updated, o.consent_at,
        o.checkin_at, o.checkout_at, o.feedback_rating,
        j.title, j.date, j.location, j.hours, j.fee, j.note, j.sensitive, j.usage
        FROM job_offers o JOIN jobs j ON j.id=o.job_id
        WHERE o.user_id=? ORDER BY o.id DESC""", (uid,)).fetchall()
    return [dict(r) for r in rows]

class Handler(BaseHTTPRequestHandler):
    server_version = "MOW/7.0"

    def _json(self, code, obj, cookie=None):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        if cookie: self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(raw)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY: return None
        return self.rfile.read(n)

    def _session_user(self):
        raw = self.headers.get("Cookie") or ""
        m = re.search(r'mow=([A-Za-z0-9_\-]+)', raw)
        if not m: return None
        row = db().execute("SELECT user_id, expires FROM sessions WHERE token=?", (m.group(1),)).fetchone()
        if not row or row["expires"] < now(): return None
        # Çöp kutusundaki üye siteyi kullanamaz (oturumu açık kalmış olsa bile)
        u = db().execute("SELECT COALESCE(deleted,'') d FROM users WHERE id=?", (row["user_id"],)).fetchone()
        if not u or u["d"]: return None
        return row["user_id"]

    def _make_session(self, uid):
        tok = secrets.token_urlsafe(32)
        exp = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        db().execute("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)", (tok, uid, exp))
        db().commit()
        return f"mow={tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_DAYS*86400}"

    def _dosya_gonder(self, fp, kapsam):
        """Görsel gönder: ETag ile 304 döner, uzun süreli önbelleklenir.
        Fotoğraf dosyaları hiç değişmez (yeni yükleme = yeni kayıt), bu yüzden
        'immutable' güvenlidir — panel ikinci açılışta ağdan hiç indirmez."""
        try:
            st = os.stat(fp)
        except OSError:
            return self._json(404, {"error": "Dosya yok"})
        etag = '"%x-%x"' % (int(st.st_mtime), st.st_size)
        if (self.headers.get("If-None-Match") or "") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "%s, max-age=2592000, immutable" % kapsam)
            self.end_headers()
            return
        data = open(fp, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(fp)[0] or "image/jpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "%s, max-age=2592000, immutable" % kapsam)
        self.end_headers()
        self.wfile.write(data)

    def _ip(self):
        xf = self.headers.get("X-Forwarded-For") or ""
        return xf.split(",")[0].strip() if xf else (self.client_address[0] if self.client_address else "")

    def _admin_token(self):
        raw = self.headers.get("Cookie") or ""
        m = re.search(r'mowadm=([A-Za-z0-9_\-]+)', raw)
        return m.group(1) if m else None

    def _yerel_istek(self):
        """İstek doğrudan sunucunun kendisinden mi geldi?
        Caddy üzerinden gelen her istekte X-Forwarded-For bulunur; yoksa istek
        127.0.0.1:8010'a doğrudan yapılmış demektir (sunucu konsolu)."""
        return not (self.headers.get("X-Forwarded-For") or "").strip()

    def _admin(self, qs=None):
        """Aktif yönetici kimliği: {username, role} veya None.
        Yedek anahtar (?key=) yalnızca sunucunun kendisinden kabul edilir — anahtar
        bir şekilde dışa sızsa bile internetten yönetici yetkisi alınamaz."""
        if qs is not None and qs.get("key", [""])[0] == ADMIN_KEY and self._yerel_istek():
            return {"username": "yedek-anahtar", "role": "admin"}
        tok = self._admin_token()
        if not tok: return None
        row = db().execute("""SELECT s.username, s.expires, u.role FROM admin_sessions s
            JOIN admin_users u ON u.username = s.username WHERE s.token=?""", (tok,)).fetchone()
        if not row or row["expires"] < now(): return None
        return {"username": row["username"], "role": row["role"] or "admin"}

    def _is_admin(self, qs):
        return self._admin(qs) is not None

    def _can(self, adm, perm):
        return adm and perm in ROLE_PERMS.get(adm["role"], set())

    def log_message(self, fmt, *args):
        pass

    def _safe(self, fn):
        """Beklenmeyen hataları günlüğe yazıp 500 döndür (hata izleme)."""
        try:
            fn()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                audit("sistem", "HATA", None, f"{self.command} {self.path}: {type(e).__name__}: {e} | " +
                      traceback.format_exc().splitlines()[-2][:150])
                db().commit()
            except Exception:
                pass
            try:
                self._json(500, {"error": "Sunucu hatası — kayıt altına alındı"})
            except Exception:
                pass

    # ---------------- GET ----------------
    def do_GET(self):
        _local.ip = self._ip()
        return self._safe(self._get)

    def _get(self):
        u = urlparse(self.path); qs = parse_qs(u.query); p = u.path

        if p == "/api/health":
            return self._json(200, {"ok": True, "v": 7})

        if p == "/api/cast":
            return self._json(200, {"cast": cast_list()})

        if p == "/api/cast.js":
            raw = ("window.VERA_CAST = " + json.dumps(cast_list(), ensure_ascii=False) + ";").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "public, max-age=30")
            self.end_headers()
            self.wfile.write(raw)
            return

        m = re.match(r"^/api/cast-photo/(\d+)$", p)
        if m:
            row = db().execute("""SELECT ph.filename, ph.thumb FROM photos ph JOIN profiles pr ON pr.user_id = ph.user_id
                WHERE ph.id=? AND ph.deleted=0 AND ph.kind='photo'
                  AND COALESCE(ph.album,'genel') != 'sanatsal'
                  AND COALESCE(pr.published,'0') = '1'
                  AND COALESCE(pr.status,'') = 'onaylandi'
                  AND COALESCE(pr.privacy,'private') = 'public'""", (int(m.group(1)),)).fetchone()
            if not row: return self._json(404, {"error": "Yok"})
            fp = foto_yolu(row, qs.get("k", [""])[0] == "1")
            if not os.path.exists(fp): return self._json(404, {"error": "Dosya yok"})
            return self._dosya_gonder(fp, "public")

        if p == "/api/flags":
            row = db().execute("SELECT v FROM settings WHERE k='maintenance'").fetchone()
            return self._json(200, {"maintenance": bool(row and row["v"] == "1")})

        if p == "/api/admin/pulse":
            adm = self._admin(qs)
            if not adm: return self._json(403, {"error": "Yetki yok"})
            n = lambda q: db().execute(q).fetchone()[0]
            return self._json(200, {
                "users": n("SELECT COUNT(*) FROM users WHERE COALESCE(deleted,'')=''"),
                "bekleyen": n("SELECT COUNT(*) FROM profiles WHERE COALESCE(status,'inceleniyor')='inceleniyor'"),
                "sos": n("SELECT COUNT(*) FROM submissions WHERE kind='SOS'"),
                "subs": n("SELECT COUNT(*) FROM submissions"),
                "tasks": n("SELECT COUNT(*) FROM tasks WHERE status='acik'"),
            })

        if p == "/api/admin/backup":
            adm = self._admin(qs)
            if not self._can(adm, "users"):
                return self._json(403, {"error": "Yedek almak için Yönetici rolü gerekli"})
            tmp = os.path.join(DATA_DIR, "yedek-gecici.db")
            src = sqlite3.connect(DB_PATH); dst = sqlite3.connect(tmp)
            with dst: src.backup(dst)
            src.close(); dst.close()
            data = open(tmp, "rb").read()
            os.remove(tmp)
            audit("admin:" + adm["username"], "yedek-indirildi", None, f"{len(data)//1024} KB")
            db().commit()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition",
                f'attachment; filename="modelofworld-yedek-{datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")}.db"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if p == "/api/me":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            user = db().execute("SELECT id,email,fullname,phone FROM users WHERE id=?", (uid,)).fetchone()
            prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
            prof = dict(prof) if prof else {}
            for c in ADMIN_COLS: prof.pop(c, None)   # iç notlar üyeye sızmaz
            media = db().execute(
                "SELECT id,kind,album,orig,created,(thumb IS NOT NULL) AS kucuk"
                " FROM photos WHERE user_id=? AND deleted=0 ORDER BY id",
                (uid,)).fetchall()
            return self._json(200, {
                "user": dict(user) if user else None,
                "profile": prof,
                "media": [dict(r) for r in media],
                "offers": offers_of(uid),
            })

        m = re.match(r"^/api/photo/(\d+)$", p)
        if m:
            row = db().execute("SELECT * FROM photos WHERE id=?", (int(m.group(1)),)).fetchone()
            if not row: return self._json(404, {"error": "Yok"})
            uid = self._session_user()
            if row["user_id"] != uid and not self._is_admin(qs):
                return self._json(403, {"error": "Yetki yok"})
            kucuk = qs.get("k", [""])[0] == "1"
            fp = foto_yolu(row, kucuk)
            if not os.path.exists(fp): return self._json(404, {"error": "Dosya yok"})
            return self._dosya_gonder(fp, "private")

        m = re.match(r"^/api/share/([A-Za-z0-9_\-]+)$", p)
        if m:
            sh = db().execute("SELECT * FROM shares WHERE token=?", (m.group(1),)).fetchone()
            if not sh or sh["expires"] < now():
                return self._json(404, {"error": "Bu bağlantının süresi dolmuş"})
            out = []
            for uid_s in (sh["user_ids"] or "").split(","):
                if not uid_s.isdigit(): continue
                uid = int(uid_s)
                user = db().execute("SELECT fullname FROM users WHERE id=? AND COALESCE(deleted,'')=''",
                                    (uid,)).fetchone()
                prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
                if not user or not prof: continue
                pr = dict(prof)
                pub = {k: pr.get(k) for k in ["category", "city", "age", "height", "weight", "bust", "waist",
                       "hip", "shoe", "size", "hair", "eye", "skin", "languages"]}
                q = "SELECT id FROM photos WHERE user_id=? AND kind='photo' AND deleted=0"
                if not sh["allow_sensitive"]:
                    q += " AND album != 'sanatsal'"
                photos = [r["id"] for r in db().execute(q + " ORDER BY CASE album WHEN 'studio' THEN 0 WHEN 'podium' THEN 1 ELSE 2 END, id", (uid,))]
                out.append({"id": uid, "name": user["fullname"], "profile": pub, "photos": photos})
            likes = []
            try: likes = json.loads(sh["client_likes"]) if sh.get("client_likes") else []
            except Exception: pass
            return self._json(200, {"members": out, "expires": sh["expires"], "likes": likes})

        m = re.match(r"^/api/share-photo/([A-Za-z0-9_\-]+)/(\d+)$", p)
        if m:
            sh = db().execute("SELECT * FROM shares WHERE token=?", (m.group(1),)).fetchone()
            if not sh or sh["expires"] < now():
                return self._json(404, {"error": "Süresi dolmuş"})
            row = db().execute("SELECT * FROM photos WHERE id=?", (int(m.group(2)),)).fetchone()
            uids = (sh["user_ids"] or "").split(",")
            if (not row or str(row["user_id"]) not in uids or row["deleted"]
                    or row["kind"] != "photo"
                    or (row["album"] == "sanatsal" and not sh["allow_sensitive"])):
                return self._json(403, {"error": "Yetki yok"})
            fp = foto_yolu(row, qs.get("k", [""])[0] == "1")
            if not os.path.exists(fp): return self._json(404, {"error": "Dosya yok"})
            return self._dosya_gonder(fp, "private")

        if p == "/api/admin/list":
            adm = self._admin(qs)
            if not adm: return self._json(403, {"error": "Yetki yok"})
            # Çöp kutusundaki üyeler ayrı listede döner; normal listeye karışmaz
            users = [dict(r) for r in db().execute(
                "SELECT id,email,fullname,phone,created,COALESCE(deleted,'') deleted FROM users"
                " ORDER BY id DESC")]
            silinenler = [u for u in users if u["deleted"]]
            users = [u for u in users if not u["deleted"]]
            for usr in users + silinenler:
                prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (usr["id"],)).fetchone()
                usr["profile"] = dict(prof) if prof else {}
                usr["media"] = [dict(r) for r in db().execute(
                    "SELECT id,kind,album,orig,deleted,created,(thumb IS NOT NULL) AS kucuk"
                    " FROM photos WHERE user_id=? ORDER BY id",
                    (usr["id"],))]
                usr["offers"] = offers_of(usr["id"])
            jobs = [dict(r) for r in db().execute("SELECT * FROM jobs ORDER BY id DESC LIMIT 50")]
            for j in jobs:
                j["offers"] = [dict(r) for r in db().execute("""
                    SELECT o.status, o.updated, o.consent_at, o.checkin_at, o.checkout_at,
                           o.checkin_loc, o.feedback_rating, o.feedback_note, u.fullname, u.id user_id
                    FROM job_offers o JOIN users u ON u.id=o.user_id WHERE o.job_id=?""", (j["id"],))]
            subs = [dict(r) for r in db().execute("SELECT * FROM submissions ORDER BY id DESC LIMIT 100")]
            logs = [dict(r) for r in db().execute("SELECT * FROM audit ORDER BY id DESC LIMIT 120")]
            sos = [dict(r) for r in db().execute("SELECT * FROM submissions WHERE kind='SOS' ORDER BY id DESC LIMIT 20")]
            shares = [dict(r) for r in db().execute("SELECT token, user_ids, allow_sensitive, expires, client_likes FROM shares WHERE expires >= ? ORDER BY rowid DESC LIMIT 20", (now(),))]
            # Rol bazlı veri filtresi: finans izni olmayan roller IBAN/vergi göremez
            if not self._can(adm, "finance"):
                for usr in users + silinenler:
                    for f in ("iban", "bank_name", "account_name", "invoice_type", "tax_no"):
                        if usr["profile"].get(f): usr["profile"][f] = "••• (yetki yok)"
            tasks = [dict(r) for r in db().execute("SELECT * FROM tasks ORDER BY status='acik' DESC, id DESC LIMIT 60")]
            trow = db().execute("SELECT v FROM settings WHERE k='red_templates'").fetchone()
            templates = json.loads(trow["v"]) if trow else []
            mrow = db().execute("SELECT v FROM settings WHERE k='maintenance'").fetchone()
            out = {"users": users, "silinenler": silinenler,
                   "jobs": jobs, "submissions": subs, "audit": logs,
                   "sos": sos, "shares": shares, "tasks": tasks, "templates": templates,
                   "maintenance": bool(mrow and mrow["v"] == "1"),
                   "me": {"username": adm["username"], "role": adm["role"]}}
            if adm["role"] == "admin":
                out["health"] = system_health()
            if self._can(adm, "sessions"):
                mytok = self._admin_token()
                out["sessions"] = [{**dict(r), "current": r["token"] == mytok, "token": r["token"][:12] + "…", "full_token": r["token"]}
                                   for r in db().execute("SELECT * FROM admin_sessions WHERE expires >= ? ORDER BY created DESC", (now(),))]
            if self._can(adm, "users"):
                u2 = db().execute("SELECT username, role, totp_on, created FROM admin_users ORDER BY id").fetchall()
                out["admins"] = [dict(r) for r in u2]
            return self._json(200, out)

        return self._json(404, {"error": "Bilinmeyen uç"})

    # ---------------- POST ----------------
    def do_POST(self):
        _local.ip = self._ip()
        return self._safe(self._post)

    def _post(self):
        u = urlparse(self.path); qs = parse_qs(u.query); p = u.path
        ctype = self.headers.get("Content-Type") or ""
        body = self._body()
        if body is None:
            return self._json(413, {"error": "Dosya çok büyük"})

        def jbody():
            try: return json.loads(body.decode("utf-8", "replace"))
            except Exception: return {}

        if p == "/api/register":
            # Kısa başvuru formu (basvuru.html): hesap + temel profil tek istekte açılır.
            # Ölçüler, imza, belgeler ve diğer alanlar panelden tamamlanır.
            d = jbody()
            email = (d.get("email") or "").strip().lower()
            pw = d.get("password") or ""
            adsoyad = (d.get("fullname") or "").strip()
            telefon = (d.get("phone") or "").strip()
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                return self._json(400, {"error": "Geçerli bir e-posta girin"})
            if len(pw) < 6:
                return self._json(400, {"error": "Şifre en az 6 karakter olmalı"})
            if len(adsoyad.split()) < 2:
                return self._json(400, {"error": "Ad ve soyadınızı birlikte girin"})
            if not re.match(r"^0[1-9]\d{9}$", re.sub(r"\D", "", telefon)):
                return self._json(400, {"error": "Telefon numarasını eksiksiz girin (örn. 0532 555 55 55)"})

            # --- Başvuru profili ---
            kats = [c for c in str(d.get("category") or "").split(",") if c in CATEGORY_KEYS]
            if not kats:
                return self._json(400, {"error": "En az bir kategori seçin"})
            cinsiyet = str(d.get("gender") or "")
            if cinsiyet not in ("kadin", "erkek"):
                return self._json(400, {"error": "Cinsiyet seçin"})
            try:
                yas = int(str(d.get("age") or "0"))
            except ValueError:
                yas = 0
            if not 1 <= yas <= 50:
                return self._json(400, {"error": "Yaşınızı seçin"})
            sehir = str(d.get("city") or "").strip()[:40]
            if not sehir:
                return self._json(400, {"error": "Şehir seçin"})

            resit_degil = yas < 18 or "cocuk" in kats
            if "nu" in kats and resit_degil:
                return self._json(400, {"error": "Nü / sanatsal kategori yalnızca 18 yaş ve üzeri adaylar içindir"})
            veli_ad = str(d.get("parent_name") or "").strip()[:80]
            veli_tel = str(d.get("parent_phone") or "").strip()[:30]
            if resit_degil and (len(veli_ad.split()) < 2 or len(re.sub(r"\D", "", veli_tel)) < 10):
                return self._json(400, {"error": "18 yaş altı başvurularda veli ad soyad ve telefon zorunludur"})

            var = db().execute("SELECT COALESCE(deleted,'') d FROM users WHERE email=?", (email,)).fetchone()
            if var and var["d"]:
                return self._json(409, {"error": "Bu e-posta ile daha önce kayıt yapılmış ve kayıt kaldırılmış. "
                                                 "Yeniden başvurmak için ajansla iletişime geçin."})
            if var:
                return self._json(409, {"error": "Bu e-posta zaten kayıtlı — giriş yapın"})
            salt = secrets.token_hex(16)
            cur = db().execute(
                "INSERT INTO users(email,pass_hash,salt,fullname,phone,created) VALUES(?,?,?,?,?,?)",
                (email, hash_pw(pw, salt), salt, adsoyad, telefon, now()))
            uid = cur.lastrowid
            db().execute(
                "INSERT INTO profiles(user_id, status, privacy, category, gender, age, city, "
                "languages, instagram, about, parent_name, parent_phone, "
                "consent_kvkk, consent_contract, consent_at) "
                "VALUES(?, 'inceleniyor', 'public', ?,?,?,?,?,?,?,?,?,?,?,?)",
                (uid, ",".join(kats), cinsiyet, str(yas), sehir,
                 str(d.get("languages") or "")[:200], str(d.get("instagram") or "").strip()[:60],
                 str(d.get("about") or "")[:1500],
                 veli_ad if resit_degil else "", veli_tel if resit_degil else "",
                 # Başvuru formundaki tek onay kutusu KVKK + çalışma şartlarını kapsar
                 "1" if str(d.get("consent_kvkk") or "") == "1" else "0",
                 "1" if str(d.get("consent_contract") or "") == "1" else "0",
                 now()))
            audit("uye", "kayit", uid, "%s · %s · %s yaş · %s" % (email, ",".join(kats), yas, sehir))
            db().commit()
            return self._json(200, {"ok": True}, cookie=self._make_session(uid))

        if p == "/api/login":
            d = jbody()
            email = (d.get("email") or "").strip().lower()
            row = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if not row or hash_pw(d.get("password") or "", row["salt"]) != row["pass_hash"]:
                return self._json(401, {"error": "E-posta veya şifre hatalı"})
            if (row["deleted"] or ""):
                return self._json(403, {"error": "Bu üyelik kaldırılmış. Bilgi için ajansla iletişime geçin."})
            return self._json(200, {"ok": True}, cookie=self._make_session(row["id"]))

        if p == "/api/logout":
            raw = self.headers.get("Cookie") or ""
            m = re.search(r'mow=([A-Za-z0-9_\-]+)', raw)
            if m:
                db().execute("DELETE FROM sessions WHERE token=?", (m.group(1),)); db().commit()
            return self._json(200, {"ok": True},
                cookie="mow=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")

        if p == "/api/password":
            # Üye kendi şifresini değiştirir (yöneticiden gelen geçici şifreyi de böyle değiştirir)
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            d = jbody()
            yeni = d.get("new") or ""
            if len(yeni) < 6:
                return self._json(400, {"error": "Yeni şifre en az 6 karakter olmalı"})
            row = db().execute("SELECT salt, pass_hash FROM users WHERE id=?", (uid,)).fetchone()
            if not row or hash_pw(d.get("old") or "", row["salt"]) != row["pass_hash"]:
                return self._json(401, {"error": "Mevcut şifreniz hatalı"})
            salt = secrets.token_hex(16)
            db().execute("UPDATE users SET pass_hash=?, salt=? WHERE id=?", (hash_pw(yeni, salt), salt, uid))
            db().execute("DELETE FROM sessions WHERE user_id=?", (uid,))   # diğer cihazlar çıkış yapar
            audit("uye", "sifre-degistirildi", uid, "")
            db().commit()
            return self._json(200, {"ok": True}, cookie=self._make_session(uid))

        if p == "/api/profile":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            d = jbody()
            iban = re.sub(r"\s", "", str(d.get("iban") or ""))
            if iban and not re.match(r"^TR\d{24}$", iban.upper()):
                return self._json(400, {"error": "IBAN geçersiz — TR ile başlayan 26 haneli numara girin"})
            if "iban" in d: d["iban"] = iban.upper()
            tc = str(d.get("parent_tc") or "").strip()
            if tc and not re.match(r"^\d{11}$", tc):
                return self._json(400, {"error": "Veli TC kimlik no 11 haneli olmalı"})
            # Yönetici düzeltmeleri: üyenin alanları + onay tarihi (eski kayıtları tamamlamak için)
            YONETICI_EK = ["consent_at"]
            sent = [c for c in PROFILE_COLS + YONETICI_EK if c in d]
            if sent:
                sets = ", ".join(f"{c}=?" for c in sent)
                vals = [str(d.get(c) or "")[:LONG_COLS.get(c, 500)] for c in sent] + [uid]
                db().execute(f"UPDATE profiles SET {sets} WHERE user_id=?", vals)
                audit("uye", "profil-guncelleme", uid, ", ".join(sent))
            # Yaş seçildiyse doğum tarihini de eşitle (sedcard/eski kayıt uyumu)
            if "age" in d:
                try:
                    y = int(str(d.get("age") or "0") or 0)
                    if 1 <= y <= 120:
                        dogum = (datetime.now(timezone.utc) - timedelta(days=int(y * 365.25))).strftime("%Y-%m-%d")
                        db().execute("UPDATE profiles SET birthdate=? WHERE user_id=?", (dogum, uid))
                except Exception:
                    pass
            if is_minor(uid):
                db().execute("UPDATE profiles SET shoot_prefs='standart' WHERE user_id=?", (uid,))
                row2 = db().execute("SELECT category FROM profiles WHERE user_id=?", (uid,)).fetchone()
                cats = [c for c in (row2["category"] or "").split(",") if c and c != "nu"]
                db().execute("UPDATE profiles SET category=? WHERE user_id=?", (",".join(cats), uid))
            prof = db().execute("SELECT consent_kvkk, consent_contract, consent_at FROM profiles WHERE user_id=?",
                                (uid,)).fetchone()
            if prof and prof["consent_kvkk"] == "1" and prof["consent_contract"] == "1" and not prof["consent_at"]:
                db().execute("UPDATE profiles SET consent_at=? WHERE user_id=?", (now(), uid))
                audit("uye", "onay-imza", uid, "KVKK + sözleşme onaylandı")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/upload":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            fields, files = parse_multipart(body, ctype)
            if not files: return self._json(400, {"error": "Dosya bulunamadı"})
            kind = fields.get("kind", "photo")
            if kind not in UPLOAD_RULES: kind = "photo"
            album = fields.get("album", "genel")
            if album not in ALBUMS: album = "genel"
            if album == "sanatsal":
                if is_minor(uid):
                    return self._json(403, {"error": "Bu albüm 18 yaş altı üyelere kapalıdır"})
                pr = db().execute("SELECT shoot_prefs FROM profiles WHERE user_id=?", (uid,)).fetchone()
                if not any(x in ((pr["shoot_prefs"] if pr else "") or "") for x in ("yari_nu", "nu")):
                    return self._json(403, {"error": "Önce Tercihler sekmesinden sanatsal çekim tercihinizi işaretleyin"})
            exts, max_size, max_count = UPLOAD_RULES[kind]
            count = db().execute("SELECT COUNT(*) c FROM photos WHERE user_id=? AND kind=? AND deleted=0",
                                 (uid, kind)).fetchone()["c"]
            if count >= max_count:
                return self._json(400, {"error": f"En fazla {max_count} adet yükleyebilirsiniz"})
            _, orig, data = files[0]
            ext = os.path.splitext(orig)[1].lower()
            if ext not in exts:
                return self._json(400, {"error": "İzin verilen türler: " + ", ".join(sorted(exts))})
            if len(data) > max_size:
                return self._json(400, {"error": f"Dosya çok büyük (maks. {max_size // 1024 // 1024} MB)"})
            if len(data) < 100: return self._json(400, {"error": "Dosya boş görünüyor"})
            fn = f"u{uid}_{kind}_{secrets.token_hex(8)}{ext}"
            with open(os.path.join(UPLOAD_DIR, fn), "wb") as f:
                f.write(data)
            # Tarayıcının ürettiği küçük kopya (varsa) ayrı dosyaya yazılır — listelerde bu kullanılır
            kucuk_fn = None
            for ad, kad, kdata in files[1:]:
                if ad == "thumb" and 100 < len(kdata) <= 900 * 1024 and webp_mi(kdata):
                    kucuk_fn = os.path.splitext(fn)[0] + "_k.webp"
                    with open(os.path.join(UPLOAD_DIR, kucuk_fn), "wb") as f:
                        f.write(kdata)
                    break
            cur = db().execute(
                "INSERT INTO photos(user_id,filename,orig,created,kind,album,deleted,thumb) VALUES(?,?,?,?,?,?,0,?)",
                (uid, fn, orig[:200], now(), kind, album, kucuk_fn))
            audit("uye", "medya-yukleme", uid, f"{kind}/{album}: {orig[:60]}")
            db().commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid, "kind": kind, "album": album})

        if p == "/api/admin/upload":
            # Yönetici, üye adına fotoğraf/belge yükler (üyenin kendi yüklemesiyle aynı kurallar).
            adm = self._admin(qs)
            if not self._can(adm, "update"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            fields, files = parse_multipart(body, ctype)
            if not files: return self._json(400, {"error": "Dosya bulunamadı"})
            uid = int(fields.get("user_id") or 0)
            if not db().execute("SELECT 1 FROM users WHERE id=? AND COALESCE(deleted,'')=''", (uid,)).fetchone():
                return self._json(404, {"error": "Üye bulunamadı"})
            kind = fields.get("kind", "photo")
            if kind not in UPLOAD_RULES: kind = "photo"
            album = fields.get("album", "genel")
            if album not in ALBUMS: album = "genel"
            if album == "sanatsal" and is_minor(uid):
                return self._json(403, {"error": "Sanatsal albüm 18 yaş altı üyelere kapalıdır"})
            exts, max_size, max_count = UPLOAD_RULES[kind]
            count = db().execute("SELECT COUNT(*) c FROM photos WHERE user_id=? AND kind=? AND deleted=0",
                                 (uid, kind)).fetchone()["c"]
            if count >= max_count:
                return self._json(400, {"error": f"Bu üyede en fazla {max_count} adet olabilir"})
            _, orig, data = files[0]
            ext = os.path.splitext(orig)[1].lower()
            if ext not in exts:
                return self._json(400, {"error": "İzin verilen türler: " + ", ".join(sorted(exts))})
            if len(data) > max_size:
                return self._json(400, {"error": f"Dosya çok büyük (maks. {max_size // 1024 // 1024} MB)"})
            if len(data) < 100: return self._json(400, {"error": "Dosya boş görünüyor"})
            fn = f"u{uid}_{kind}_{secrets.token_hex(8)}{ext}"
            with open(os.path.join(UPLOAD_DIR, fn), "wb") as f:
                f.write(data)
            kucuk_fn = None
            for ad, kad, kdata in files[1:]:
                if ad == "thumb" and 100 < len(kdata) <= 900 * 1024 and webp_mi(kdata):
                    kucuk_fn = os.path.splitext(fn)[0] + "_k.webp"
                    with open(os.path.join(UPLOAD_DIR, kucuk_fn), "wb") as f:
                        f.write(kdata)
                    break
            cur = db().execute(
                "INSERT INTO photos(user_id,filename,orig,created,kind,album,deleted,thumb) VALUES(?,?,?,?,?,?,0,?)",
                (uid, fn, orig[:200], now(), kind, album, kucuk_fn))
            audit("admin:" + adm["username"], "medya-yukleme", uid, f"{kind}/{album}: {orig[:60]}")
            db().commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid, "kind": kind, "album": album})

        if p == "/api/admin/media":
            # Üye fotoğrafını arşivle / arşivden çıkar / kalıcı sil, albümünü değiştir.
            adm = self._admin(qs)
            if not self._can(adm, "update"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            pid = int(d.get("photo_id") or 0)
            row = db().execute("SELECT * FROM photos WHERE id=?", (pid,)).fetchone()
            if not row: return self._json(404, {"error": "Dosya bulunamadı"})
            act = str(d.get("action") or "")
            if act == "arsivle":
                db().execute("UPDATE photos SET deleted=1 WHERE id=?", (pid,))
                audit("admin:" + adm["username"], "medya-arsiv", row["user_id"], (row["orig"] or "")[:60])
            elif act == "geri-al":
                db().execute("UPDATE photos SET deleted=0 WHERE id=?", (pid,))
                audit("admin:" + adm["username"], "medya-geri-al", row["user_id"], (row["orig"] or "")[:60])
            elif act == "kalici":
                for fn in (row["filename"], row["thumb"]):
                    if not fn: continue
                    try: os.remove(os.path.join(UPLOAD_DIR, fn))
                    except OSError: pass
                db().execute("DELETE FROM photos WHERE id=?", (pid,))
                audit("admin:" + adm["username"], "medya-kalici-sil", row["user_id"], (row["orig"] or "")[:60])
            elif act == "album":
                yeni = str(d.get("album") or "genel")
                if yeni not in ALBUMS: return self._json(400, {"error": "Geçersiz albüm"})
                if yeni == "sanatsal" and is_minor(row["user_id"]):
                    return self._json(403, {"error": "Sanatsal albüm 18 yaş altı üyelere kapalıdır"})
                db().execute("UPDATE photos SET album=? WHERE id=?", (yeni, pid))
                audit("admin:" + adm["username"], "medya-album", row["user_id"], f"{row['orig'] or ''}: {yeni}")
            else:
                return self._json(400, {"error": "Geçersiz işlem"})
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/thumb":
            # Eski fotoğraflar için küçük kopya ekleme (yönetici panelinden toplu çalıştırılır)
            adm = self._admin(qs)
            if not self._can(adm, "review"): return self._json(403, {"error": "Yetki yok"})
            fields, files = parse_multipart(body, ctype)
            if not files: return self._json(400, {"error": "Dosya bulunamadı"})
            pid = int(fields.get("photo_id") or 0)
            row = db().execute("SELECT * FROM photos WHERE id=?", (pid,)).fetchone()
            if not row: return self._json(404, {"error": "Fotoğraf bulunamadı"})
            _, _, kdata = files[0]
            if not (100 < len(kdata) <= 900 * 1024) or not webp_mi(kdata):
                return self._json(400, {"error": "Küçük kopya geçersiz (WebP bekleniyor)"})
            kucuk_fn = os.path.splitext(row["filename"])[0] + "_k.webp"
            with open(os.path.join(UPLOAD_DIR, kucuk_fn), "wb") as f:
                f.write(kdata)
            db().execute("UPDATE photos SET thumb=? WHERE id=?", (kucuk_fn, pid))
            db().commit()
            return self._json(200, {"ok": True, "boyut": len(kdata)})

        if p == "/api/offer":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            d = jbody()
            act = d.get("action")
            if act not in ("kabul", "red"):
                return self._json(400, {"error": "Geçersiz işlem"})
            row = db().execute("SELECT o.*, j.sensitive FROM job_offers o JOIN jobs j ON j.id=o.job_id WHERE o.id=? AND o.user_id=?",
                               (int(d.get("id") or 0), uid)).fetchone()
            if not row: return self._json(404, {"error": "Teklif bulunamadı"})
            if act == "kabul" and (row["sensitive"] or "0") == "1" and not d.get("consent"):
                return self._json(400, {"error": "Bu özel proje için ek muvafakat onayı gerekli — kutucuğu işaretleyin"})
            cat = now() if (act == "kabul" and (row["sensitive"] or "0") == "1") else None
            db().execute("UPDATE job_offers SET status=?, updated=?, consent_at=COALESCE(?,consent_at) WHERE id=?",
                         (act, now(), cat, row["id"]))
            audit("uye", "teklif-" + act, uid, f"teklif #{row['id']}" + (" + ek muvafakat" if cat else ""))
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/sos":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            d = jbody()
            user = db().execute("SELECT fullname, phone FROM users WHERE id=?", (uid,)).fetchone()
            loc = "{},{}".format(d.get("lat"), d.get("lng")) if d.get("lat") else "konum alinamadi"
            payload = {"uye": user["fullname"], "tel": user["phone"], "konum": loc,
                       "harita": "https://maps.google.com/?q=" + loc if d.get("lat") else "",
                       "mesaj": str(d.get("msg") or "")[:300]}
            db().execute("INSERT INTO submissions(kind,data,created) VALUES('SOS',?,?)",
                         (json.dumps(payload, ensure_ascii=False), now()))
            audit("uye", "SOS-ALARM", uid, loc)
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/checkin":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            d = jbody()
            row = db().execute("SELECT * FROM job_offers WHERE id=? AND user_id=? AND status='kabul'",
                               (int(d.get("id") or 0), uid)).fetchone()
            if not row: return self._json(404, {"error": "Kabul edilmiş teklif bulunamadı"})
            loc = "{},{}".format(d.get("lat"), d.get("lng")) if d.get("lat") else ""
            if d.get("type") == "out":
                db().execute("UPDATE job_offers SET checkout_at=?, checkout_loc=? WHERE id=?", (now(), loc, row["id"]))
                audit("uye", "check-out", uid, "teklif #{} {}".format(row["id"], loc))
            else:
                db().execute("UPDATE job_offers SET checkin_at=?, checkin_loc=? WHERE id=?", (now(), loc, row["id"]))
                audit("uye", "check-in", uid, "teklif #{} {}".format(row["id"], loc))
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/offer-feedback":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            d = jbody()
            rating = str(d.get("rating") or "")
            if rating not in ("1", "2", "3", "4", "5"):
                return self._json(400, {"error": "Puan 1-5 olmalı"})
            row = db().execute("SELECT id FROM job_offers WHERE id=? AND user_id=?",
                               (int(d.get("id") or 0), uid)).fetchone()
            if not row: return self._json(404, {"error": "Teklif bulunamadı"})
            db().execute("UPDATE job_offers SET feedback_rating=?, feedback_note=? WHERE id=?",
                         (rating, str(d.get("note") or "")[:500], row["id"]))
            audit("uye", "set-degerlendirme", uid, "teklif #{}: {}/5".format(row["id"], rating))
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/submit":
            d = jbody()
            kind = str(d.get("kind") or "genel")[:40]
            db().execute("INSERT INTO submissions(kind,data,created) VALUES(?,?,?)",
                         (kind, json.dumps(d.get("data") or {}, ensure_ascii=False)[:8000], now()))
            db().commit()
            return self._json(200, {"ok": True})

        # ---- Yönetici uçları ----
        if p == "/api/admin/login":
            d = jbody()
            uname = (d.get("username") or "admin").strip().lower()
            u = db().execute("SELECT * FROM admin_users WHERE username=?", (uname,)).fetchone()
            if not u or hash_pw(d.get("password") or "", u["salt"]) != u["pass_hash"]:
                audit("admin:" + uname, "giris-hatali", None, "yanlış şifre denemesi")
                db().commit()
                return self._json(401, {"error": "Kullanıcı adı veya şifre hatalı"})
            if u["totp_on"]:
                if not d.get("code"):
                    return self._json(401, {"need_totp": True, "error": "Doğrulama kodu gerekli"})
                if not totp_ok(u["totp_secret"], d.get("code")):
                    audit("admin:" + uname, "giris-hatali", None, "yanlış 2FA kodu")
                    db().commit()
                    return self._json(401, {"need_totp": True, "error": "Doğrulama kodu hatalı"})
            tok = secrets.token_urlsafe(32)
            exp = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(timespec="seconds")
            db().execute("INSERT INTO admin_sessions(token,username,expires,ip,ua,created) VALUES(?,?,?,?,?,?)",
                         (tok, uname, exp, self._ip(), (self.headers.get("User-Agent") or "")[:200], now()))
            audit("admin:" + uname, "giris", None, "yönetici girişi")
            db().commit()
            return self._json(200, {"ok": True, "username": uname, "role": u["role"] or "admin"},
                cookie=f"mowadm={tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200")

        if p == "/api/admin/logout":
            tok = self._admin_token()
            if tok:
                db().execute("DELETE FROM admin_sessions WHERE token=?", (tok,)); db().commit()
            return self._json(200, {"ok": True},
                cookie="mowadm=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")

        if p == "/api/admin/password":
            adm = self._admin(qs)
            if not adm: return self._json(403, {"error": "Yetki yok"})
            d = jbody()
            hedef = adm["username"] if adm["username"] != "yedek-anahtar" else "admin"
            master = adm["username"] == "yedek-anahtar"
            u = db().execute("SELECT * FROM admin_users WHERE username=?", (hedef,)).fetchone()
            if not master and (not u or hash_pw(d.get("old") or "", u["salt"]) != u["pass_hash"]):
                return self._json(401, {"error": "Mevcut şifre hatalı"})
            new = d.get("new") or ""
            if len(new) < 8:
                return self._json(400, {"error": "Yeni şifre en az 8 karakter olmalı"})
            salt = secrets.token_hex(16)
            db().execute("UPDATE admin_users SET pass_hash=?, salt=? WHERE username=?",
                         (hash_pw(new, salt), salt, hedef))
            audit("admin:" + adm["username"], "sifre-degisti", None, hedef)
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/totp":
            adm = self._admin(qs)
            if not adm or adm["username"] == "yedek-anahtar":
                return self._json(403, {"error": "Yetki yok"})
            d = jbody(); act = d.get("action")
            u = db().execute("SELECT * FROM admin_users WHERE username=?", (adm["username"],)).fetchone()
            if act == "setup":
                secret = base64.b32encode(secrets.token_bytes(10)).decode().rstrip("=")
                db().execute("UPDATE admin_users SET totp_secret=?, totp_on=0 WHERE username=?",
                             (secret, adm["username"])); db().commit()
                uri = f"otpauth://totp/ModelOfWorld:{adm['username']}?secret={secret}&issuer=Model%20of%20World"
                return self._json(200, {"ok": True, "secret": secret, "uri": uri})
            if act == "enable":
                if not u["totp_secret"] or not totp_ok(u["totp_secret"], d.get("code")):
                    return self._json(400, {"error": "Kod doğrulanamadı — uygulamadaki 6 haneli kodu girin"})
                db().execute("UPDATE admin_users SET totp_on=1 WHERE username=?", (adm["username"],))
                audit("admin:" + adm["username"], "2fa-acildi", None, "")
                db().commit()
                return self._json(200, {"ok": True})
            if act == "disable":
                if u["totp_on"] and not totp_ok(u["totp_secret"], d.get("code")):
                    return self._json(400, {"error": "Kapatmak için geçerli kod gerekli"})
                db().execute("UPDATE admin_users SET totp_on=0, totp_secret=NULL WHERE username=?", (adm["username"],))
                audit("admin:" + adm["username"], "2fa-kapatildi", None, "")
                db().commit()
                return self._json(200, {"ok": True})
            return self._json(400, {"error": "Geçersiz işlem"})

        if p == "/api/admin/user":
            adm = self._admin(qs)
            if not self._can(adm, "users"): return self._json(403, {"error": "Bu işlem için Yönetici rolü gerekli"})
            d = jbody(); act = d.get("action")
            uname = (d.get("username") or "").strip().lower()
            if not re.match(r"^[a-z0-9_\.]{3,30}$", uname):
                return self._json(400, {"error": "Kullanıcı adı 3-30 karakter, harf/rakam olmalı"})
            if act == "add":
                if db().execute("SELECT 1 FROM admin_users WHERE username=?", (uname,)).fetchone():
                    return self._json(409, {"error": "Bu kullanıcı adı zaten var"})
                pw = d.get("password") or ""
                if len(pw) < 8: return self._json(400, {"error": "Şifre en az 8 karakter"})
                role = d.get("role") if d.get("role") in ROLE_PERMS else "editor"
                salt = secrets.token_hex(16)
                db().execute("INSERT INTO admin_users(username,pass_hash,salt,role,created) VALUES(?,?,?,?,?)",
                             (uname, hash_pw(pw, salt), salt, role, now()))
                audit("admin:" + adm["username"], "yetkili-eklendi", None, f"{uname} ({role})")
            elif act == "delete":
                if uname == "admin": return self._json(400, {"error": "Ana yönetici silinemez"})
                db().execute("DELETE FROM admin_users WHERE username=?", (uname,))
                db().execute("DELETE FROM admin_sessions WHERE username=?", (uname,))
                audit("admin:" + adm["username"], "yetkili-silindi", None, uname)
            elif act == "role":
                role = d.get("role") if d.get("role") in ROLE_PERMS else None
                if not role: return self._json(400, {"error": "Geçersiz rol"})
                if uname == "admin": return self._json(400, {"error": "Ana yöneticinin rolü değiştirilemez"})
                db().execute("UPDATE admin_users SET role=? WHERE username=?", (role, uname))
                audit("admin:" + adm["username"], "rol-degisti", None, f"{uname} → {role}")
            elif act == "resetpw":
                pw = d.get("password") or ""
                if len(pw) < 8: return self._json(400, {"error": "Şifre en az 8 karakter"})
                salt = secrets.token_hex(16)
                db().execute("UPDATE admin_users SET pass_hash=?, salt=?, totp_on=0, totp_secret=NULL WHERE username=?",
                             (hash_pw(pw, salt), salt, uname))
                db().execute("DELETE FROM admin_sessions WHERE username=?", (uname,))
                audit("admin:" + adm["username"], "yetkili-sifre-sifirlandi", None, uname)
            else:
                return self._json(400, {"error": "Geçersiz işlem"})
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/task":
            adm = self._admin(qs)
            if not self._can(adm, "review"): return self._json(403, {"error": "Yetkiniz yok"})
            d = jbody(); act = d.get("action")
            if act == "add":
                title = str(d.get("title") or "").strip()
                if not title: return self._json(400, {"error": "Görev başlığı gerekli"})
                db().execute("INSERT INTO tasks(title,note,assigned_to,created_by,status,user_ref,created) VALUES(?,?,?,?,?,?,?)",
                    (title[:200], str(d.get("note") or "")[:500], str(d.get("assigned_to") or "")[:40],
                     adm["username"], "acik", int(d.get("user_ref") or 0) or None, now()))
                audit("admin:" + adm["username"], "gorev-eklendi", None, title[:60])
            else:
                tid = int(d.get("id") or 0)
                if act == "done":
                    db().execute("UPDATE tasks SET status='tamam', updated=? WHERE id=?", (now(), tid))
                elif act == "reopen":
                    db().execute("UPDATE tasks SET status='acik', updated=? WHERE id=?", (now(), tid))
                elif act == "delete":
                    db().execute("DELETE FROM tasks WHERE id=?", (tid,))
                else:
                    return self._json(400, {"error": "Geçersiz işlem"})
                audit("admin:" + adm["username"], "gorev-" + act, None, f"#{tid}")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/maintenance":
            adm = self._admin(qs)
            if not self._can(adm, "users"): return self._json(403, {"error": "Yönetici rolü gerekli"})
            d = jbody()
            v = "1" if d.get("on") else "0"
            db().execute("INSERT INTO settings(k,v) VALUES('maintenance',?) ON CONFLICT(k) DO UPDATE SET v=?", (v, v))
            audit("admin:" + adm["username"], "bakim-modu", None, "açıldı" if v == "1" else "kapatıldı")
            db().commit()
            return self._json(200, {"ok": True, "maintenance": v == "1"})

        if p == "/api/admin/templates":
            adm = self._admin(qs)
            if not self._can(adm, "review"): return self._json(403, {"error": "Yetkiniz yok"})
            d = jbody()
            lst = [str(x)[:250] for x in (d.get("list") or []) if str(x).strip()][:20]
            db().execute("INSERT INTO settings(k,v) VALUES('red_templates',?) ON CONFLICT(k) DO UPDATE SET v=?",
                         (json.dumps(lst, ensure_ascii=False), json.dumps(lst, ensure_ascii=False)))
            audit("admin:" + adm["username"], "sablon-guncellendi", None, f"{len(lst)} şablon")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/revoke":
            adm = self._admin(qs)
            if not adm: return self._json(403, {"error": "Yetki yok"})
            d = jbody()
            tok = str(d.get("token") or "")
            row = db().execute("SELECT username FROM admin_sessions WHERE token=?", (tok,)).fetchone()
            if not row: return self._json(404, {"error": "Oturum bulunamadı"})
            if row["username"] != adm["username"] and not self._can(adm, "sessions"):
                return self._json(403, {"error": "Başka oturumu sonlandırmak için Yönetici rolü gerekli"})
            db().execute("DELETE FROM admin_sessions WHERE token=?", (tok,))
            audit("admin:" + adm["username"], "oturum-sonlandirildi", None, row["username"])
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/update":
            adm = self._admin(qs)
            if not self._can(adm, "update"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            uid = int(d.get("user_id") or 0)
            if not db().execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                return self._json(404, {"error": "Üye bulunamadı"})
            if "fullname" in d or "phone" in d:
                db().execute("UPDATE users SET fullname=COALESCE(?,fullname), phone=COALESCE(?,phone) WHERE id=?",
                             (d.get("fullname"), d.get("phone"), uid))
            sent = [c for c in PROFILE_COLS if c in d]
            if sent:
                sets = ", ".join(f"{c}=?" for c in sent)
                vals = [str(d.get(c) or "")[:LONG_COLS.get(c, 500)] for c in sent] + [uid]
                db().execute(f"UPDATE profiles SET {sets} WHERE user_id=?", vals)
            audit("admin:" + adm["username"], "uye-duzenleme", uid, ", ".join((["fullname"] if "fullname" in d else []) + sent))
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/publish":
            adm = self._admin(qs)
            if not self._can(adm, "review"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            uid = int(d.get("user_id") or 0)
            pr = db().execute("SELECT status, privacy, published, featured FROM profiles WHERE user_id=?", (uid,)).fetchone()
            if not pr: return self._json(404, {"error": "Üye bulunamadı"})

            # Yönetici açıkça istediyse gizlilik tercihini de herkese açık yap
            if d.get("gizlilik_ac"):
                db().execute("UPDATE profiles SET privacy='public' WHERE user_id=?", (uid,))
                audit("admin:" + adm["username"], "gizlilik-herkese-acik", uid,
                      "yayına alma sırasında yönetici tarafından açıldı")
                pr = {**dict(pr), "privacy": "public"}

            if "published" in d:
                yayin = "1" if d.get("published") else "0"
                if yayin == "1" and (pr["status"] or "") != "onaylandi":
                    return self._json(400, {"error": "Siteye çıkarmak için üyeyi önce onaylamalısınız"})
                db().execute("UPDATE profiles SET published=? WHERE user_id=?", (yayin, uid))
                audit("admin:" + adm["username"], "yayin-" + ("acildi" if yayin == "1" else "kaldirildi"), uid, "")
                if yayin == "1" and (pr["privacy"] or "private") != "public":
                    db().commit()
                    return self._json(200, {"ok": True, "gizli": True, "uyari": "Üye profili 'özel' olduğu için herkese açık katalogda GÖRÜNMEYECEK; yalnızca VIP paylaşım linklerinde yer alır. Katalogda görünmesi için gizliliği herkese açık yapın."})

            if "featured" in d:
                one = "1" if d.get("featured") else "0"
                db().execute("UPDATE profiles SET featured=? WHERE user_id=?", (one, uid))
                audit("admin:" + adm["username"], "one-cikan-" + ("eklendi" if one == "1" else "kaldirildi"), uid, "")

            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/review":
            adm = self._admin(qs)
            if not self._can(adm, "review"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            uid = int(d.get("user_id") or 0)
            st = d.get("status")
            if st not in ("onaylandi", "reddedildi", "inceleniyor"):
                return self._json(400, {"error": "Geçersiz durum"})
            note = str(d.get("review_note") or "")[:1000]
            db().execute("UPDATE profiles SET status=?, review_note=? WHERE user_id=?", (st, note, uid))
            if st != "onaylandi":   # onay kalkarsa siteden de düşsün
                db().execute("UPDATE profiles SET published='0' WHERE user_id=?", (uid,))
            audit("admin:" + adm["username"], "durum-" + st, uid, note[:100])
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/note":
            adm = self._admin(qs)
            if not self._can(adm, "note"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            uid = int(d.get("user_id") or 0)
            rating = str(d.get("admin_rating") or "")
            if rating and rating not in ("1", "2", "3", "4", "5"):
                return self._json(400, {"error": "Puan 1-5 olmalı"})
            db().execute("UPDATE profiles SET admin_note=?, admin_rating=?, admin_tags=? WHERE user_id=?",
                         (str(d.get("admin_note") or "")[:2000], rating,
                          str(d.get("admin_tags") or "")[:400], uid))
            audit("admin:" + adm["username"], "ic-not", uid, "not/puan/etiket güncellendi")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/submission":
            # Gelen form kayıtları: düzenle / sil / üyeliğe dönüştür
            adm = self._admin(qs)
            if not self._can(adm, "review"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            sid = int(d.get("id") or 0)
            act = d.get("action")
            row = db().execute("SELECT * FROM submissions WHERE id=?", (sid,)).fetchone()
            if not row: return self._json(404, {"error": "Kayıt bulunamadı"})
            try: veri = json.loads(row["data"] or "{}")
            except Exception: veri = {}

            if act == "delete":
                db().execute("DELETE FROM submissions WHERE id=?", (sid,))
                audit("admin:" + adm["username"], "form-silindi", None,
                      "%s · %s" % (row["kind"], str(veri.get("fullname") or veri.get("uye") or "")[:60]))
                db().commit()
                return self._json(200, {"ok": True})

            if act == "done":
                # Mesaj/iletişim kayıtları üyeye dönüştürülmez; yalnızca "yanıtlandı" işaretlenir
                yeni_durum = "0" if (row["processed"] or "0") == "1" else "1"
                db().execute("UPDATE submissions SET processed=? WHERE id=?", (yeni_durum, sid))
                audit("admin:" + adm["username"], "form-isaretlendi", None,
                      "%s #%d · %s" % (row["kind"], sid, "yanıtlandı" if yeni_durum == "1" else "yeniden açıldı"))
                db().commit()
                return self._json(200, {"ok": True, "processed": yeni_durum})

            if act == "update":
                yeni = d.get("data")
                if not isinstance(yeni, dict): return self._json(400, {"error": "Geçersiz veri"})
                db().execute("UPDATE submissions SET data=? WHERE id=?",
                             (json.dumps(yeni, ensure_ascii=False)[:8000], sid))
                audit("admin:" + adm["username"], "form-duzenlendi", None, "%s #%d" % (row["kind"], sid))
                db().commit()
                return self._json(200, {"ok": True})

            if act == "convert":
                if (row["processed"] or "0") == "1" and row["user_id"]:
                    return self._json(409, {"error": "Bu form zaten üye #%d olarak oluşturuldu" % row["user_id"]})
                email = str(veri.get("email") or "").strip().lower()
                adsoyad = str(veri.get("fullname") or "").strip()
                if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                    return self._json(400, {"error": "Formda geçerli bir e-posta yok — önce Düzenle ile ekleyin"})
                if len(adsoyad.split()) < 2:
                    return self._json(400, {"error": "Formda ad soyad eksik — önce Düzenle ile tamamlayın"})
                eski = db().execute("SELECT COALESCE(deleted,'') d FROM users WHERE email=?", (email,)).fetchone()
                if eski and eski["d"]:
                    return self._json(409, {"error": "Bu e-posta çöp kutusundaki bir üyeye ait — "
                                                     "Silinenler sekmesinden geri alın veya kalıcı silin"})
                if eski:
                    return self._json(409, {"error": "Bu e-posta zaten üye — mükerrer kayıt oluşturulmadı"})

                dogum = str(veri.get("birthdate") or "").strip()
                yas = _sayi(veri.get("age"))
                if not yas and re.match(r"^\d{4}-\d{2}-\d{2}$", dogum):
                    bugun = datetime.now(timezone.utc).date()
                    d0 = datetime.strptime(dogum, "%Y-%m-%d").date()
                    yas = bugun.year - d0.year - ((bugun.month, bugun.day) < (d0.month, d0.day))
                kats = [c for c in str(veri.get("category") or "").split(",") if c.strip() in CATEGORY_KEYS] or ["model"]
                resit_degil = bool(yas) and yas < 18
                if resit_degil:
                    kats = [c for c in kats if c != "nu"] or ["model"]

                gecici = secrets.token_urlsafe(9)
                salt = secrets.token_hex(16)
                cur = db().execute(
                    "INSERT INTO users(email,pass_hash,salt,fullname,phone,created) VALUES(?,?,?,?,?,?)",
                    (email, hash_pw(gecici, salt), salt, adsoyad[:120],
                     str(veri.get("phone") or "").strip()[:30], now()))
                uid = cur.lastrowid
                notlar = " · ".join(x for x in [
                    "Gelen formdan aktarıldı (#%d)" % sid,
                    "Deneyim: %s" % veri.get("experience") if veri.get("experience") else "",
                    "18 yaş altı — veli bilgisi ve muvafakatname gerekli" if resit_degil else "",
                ] if x)
                db().execute(
                    "INSERT INTO profiles(user_id, status, privacy, published, category, gender, birthdate, age, city,"
                    " height, weight, size, shoe, languages, instagram, about, tattoo_info, skills,"
                    " consent_kvkk, admin_note) "
                    "VALUES(?, 'inceleniyor', 'public', '0', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (uid, ",".join(kats), str(veri.get("gender") or ""), dogum, str(yas or ""),
                     str(veri.get("city") or "")[:40], str(_sayi(veri.get("height")) or ""),
                     str(_sayi(veri.get("weight")) or ""), str(veri.get("size") or "")[:20],
                     str(_sayi(veri.get("shoe")) or ""), str(veri.get("languages") or "")[:200],
                     str(veri.get("instagram") or "")[:60], str(veri.get("about") or "")[:1500],
                     str(veri.get("tattoo") or "")[:200],
                     json.dumps({"list": [], "text": str(veri.get("skills") or "")[:300]}, ensure_ascii=False),
                     "1" if str(veri.get("kvkk") or "") in ("on", "1", "true") else "0", notlar[:2000]))
                db().execute("UPDATE submissions SET user_id=?, processed='1' WHERE id=?", (uid, sid))
                audit("admin:" + adm["username"], "form-uyeye-donusturuldu", uid, "%s <%s>" % (adsoyad, email))
                db().commit()
                return self._json(200, {"ok": True, "user_id": uid, "gecici_sifre": gecici,
                                        "uyari": "18 yaş altı — veli bilgisi gerekli" if resit_degil else ""})

            return self._json(400, {"error": "Geçersiz işlem"})

        if p == "/api/admin/delete":
            # Üyeyi kalıcı olarak siler: hesap, profil, fotoğraf/belge dosyaları, iş teklifleri, oturumlar.
            # Tek üye için user_id, toplu silme için user_ids listesi gönderilir.
            # Yalnızca "users" yetkisi olan rol (admin) silebilir; denetim günlüğüne kim/ne bilgisi yazılır.
            adm = self._admin(qs)
            if not self._can(adm, "users"):
                return self._json(403, {"error": "Üye silme yetkisi yalnızca yöneticide (admin) vardır"})
            d = jbody()
            hedefler = [int(x) for x in (d.get("user_ids") or []) if str(x).strip().isdigit()]
            if not hedefler and d.get("user_id"):
                hedefler = [int(d["user_id"])]
            if not hedefler:
                return self._json(400, {"error": "Silinecek üye seçilmedi"})
            if len(hedefler) > 200:
                return self._json(400, {"error": "Tek seferde en fazla 200 üye silinebilir"})

            # Üç kip: çöp kutusuna taşı (varsayılan) · geri al · kalıcı sil
            kalici = bool(d.get("kalici"))
            geri_al = bool(d.get("geri_al"))
            silinen_dosya, islenen, bulunamayan = 0, [], []
            for uid in hedefler:
                row = db().execute("SELECT email, fullname, COALESCE(deleted,'') deleted"
                                   " FROM users WHERE id=?", (uid,)).fetchone()
                if not row:
                    bulunamayan.append(uid)
                    continue
                kim = "%s <%s>" % (row["fullname"] or "?", row["email"])
                if geri_al:
                    db().execute("UPDATE users SET deleted=NULL WHERE id=?", (uid,))
                    audit("admin:" + adm["username"], "uye-geri-al", uid, kim)
                elif kalici:
                    for m in db().execute("SELECT filename FROM photos WHERE user_id=?", (uid,)).fetchall():
                        try:
                            os.remove(os.path.join(UPLOAD_DIR, m["filename"]))
                            silinen_dosya += 1
                        except OSError:
                            pass   # dosya zaten yok — kaydı silmeye devam
                    db().execute("DELETE FROM photos WHERE user_id=?", (uid,))
                    db().execute("DELETE FROM job_offers WHERE user_id=?", (uid,))
                    db().execute("DELETE FROM sessions WHERE user_id=?", (uid,))
                    db().execute("DELETE FROM profiles WHERE user_id=?", (uid,))
                    db().execute("DELETE FROM users WHERE id=?", (uid,))
                    audit("admin:" + adm["username"], "uye-kalici-sil", uid, kim)
                else:
                    if row["deleted"]:
                        bulunamayan.append(uid)   # zaten çöp kutusunda
                        continue
                    # Çöp kutusu: kayıt ve dosyalar durur, üye siteden/listelerden kalkar
                    db().execute("UPDATE users SET deleted=? WHERE id=?", (now(), uid))
                    db().execute("UPDATE profiles SET published='0', featured='0' WHERE user_id=?", (uid,))
                    db().execute("DELETE FROM sessions WHERE user_id=?", (uid,))
                    audit("admin:" + adm["username"], "uye-cop-kutusu", uid, kim)
                islenen.append(kim)
            if len(islenen) > 1:
                audit("admin:" + adm["username"],
                      "uye-geri-al-toplu" if geri_al else ("uye-kalici-sil-toplu" if kalici else "uye-cop-kutusu-toplu"),
                      None, "%d üye: %s" % (len(islenen), "; ".join(islenen)[:400]))
            db().commit()
            if not islenen:
                return self._json(404, {"error": "Üye bulunamadı (zaten işlenmiş olabilir)"})
            return self._json(200, {"ok": True, "dosya": silinen_dosya,
                                    "silinen": len(islenen), "bulunamayan": bulunamayan})

        if p == "/api/admin/job":
            adm = self._admin(qs)
            if not self._can(adm, "job"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            title = str(d.get("title") or "").strip()
            if not title: return self._json(400, {"error": "İş başlığı gerekli"})
            ids = [int(x) for x in (d.get("user_ids") or []) if str(x).isdigit()]
            if not ids: return self._json(400, {"error": "En az bir üye seçin"})
            cur = db().execute("INSERT INTO jobs(title,date,location,hours,fee,note,created,sensitive,usage) VALUES(?,?,?,?,?,?,?,?,?)",
                (title[:200], str(d.get("date") or "")[:40], str(d.get("location") or "")[:200],
                 str(d.get("hours") or "")[:100], str(d.get("fee") or "")[:100],
                 str(d.get("note") or "")[:1000], now(),
                 "1" if d.get("sensitive") else "0", str(d.get("usage") or "")[:500]))
            for uid in ids:
                db().execute("INSERT INTO job_offers(job_id,user_id,created) VALUES(?,?,?)",
                             (cur.lastrowid, uid, now()))
            audit("admin:" + adm["username"], "is-teklifi", None, f"{title[:60]} → {len(ids)} üye")
            db().commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid})

        if p == "/api/admin/share":
            adm = self._admin(qs)
            if not self._can(adm, "share"): return self._json(403, {"error": "Bu işlem için yetkiniz yok"})
            d = jbody()
            ids = [str(int(x)) for x in (d.get("user_ids") or []) if str(x).isdigit()]
            if not ids: return self._json(400, {"error": "En az bir üye seçin"})
            hours = min(max(int(d.get("hours") or 24), 1), 168)
            tok = secrets.token_urlsafe(16)
            exp = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(timespec="seconds")
            db().execute("INSERT INTO shares(token,user_ids,allow_sensitive,expires,created) VALUES(?,?,?,?,?)",
                         (tok, ",".join(ids), 1 if d.get("allow_sensitive") else 0, exp, now()))
            audit("admin:" + adm["username"], "vip-paylasim", None, "{} üye, {} saat".format(len(ids), hours))
            db().commit()
            return self._json(200, {"ok": True, "token": tok, "hours": hours})

        if p == "/api/share/like":
            d = jbody()
            tok = str(d.get("token") or "")
            uid = int(d.get("user_id") or 0)
            liked = bool(d.get("liked"))
            sh = db().execute("SELECT * FROM shares WHERE token=?", (tok,)).fetchone()
            if not sh or sh["expires"] < now():
                return self._json(404, {"error": "Süresi dolmuş veya geçersiz"})
            likes = []
            try: likes = json.loads(sh["client_likes"]) if sh["client_likes"] else []
            except Exception: pass
            if liked:
                if uid not in likes: likes.append(uid)
            else:
                if uid in likes: likes.remove(uid)
            db().execute("UPDATE shares SET client_likes=? WHERE token=?", (json.dumps(likes), tok))
            audit("vip-klient", "begeni-guncelleme", uid, f"tok:{tok[:8]} liked:{liked}")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/payment":
            adm = self._admin(qs)
            if not self._can(adm, "finance"): return self._json(403, {"error": "Finans yetkiniz yok"})
            d = jbody()
            offer_id = int(d.get("offer_id") or 0)
            status = str(d.get("status") or "odenecek")
            if status not in ("odenecek", "odendi"): return self._json(400, {"error": "Geçersiz durum"})
            db().execute("UPDATE job_offers SET payment_status=?, updated=? WHERE id=?", (status, now(), offer_id))
            audit("admin:" + adm["username"], "odeme-durumu-guncellendi", None, f"teklif:{offer_id} → {status}")
            db().commit()
            return self._json(200, {"ok": True})

        return self._json(404, {"error": "Bilinmeyen uç"})

    # ---------------- DELETE ----------------
    def do_DELETE(self):
        _local.ip = self._ip()
        return self._safe(self._delete)

    def _delete(self):
        m = re.match(r"^/api/photo/(\d+)$", urlparse(self.path).path)
        if not m: return self._json(404, {"error": "Bilinmeyen uç"})
        uid = self._session_user()
        if not uid: return self._json(401, {"error": "Oturum yok"})
        row = db().execute("SELECT * FROM photos WHERE id=? AND user_id=? AND deleted=0",
                           (int(m.group(1)), uid)).fetchone()
        if not row: return self._json(404, {"error": "Yok"})
        # Yumuşak silme: dosya arşivde kalır, yalnızca üyeden gizlenir (madde: medya arşivi)
        db().execute("UPDATE photos SET deleted=1 WHERE id=?", (row["id"],))
        audit("uye", "medya-arsiv", uid, row["orig"][:60])
        db().commit()
        return self._json(200, {"ok": True})

if __name__ == "__main__":
    # Canlıda 8010; testlerde MOW_PORT ile başka bir port verilebilir
    PORT = int(os.environ.get("MOW_PORT", "8010"))
    print(f"MOW API v3 127.0.0.1:{PORT} — veri: {DATA_DIR}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
