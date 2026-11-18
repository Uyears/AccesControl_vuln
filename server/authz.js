'use strict';

/**
 * Satu-satunya tempat guard otorisasi.
 *
 * Aturan main:
 *  - `requireCookieRole` sengaja lemah di VULN: role dibaca dari cookie
 *    `role` yang bisa diubah klien, bukan dari token. Di SECURE, cookie
 *    diabaikan dan role diambil dari user di store.
 *  - `refererGuard` di VULN hanya memeriksa path pada header Referer; di
 *    SECURE ia menuntut role admin dari token.
 *  - `requireRole` dan `ownerOnly` menjadi no-op saat SECURE_MODE=false,
 *    KECUALI dipanggil dengan `{ enforce: true }` (dipakai endpoint kontrol
 *    negatif /api/admin/audit-log agar selalu 403 untuk non-admin).
 *  - `pickAllowedFields` selalu memfilter; pemanggil yang menentukan field mana
 *    yang boleh, sehingga perbedaan VULN/SECURE terlihat jelas di route.
 */

const { unauthorized, forbidden } = require('./http');

function isSecure(req) {
  return req.app.locals.secure === true;
}

function shouldEnforce(req, options) {
  if (options.enforce === true) return true;
  if (options.enforce === false) return false;
  return isSecure(req);
}

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
 * VULN[BFLA]: pada SECURE_MODE=false guard ini no-op, sehingga route admin
 * hanya "dilindungi" oleh UI yang menyembunyikan tombol.
 * FIX: aktifkan guard ini di mode SECURE (default aman).
 */
function requireRole(role, options = {}) {
  return function roleGuard(req, res, next) {
    if (!shouldEnforce(req, options)) return next();

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
 * VULN[BOLA/IDOR]: pada SECURE_MODE=false guard ini no-op.
 * FIX: di mode SECURE, pemilik resource (atau admin bila allowAdmin) wajib cocok.
 *
 * `resolveOwnerId(req)` boleh mengembalikan undefined untuk resource yang tidak
 * ada; route tetap akan menjawab 404. Guard ini hanya memutuskan kepemilikan.
 */
function ownerOnly(resolveOwnerId, options = {}) {
  return function ownerGuard(req, res, next) {
    if (!shouldEnforce(req, options)) return next();

    if (!req.user) {
      return unauthorized(res);
    }

    let ownerId;
    try {
      ownerId = resolveOwnerId(req);
    } catch (err) {
      ownerId = undefined;
    }

    if (ownerId === undefined || ownerId === null) return next();

    if (options.allowAdmin === true && req.user.role === 'admin') return next();

    if (String(ownerId) !== String(req.user.id)) {
      return forbidden(res, 'Anda bukan pemilik resource ini.');
    }
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
 * FIX: di SECURE, cookie diabaikan dan role diambil dari user hasil verifikasi
 * token.
 */
function requireCookieRole(role, options = {}) {
  return function cookieRoleGuard(req, res, next) {
    if (!req.user) return unauthorized(res);

    if (shouldEnforce(req, options)) {
      if (req.user.role !== role) {
        return forbidden(res, 'Role akun Anda tidak diizinkan untuk operasi ini.');
      }
      return next();
    }

    if (readCookie(req, 'role') !== role) {
      return forbidden(res, 'Role sesi tidak diizinkan untuk operasi ini.');
    }
    return next();
  };
}

/**
 * VULN[BFLA - Referer-based authorization]: di VULN, akses laporan hanya dicek
 * dari header Referer. Header ini dikendalikan klien dan tidak boleh menjadi
 * kontrol akses.
 * FIX: di SECURE, cek role admin dari token; Referer tidak dipakai.
 */
function refererGuard(options = {}) {
  const requiredPath = options.requiredPath || '/admin';
  const role = options.role || 'admin';
  return function refererAccessGuard(req, res, next) {
    if (!req.user) return unauthorized(res);

    if (shouldEnforce(req, options)) {
      if (req.user.role !== role) {
        return forbidden(res, 'Role akun Anda tidak diizinkan untuk operasi ini.');
      }
      return next();
    }

    const referer = req.get('referer');
    if (!referer || !referer.includes(requiredPath)) {
      return forbidden(res, 'Akses laporan hanya dari halaman operasional.');
    }
    return next();
  };
}

/**
 * Whitelist field. Hanya key yang terdaftar yang disalin; sisanya dibuang.
 * Dipakai baik di mode SECURE maupun sebagai alat bantu di route.
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
  isSecure,
  requireAuth,
  requireRole,
  requireCookieRole,
  refererGuard,
  ownerOnly,
  pickAllowedFields,
};
