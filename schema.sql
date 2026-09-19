-- Tempel seluruh isi berkas ini ke tab "Console" pada database D1 Anda
-- di dashboard Cloudflare, lalu klik Run. Cukup dijalankan sekali di awal.

CREATE TABLE IF NOT EXISTS pins (
  code       TEXT PRIMARY KEY,      -- kode PIN 6 digit
  status     TEXT NOT NULL DEFAULT 'active',  -- 'active' atau 'revoked'
  created_at INTEGER NOT NULL,      -- kapan PIN dibuat (milidetik sejak 1970)
  note       TEXT                   -- catatan bebas, misal nama pembeli
);

CREATE TABLE IF NOT EXISTS redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,         -- PIN yang dipakai
  ip         TEXT,                  -- alamat IP saat memasukkan PIN
  created_at INTEGER NOT NULL       -- kapan PIN itu dipakai
);

CREATE TABLE IF NOT EXISTS attempts (
  ip_key       TEXT PRIMARY KEY,    -- gabungan jenis gerbang + alamat IP
  count        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- Contoh perintah yang berguna nanti, tinggal jalankan lewat Console yang sama:
--
-- Melihat semua PIN dan statusnya:
--   SELECT * FROM pins ORDER BY created_at DESC;
--
-- Mencabut satu PIN yang bocor:
--   UPDATE pins SET status = 'revoked' WHERE code = '204016';
--
-- Menambahkan satu PIN manual dengan catatan nama pembeli:
--   INSERT INTO pins (code, status, created_at, note)
--   VALUES ('305112', 'active', strftime('%s','now') * 1000, 'Bu Rina - transfer BCA 18 Sep');
--
-- Melihat riwayat pemakaian PIN tertentu:
--   SELECT * FROM redemptions WHERE code = '204016';
