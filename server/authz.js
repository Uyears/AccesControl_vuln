'use strict';

/**
 * Satu-satunya tempat guard otorisasi.
 *
 * Aturan main:
 *  - `requireAuth` selalu aktif di kedua mode. Autentikasi bukan materi lab ini.
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
  ownerOnly,
  pickAllowedFields,
};
