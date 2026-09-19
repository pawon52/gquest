// functions/api/admin/generate.js
// Endpoint: POST /api/admin/generate   header: Authorization: Bearer <ADMIN_KEY>
//           body (opsional): { "count": 10 }
//
// ADMIN_KEY dibaca dari Cloudflare Pages Settings → Environment variables,
// disimpan sebagai secret terenkripsi. Nilainya TIDAK ADA di berkas ini,
// dan tidak pernah terkirim ke peramban siapa pun.

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
  const attemptKey = `admin:${ip}`;

  // 1. Kunci percobaan, sama seperti gerbang PIN pembeli.
  const lock = await env.DB
    .prepare('SELECT count, locked_until FROM attempts WHERE ip_key = ?')
    .bind(attemptKey)
    .first();
  if (lock && lock.locked_until > now) {
    const minutes = Math.ceil((lock.locked_until - now) / 60000);
    return json({ ok: false, error: 'locked', minutes }, 429);
  }

  // 2. Periksa kunci admin dari header Authorization.
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');

  if (!env.ADMIN_KEY || token !== env.ADMIN_KEY) {
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
    }
    await env.DB
      .prepare(
        `INSERT INTO attempts (ip_key, count, locked_until) VALUES (?, ?, 0)
         ON CONFLICT(ip_key) DO UPDATE SET count = excluded.count`
      )
      .bind(attemptKey, count)
      .run();
    return json({ ok: false, error: 'unauthorized', left: MAX_TRY - count }, 401);
  }

  // 3. Kode benar → hapus catatan percobaan gagal, lalu buat PIN baru.
  await env.DB.prepare('DELETE FROM attempts WHERE ip_key = ?').bind(attemptKey).run();

  let body = {};
  try { body = await request.json(); } catch {}
  const n = parseInt(body.count);

  // count = 0 berarti sekadar memeriksa apakah kunci admin benar,
  // tanpa membuat PIN baru — dipakai oleh layar masuk di admin.html.
  if (n === 0) {
    return json({ ok: true, codes: [] });
  }

  const total = Math.min(Math.max(n || 10, 1), 100);

  const codes = new Set();
  while (codes.size < total) {
    codes.add(String(Math.floor(Math.random() * 1000000)).padStart(6, '0'));
  }

  const stmts = [...codes].map(code =>
    env.DB
      .prepare('INSERT OR IGNORE INTO pins (code, status, created_at) VALUES (?, ?, ?)')
      .bind(code, 'active', now)
  );
  await env.DB.batch(stmts);

  return json({ ok: true, codes: [...codes] });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
