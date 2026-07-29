# -*- coding: utf-8 -*-
"""
VERA / modelofworld.com — Üyelik & Aday Paneli API'si  (v2)
Yalnızca Python standart kütüphanesi kullanır (pip gerekmez).
127.0.0.1:8010 dinler; dış dünyaya Caddy /api/* üzerinden açılır.

v2: ölçü kartı (+ten rengi), müsaitlik takvimi, banka/IBAN modülü,
veli izni (TC + muvafakatname), gizlilik tercihi, video/belge yükleme,
onboarding onay adımı. Eski veritabanı otomatik yükseltilir (migrate).

Veri dizini: MOW_DATA ortam değişkeni ya da varsayılan
C:\\inetpub\\modelofworld-data  (webroot DIŞINDA).
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

# Yükleme kuralları: tür -> (uzantılar, maks boyut, kişi başı adet)
UPLOAD_RULES = {
    "photo": ({".jpg", ".jpeg", ".png", ".webp", ".heic"}, 12 * 1024 * 1024, 12),
    "video": ({".mp4", ".mov", ".webm"}, 80 * 1024 * 1024, 3),
    "belge": ({".pdf", ".jpg", ".jpeg", ".png"}, 10 * 1024 * 1024, 3),
}
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

# Profil sütunları (hepsi metin — /api/profile bunları günceller)
PROFILE_COLS = [
    "category", "gender", "birthdate", "city",
    "height", "weight", "bust", "waist", "hip", "shoe", "size",
    "hair", "eye", "skin", "languages", "instagram", "about",
    "availability", "privacy",
    "iban", "bank_name", "account_name", "invoice_type", "tax_no",
    "parent_name", "parent_tc", "parent_phone",
    "consent_kvkk", "consent_contract",
]
LONG_COLS = {"availability": 6000, "about": 2000}

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
    """)
    # v2 geçişi: eksik sütunları ekle (mevcut kayıtlar korunur)
    for col in PROFILE_COLS + ["consent_at"]:
        try:
            c.execute(f"ALTER TABLE profiles ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass
    try:
        c.execute("ALTER TABLE photos ADD COLUMN kind TEXT DEFAULT 'photo'")
    except sqlite3.OperationalError:
        pass
    c.commit(); c.close()
init_db()

def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()

def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")

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

class Handler(BaseHTTPRequestHandler):
    server_version = "MOW/2.0"

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

    def _is_admin(self, qs):
        return (qs.get("key", [""])[0] == ADMIN_KEY)

    def log_message(self, fmt, *args):
        pass

    # ---------- GET ----------
    def do_GET(self):
        u = urlparse(self.path); qs = parse_qs(u.query); p = u.path

        if p == "/api/health":
            return self._json(200, {"ok": True, "v": 2})

        if p == "/api/me":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            user = db().execute("SELECT id,email,fullname,phone FROM users WHERE id=?", (uid,)).fetchone()
            prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
            media = db().execute("SELECT id,kind,orig FROM photos WHERE user_id=? ORDER BY id", (uid,)).fetchall()
            return self._json(200, {
                "user": dict(user) if user else None,
                "profile": dict(prof) if prof else {},
                "media": [dict(r) for r in media],
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

        if p == "/api/admin/list":
            if not self._is_admin(qs): return self._json(403, {"error": "Yetki yok"})
            users = [dict(r) for r in db().execute(
                "SELECT id,email,fullname,phone,created FROM users ORDER BY id DESC")]
            for usr in users:
                prof = db().execute("SELECT * FROM profiles WHERE user_id=?", (usr["id"],)).fetchone()
                usr["profile"] = dict(prof) if prof else {}
                usr["media"] = [dict(r) for r in db().execute(
                    "SELECT id,kind,orig FROM photos WHERE user_id=?", (usr["id"],))]
            subs = [dict(r) for r in db().execute(
                "SELECT * FROM submissions ORDER BY id DESC LIMIT 200")]
            return self._json(200, {"users": users, "submissions": subs})

        return self._json(404, {"error": "Bilinmeyen uç"})

    # ---------- POST ----------
    def do_POST(self):
        u = urlparse(self.path); p = u.path
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

            # Sunucu tarafı doğrulamalar
            iban = re.sub(r"\s", "", str(d.get("iban") or ""))
            if iban and not re.match(r"^TR\d{24}$", iban.upper()):
                return self._json(400, {"error": "IBAN geçersiz — TR ile başlayan 26 haneli numara girin"})
            d["iban"] = iban.upper()
            tc = str(d.get("parent_tc") or "").strip()
            if tc and not re.match(r"^\d{11}$", tc):
                return self._json(400, {"error": "Veli TC kimlik no 11 haneli olmalı"})

            # Yalnızca gönderilen alanları güncelle (kısmi kayıt — sekme başına kaydetme)
            sent = [c for c in PROFILE_COLS if c in d]
            if sent:
                sets = ", ".join(f"{c}=?" for c in sent)
                vals = [str(d.get(c) or "")[:LONG_COLS.get(c, 500)] for c in sent] + [uid]
                db().execute(f"UPDATE profiles SET {sets} WHERE user_id=?", vals)

            # Onay zamanı damgası
            prof = db().execute("SELECT consent_kvkk, consent_contract, consent_at FROM profiles WHERE user_id=?",
                                (uid,)).fetchone()
            if prof and prof["consent_kvkk"] == "1" and prof["consent_contract"] == "1" and not prof["consent_at"]:
                db().execute("UPDATE profiles SET consent_at=? WHERE user_id=?", (now(), uid))
            db().commit()
            return self._json(200, {"ok": True})

        if p == "/api/upload":
            uid = self._session_user()
            if not uid: return self._json(401, {"error": "Oturum yok"})
            fields, files = parse_multipart(body, ctype)
            if not files: return self._json(400, {"error": "Dosya bulunamadı"})
            kind = fields.get("kind", "photo")
            if kind not in UPLOAD_RULES: kind = "photo"
            exts, max_size, max_count = UPLOAD_RULES[kind]
            count = db().execute("SELECT COUNT(*) c FROM photos WHERE user_id=? AND kind=?",
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
            cur = db().execute("INSERT INTO photos(user_id,filename,orig,created,kind) VALUES(?,?,?,?,?)",
                               (uid, fn, orig[:200], now(), kind))
            db().commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid, "kind": kind})

        if p == "/api/submit":
            d = jbody()
            kind = str(d.get("kind") or "genel")[:40]
            db().execute("INSERT INTO submissions(kind,data,created) VALUES(?,?,?)",
                         (kind, json.dumps(d.get("data") or {}, ensure_ascii=False)[:8000], now()))
            db().commit()
            return self._json(200, {"ok": True})

        return self._json(404, {"error": "Bilinmeyen uç"})

    # ---------- DELETE ----------
    def do_DELETE(self):
        m = re.match(r"^/api/photo/(\d+)$", urlparse(self.path).path)
        if not m: return self._json(404, {"error": "Bilinmeyen uç"})
        uid = self._session_user()
        if not uid: return self._json(401, {"error": "Oturum yok"})
        row = db().execute("SELECT * FROM photos WHERE id=? AND user_id=?", (int(m.group(1)), uid)).fetchone()
        if not row: return self._json(404, {"error": "Yok"})
        try: os.remove(os.path.join(UPLOAD_DIR, row["filename"]))
        except OSError: pass
        db().execute("DELETE FROM photos WHERE id=?", (row["id"],)); db().commit()
        return self._json(200, {"ok": True})

if __name__ == "__main__":
    print(f"MOW API v2 127.0.0.1:8010 — veri: {DATA_DIR}")
    ThreadingHTTPServer(("127.0.0.1", 8010), Handler).serve_forever()
