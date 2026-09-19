// functions/api/redeem.js
// Endpoint: POST /api/redeem   body: { "pin": "204016" }
//
// Semua pemeriksaan PIN terjadi di sini, di server, bukan di peramban pembeli.
// Kunci pembuat PIN tidak pernah ada di berkas ini — hanya kode PIN yang sudah
// jadi, tersimpan di database D1.

const MAX_TRY = 5;
const LOCK_MINUTES = 15;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const attemptKey = `redeem:${ip}`;

  // 1. Cek apakah IP ini sedang dikunci karena kebanyakan salah.
  const lock = await env.DB
    .prepare('SELECT count, locked_until FROM attempts WHERE ip_key = ?')
    .bind(attemptKey)
    .first();

  if (lock && lock.locked_until > now) {
    const minutes = Math.ceil((lock.locked_until - now) / 60000);
    return json({ ok: false, error: 'locked', minutes }, 429);
  }

  // 2. Ambil dan validasi format PIN dari isian pembeli.
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const pin = String(body.pin || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    return json({ ok: false, error: 'format' }, 400);
  }

  // 3. Cek PIN di database.
  const row = await env.DB
    .prepare('SELECT status FROM pins WHERE code = ?')
    .bind(pin)
    .first();

  if (row && row.status === 'active') {
    // PIN sah: hapus catatan percobaan gagal untuk IP ini, catat pemakaian.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM attempts WHERE ip_key = ?').bind(attemptKey),
      env.DB
        .prepare('INSERT INTO redemptions (code, ip, created_at) VALUES (?, ?, ?)')
        .bind(pin, ip, now)
    ]);
    return json({ ok: true });
  }

  // 4. PIN salah atau sudah dicabut (revoked) → catat percobaan gagal.
  const count = (lock?.count || 0) + 1;
  if (count >= MAX_TRY) {
    const until = now + LOCK_MINUTES * 60000;
    await env.DB
      .prepare(
        `INSERT INTO attempts (ip_key, count, locked_until) VALUES (?, 0, ?)
         ON CONFLICT(ip_key) DO UPDATE SET count = 0, locked_until = excluded.locked_until`
      )
      .bind(attemptKey, until)
      .run();
    return json({ ok: false, error: 'locked', minutes: LOCK_MINUTES }, 429);
  } else {
    await env.DB
      .prepare(
        `INSERT INTO attempts (ip_key, count, locked_until) VALUES (?, ?, 0)
         ON CONFLICT(ip_key) DO UPDATE SET count = excluded.count`
      )
      .bind(attemptKey, count)
      .run();
    return json({ ok: false, error: 'invalid', left: MAX_TRY - count }, 401);
  }
}

// Metode selain POST ditolak dengan rapi, bukan error 500.
export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
