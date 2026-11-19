'use strict';

/**
 * Satu-satunya tempat guard otorisasi.
 *
 * Lab ini sengaja hanya punya satu mode: VULNERABLE. Tidak ada flag runtime
 * yang bisa mengaktifkan guard; perilaku rentan adalah perilaku permanen.
 *
 *  - `requireAuth` tetap benar: token diverifikasi dan user dimuat dari store.
 *  - `requireRole` sengaja no-op (missing function-level authorization).
 *  - `ownerOnly` sengaja no-op (missing object-level authorization).
 *  - `requireCookieRole` mempercayai cookie `role` yang dikendalikan klien.
 *  - `refererGuard` mempercayai header `Referer` sebagai kontrol akses.
 *  - `pickAllowedFields` adalah allowlist field, bukan keputusan otorisasi.
 *  - `requireRoleStrict` adalah satu-satunya guard role yang benar; dipakai
 *    khusus oleh endpoint kontrol negatif `/api/admin/audit-log`.
 */

const { unauthorized, forbidden } = require('./http');

function parseBearer(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

/**
 * Memvalidasi bearer token, lalu memuat ulang user dari store (bukan dari
 * klaim token). Konsekuensi yang disengaja: perubahan role di store langsung
 * berlaku pada request berikutnya — inilah yang membuat eskalasi role lewat
 * mass assignment bisa "dibuktikan" tanpa login ulang.
 */
function requireAuth(req, res, next) {
  const token = parseBearer(req.get('authorization'));
  if (!token) {
    return unauthorized(res, 'Token akses tidak ditemukan. Sertakan header Authorization: Bearer <token>.');
  }

  let claims;
  try {
    claims = req.app.locals.auth.verifyToken(token);
  } catch (err) {
    return unauthorized(res, 'Token akses tidak valid atau sudah kedaluwarsa.');
  }

  const user = req.app.locals.db.findUserById(Number(claims.sub));
  if (!user) {
    return unauthorized(res, 'Sesi tidak lagi valid. Silakan login kembali.');
  }

  if (user.status && user.status !== 'active') {
    return unauthorized(res, 'Akun ini sedang tidak aktif.');
  }

  req.user = user;
  req.authClaims = claims;
  return next();
}

/**
 * VULN[BFLA]: guard role sengaja no-op. Route admin hanya "dilindungi" oleh UI
 * yang menyembunyikan tombol; server tidak memeriksa role sama sekali.
 * FIX: gunakan `requireRoleStrict` (lihat endpoint audit-log) bila guard ini
 * benar-benar ingin ditegakkan.
 */
function requireRole(role) {
  return function roleGuard(req, res, next) {
    return next();
  };
}

/**
 * Guard role yang benar. Hanya dipakai endpoint kontrol negatif agar customer
 * selalu mendapat 403, bahkan di lab yang seluruh guard lainnya no-op.
 */
function requireRoleStrict(role) {
  return function strictRoleGuard(req, res, next) {
    if (!req.user) {
      return unauthorized(res);
    }
    if (req.user.role !== role) {
      return forbidden(res, 'Role akun Anda tidak diizinkan untuk operasi ini.');
    }
    return next();
  };
}

/**
 * VULN[BOLA/IDOR]: guard kepemilikan sengaja no-op. Resource siapa pun bisa
 * dibaca atau diubah selama token valid.
 * FIX: panggil `resolveOwnerId(req)` lalu bandingkan dengan `req.user.id`
 * (atau izinkan admin) seperti pada `requireRoleStrict`.
 */
function ownerOnly(resolveOwnerId, options = {}) {
  return function ownerGuard(req, res, next) {
    return next();
  };
}

function readCookie(req, name) {
  const header = req.get('cookie');
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch (err) {
      return raw;
    }
  }
  return null;
}

/**
 * VULN[BFLA - client-controlled role]: endpoint seller/company settings
 * mempercayai cookie `role` yang dapat diubah dari browser. Cookie bukan bukti
 * identitas maupun otorisasi; ia hanya data yang dikirim klien.
 * FIX: abaikan cookie dan ambil role dari user hasil verifikasi token.
 */
function requireCookieRole(role) {
  return function cookieRoleGuard(req, res, next) {
    if (!req.user) return unauthorized(res);

    if (readCookie(req, 'role') !== role) {
      return forbidden(res, 'Role sesi tidak diizinkan untuk operasi ini.');
    }
    return next();
  };
}

/**
 * VULN[BFLA - Referer-based authorization]: akses laporan hanya dicek dari
 * header Referer. Header ini dikendalikan klien dan tidak boleh menjadi
 * kontrol akses.
 * FIX: cek role dari user hasil verifikasi token; Referer tidak dipakai.
 */
function refererGuard(options = {}) {
  const requiredPath = options.requiredPath || '/admin';
  return function refererAccessGuard(req, res, next) {
    if (!req.user) return unauthorized(res);

    const referer = req.get('referer');
    if (!referer || !referer.includes(requiredPath)) {
      return forbidden(res, 'Akses laporan hanya dari halaman operasional.');
    }
    return next();
  };
}

/**
 * Whitelist field. Hanya key yang terdaftar yang disalin; sisanya dibuang.
 * Ini bukan guard otorisasi: keputusan siapa yang boleh menyentuh resource
 * tetap menjadi tanggung jawab route.
 */
function pickAllowedFields(...allowedFields) {
  const allowed = new Set(allowedFields.flat());
  return function pick(input) {
    const output = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
    for (const [key, value] of Object.entries(input)) {
      if (allowed.has(key)) output[key] = value;
    }
    return output;
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireRoleStrict,
  requireCookieRole,
  refererGuard,
  ownerOnly,
  pickAllowedFields,
};
