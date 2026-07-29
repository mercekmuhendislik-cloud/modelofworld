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
import json, os, re, sqlite3, secrets, hashlib, mimetypes, threading
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
    "category", "gender", "birthdate", "city",
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
    """)
    for col in PROFILE_COLS + ADMIN_COLS + READONLY_COLS:
        try: c.execute(f"ALTER TABLE profiles ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError: pass
    for col, ddl in [("kind", "TEXT DEFAULT 'photo'"), ("album", "TEXT DEFAULT 'genel'"),
                     ("deleted", "INTEGER DEFAULT 0")]:
        try: c.execute(f"ALTER TABLE photos ADD COLUMN {col} {ddl}")
        except sqlite3.OperationalError: pass
    for col in ["sensitive", "usage"]:
        try: c.execute(f"ALTER TABLE jobs ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError: pass
    for col in ["consent_at", "checkin_at", "checkin_loc", "checkout_at", "checkout_loc",
                "feedback_rating", "feedback_note"]:
        try: c.execute(f"ALTER TABLE job_offers ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError: pass
    # Yönetici şifresi ilk kurulumda mevcut anahtara eşitlenir (sonra panelden değiştirilir)
    if not c.execute("SELECT 1 FROM settings WHERE k='admin_salt'").fetchone():
        salt = secrets.token_hex(16)
        c.execute("INSERT INTO settings(k,v) VALUES('admin_salt',?)", (salt,))
        c.execute("INSERT INTO settings(k,v) VALUES('admin_hash',?)",
                  (hashlib.pbkdf2_hmac("sha256", ADMIN_KEY.encode(), bytes.fromhex(salt), 200_000).hex(),))
    c.commit(); c.close()
init_db()

def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()

def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")

def audit(who, action, user_id=None, detail=""):
    db().execute("INSERT INTO audit(who,action,user_id,detail,created) VALUES(?,?,?,?,?)",
                 (who, action, user_id, str(detail)[:400], now()))

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

def is_minor(uid):
    """18 yas alti veya cocuk kategorisi - sanatsal/nu icerik sistemsel olarak kapali."""
    row = db().execute("SELECT birthdate, category FROM profiles WHERE user_id=?", (uid,)).fetchone()
    if not row: return False
    if (row["category"] or "") == "cocuk": return True
    b = row["birthdate"] or ""
    try:
        bd = datetime.fromisoformat(b)
        return (datetime.now() - bd).days / 365.25 < 18
    except Exception:
        return False

def offers_of(uid):
    rows = db().execute("""SELECT o.id, o.status, o.updated, o.consent_at,
        o.checkin_at, o.checkout_at, o.feedback_rating,
        j.title, j.date, j.location, j.hours, j.fee, j.note, j.sensitive, j.usage
        FROM job_offers o JOIN jobs j ON j.id=o.job_id
        WHERE o.user_id=? ORDER BY o.id DESC""", (uid,)).fetchall()
    return [dict(r) for r in rows]

class Handler(BaseHTTPRequestHandler):
    server_version = "MOW/3.1"

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
        return row["user_id"]

    def _make_session(self, uid):
        tok = secrets.token_urlsafe(32)
        exp = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        db().execute("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)", (tok, uid, exp))
        db().commit()
        return f"mow={tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_DAYS*86400}"

    def _admin_session(self):
        raw = self.headers.get("Cookie") or ""
        m = re.search(r'mowadm=([A-Za-z0-9_\-]+)', raw)
        if not m: return False
        row = db().execute("SELECT expires FROM sessions WHERE token=? AND user_id=-1", (m.group(1),)).fetchone()
        return bool(row and row["expires"] >= now())

    def _is_admin(self, qs):
        return (qs.get("key", [""])[0] == ADMIN_KEY) or self._admin_session()

    def _check_admin_pw(self, pw):
        salt = db().execute("SELECT v FROM settings WHERE k='admin_salt'").fetchone()["v"]
        h = db().execute("SELECT v FROM settings WHERE k='admin_hash'").fetchone()["v"]
        return hash_pw(pw or "", salt) == h

    def log_message(self, fmt, *args):
        pass

    # ---------------- GET ----------------
    def do_GET(self):
        u = urlparse(self.path); qs = parse_qs(u.query); p = u.path

        if p == "/api/health":
            return self._json(200, {"ok": True, "v": 4})

        if p == "/api/me":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            user = db().execute("SELECT id,email,fullname,phone FROM users WHERE id=?", (uid,)).fetchone()
            prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
            prof = dict(prof) if prof else {}
            for c in ADMIN_COLS: prof.pop(c, None)   # iç notlar üyeye sızmaz
            media = db().execute(
                "SELECT id,kind,album,orig,created FROM photos WHERE user_id=? AND deleted=0 ORDER BY id",
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
            fp = os.path.join(UPLOAD_DIR, row["filename"])
            if not os.path.exists(fp): return self._json(404, {"error": "Dosya yok"})
            ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
            data = open(fp, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "private, max-age=3600")
            self.end_headers()
            self.wfile.write(data)
            return

        m = re.match(r"^/api/share/([A-Za-z0-9_\-]+)$", p)
        if m:
            sh = db().execute("SELECT * FROM shares WHERE token=?", (m.group(1),)).fetchone()
            if not sh or sh["expires"] < now():
                return self._json(404, {"error": "Bu bağlantının süresi dolmuş"})
            out = []
            for uid_s in (sh["user_ids"] or "").split(","):
                if not uid_s.isdigit(): continue
                uid = int(uid_s)
                user = db().execute("SELECT fullname FROM users WHERE id=?", (uid,)).fetchone()
                prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
                if not user or not prof: continue
                pr = dict(prof)
                pub = {k: pr.get(k) for k in ["category", "city", "height", "weight", "bust", "waist",
                       "hip", "shoe", "size", "hair", "eye", "skin", "languages"]}
                q = "SELECT id FROM photos WHERE user_id=? AND kind='photo' AND deleted=0"
                if not sh["allow_sensitive"]:
                    q += " AND album != 'sanatsal'"
                photos = [r["id"] for r in db().execute(q + " ORDER BY CASE album WHEN 'studio' THEN 0 WHEN 'podium' THEN 1 ELSE 2 END, id", (uid,))]
                out.append({"id": uid, "name": user["fullname"], "profile": pub, "photos": photos})
            return self._json(200, {"members": out, "expires": sh["expires"]})

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
            fp = os.path.join(UPLOAD_DIR, row["filename"])
            if not os.path.exists(fp): return self._json(404, {"error": "Dosya yok"})
            data = open(fp, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(fp)[0] or "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "private, max-age=600")
            self.end_headers()
            self.wfile.write(data)
            return

        if p == "/api/admin/list":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
            users = [dict(r) for r in db().execute(
                "SELECT id,email,fullname,phone,created FROM users ORDER BY id DESC")]
            for usr in users:
                prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (usr["id"],)).fetchone()
                usr["profile"] = dict(prof) if prof else {}
                usr["media"] = [dict(r) for r in db().execute(
                    "SELECT id,kind,album,orig,deleted,created FROM photos WHERE user_id=? ORDER BY id",
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
            shares = [dict(r) for r in db().execute("SELECT token, user_ids, allow_sensitive, expires FROM shares WHERE expires >= ? ORDER BY rowid DESC LIMIT 20", (now(),))]
            return self._json(200, {"users": users, "jobs": jobs, "submissions": subs, "audit": logs,
                                    "sos": sos, "shares": shares})

        return self._json(404, {"error": "Bilinmeyen uç"})

    # ---------------- POST ----------------
    def do_POST(self):
        u = urlparse(self.path); qs = parse_qs(u.query); p = u.path
        ctype = self.headers.get("Content-Type") or ""
        body = self._body()
        if body is None:
            return self._json(413, {"error": "Dosya çok büyük"})

        def jbody():
            try: return json.loads(body.decode("utf-8", "replace"))
            except Exception: return {}

        if p == "/api/register":
            d = jbody()
            email = (d.get("email") or "").strip().lower()
            pw = d.get("password") or ""
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                return self._json(400, {"error": "Geçerli bir e-posta girin"})
            if len(pw) < 6:
                return self._json(400, {"error": "Şifre en az 6 karakter olmalı"})
            if db().execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                return self._json(409, {"error": "Bu e-posta zaten kayıtlı — giriş yapın"})
            salt = secrets.token_hex(16)
            cur = db().execute(
                "INSERT INTO users(email,pass_hash,salt,fullname,phone,created) VALUES(?,?,?,?,?,?)",
                (email, hash_pw(pw, salt), salt, (d.get("fullname") or "").strip(),
                 (d.get("phone") or "").strip(), now()))
            db().execute("INSERT INTO profiles(user_id, status, privacy) VALUES(?, 'inceleniyor', 'private')",
                         (cur.lastrowid,))
            audit("uye", "kayit", cur.lastrowid, email)
            db().commit()
            return self._json(200, {"ok": True}, cookie=self._make_session(cur.lastrowid))

        if p == "/api/login":
            d = jbody()
            email = (d.get("email") or "").strip().lower()
            row = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if not row or hash_pw(d.get("password") or "", row["salt"]) != row["pass_hash"]:
                return self._json(401, {"error": "E-posta veya şifre hatalı"})
            return self._json(200, {"ok": True}, cookie=self._make_session(row["id"]))

        if p == "/api/logout":
            raw = self.headers.get("Cookie") or ""
            m = re.search(r'mow=([A-Za-z0-9_\-]+)', raw)
            if m:
                db().execute("DELETE FROM sessions WHERE token=?", (m.group(1),)); db().commit()
            return self._json(200, {"ok": True},
                cookie="mow=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")

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
            sent = [c for c in PROFILE_COLS if c in d]
            if sent:
                sets = ", ".join(f"{c}=?" for c in sent)
                vals = [str(d.get(c) or "")[:LONG_COLS.get(c, 500)] for c in sent] + [uid]
                db().execute(f"UPDATE profiles SET {sets} WHERE user_id=?", vals)
                audit("uye", "profil-guncelleme", uid, ", ".join(sent))
            if is_minor(uid):
                db().execute("UPDATE profiles SET shoot_prefs='standart' WHERE user_id=?", (uid,))
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
            if album == "sanatsal" and is_minor(uid):
                return self._json(403, {"error": "Bu albüm 18 yaş altı üyelere kapalıdır"})
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
            cur = db().execute(
                "INSERT INTO photos(user_id,filename,orig,created,kind,album,deleted) VALUES(?,?,?,?,?,?,0)",
                (uid, fn, orig[:200], now(), kind, album))
            audit("uye", "medya-yukleme", uid, f"{kind}/{album}: {orig[:60]}")
            db().commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid, "kind": kind, "album": album})

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
            if not self._check_admin_pw(d.get("password")):
                audit("admin", "giris-hatali", None, "yanlış şifre denemesi")
                db().commit()
                return self._json(401, {"error": "Şifre hatalı"})
            tok = secrets.token_urlsafe(32)
            exp = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(timespec="seconds")
            db().execute("INSERT INTO sessions(token,user_id,expires) VALUES(?,-1,?)", (tok, exp))
            audit("admin", "giris", None, "yönetici girişi")
            db().commit()
            return self._json(200, {"ok": True},
                cookie=f"mowadm={tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200")

        if p == "/api/admin/logout":
            raw = self.headers.get("Cookie") or ""
            m = re.search(r'mowadm=([A-Za-z0-9_\-]+)', raw)
            if m:
                db().execute("DELETE FROM sessions WHERE token=?", (m.group(1),)); db().commit()
            return self._json(200, {"ok": True},
                cookie="mowadm=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")

        if p == "/api/admin/password":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
            d = jbody()
            if not self._check_admin_pw(d.get("old")):
                return self._json(401, {"error": "Mevcut şifre hatalı"})
            new = d.get("new") or ""
            if len(new) < 8:
                return self._json(400, {"error": "Yeni şifre en az 8 karakter olmalı"})
            salt = secrets.token_hex(16)
            db().execute("UPDATE settings SET v=? WHERE k='admin_salt'", (salt,))
            db().execute("UPDATE settings SET v=? WHERE k='admin_hash'", (hash_pw(new, salt),))
            audit("admin", "sifre-degisti", None, "")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/update":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
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
            audit("admin", "uye-duzenleme", uid, ", ".join((["fullname"] if "fullname" in d else []) + sent))
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/review":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
            d = jbody()
            uid = int(d.get("user_id") or 0)
            st = d.get("status")
            if st not in ("onaylandi", "reddedildi", "inceleniyor"):
                return self._json(400, {"error": "Geçersiz durum"})
            note = str(d.get("review_note") or "")[:1000]
            db().execute("UPDATE profiles SET status=?, review_note=? WHERE user_id=?", (st, note, uid))
            audit("admin", "durum-" + st, uid, note[:100])
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/note":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
            d = jbody()
            uid = int(d.get("user_id") or 0)
            rating = str(d.get("admin_rating") or "")
            if rating and rating not in ("1", "2", "3", "4", "5"):
                return self._json(400, {"error": "Puan 1-5 olmalı"})
            db().execute("UPDATE profiles SET admin_note=?, admin_rating=?, admin_tags=? WHERE user_id=?",
                         (str(d.get("admin_note") or "")[:2000], rating,
                          str(d.get("admin_tags") or "")[:400], uid))
            audit("admin", "ic-not", uid, "not/puan/etiket güncellendi")
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/admin/job":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
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
            audit("admin", "is-teklifi", None, f"{title[:60]} → {len(ids)} üye")
            db().commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid})

        if p == "/api/admin/share":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
            d = jbody()
            ids = [str(int(x)) for x in (d.get("user_ids") or []) if str(x).isdigit()]
            if not ids: return self._json(400, {"error": "En az bir üye seçin"})
            hours = min(max(int(d.get("hours") or 24), 1), 168)
            tok = secrets.token_urlsafe(16)
            exp = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(timespec="seconds")
            db().execute("INSERT INTO shares(token,user_ids,allow_sensitive,expires,created) VALUES(?,?,?,?,?)",
                         (tok, ",".join(ids), 1 if d.get("allow_sensitive") else 0, exp, now()))
            audit("admin", "vip-paylasim", None, "{} üye, {} saat".format(len(ids), hours))
            db().commit()
            return self._json(200, {"ok": True, "token": tok, "hours": hours})

        return self._json(404, {"error": "Bilinmeyen uç"})

    # ---------------- DELETE ----------------
    def do_DELETE(self):
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
    print(f"MOW API v3 127.0.0.1:8010 — veri: {DATA_DIR}")
    ThreadingHTTPServer(("127.0.0.1", 8010), Handler).serve_forever()
