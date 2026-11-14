'use strict';

const express = require('express');
const { requireAuth, ownerOnly, pickAllowedFields, isSecure } = require('../authz');
const { badRequest, notFound } = require('../http');
const { toPublicUser } = require('../db');

const router = express.Router();

const PROFILE_FIELDS = ['name', 'email', 'phone'];

// Field identitas/internal yang tidak boleh diubah lewat profil. Di mode VULN
// daftar ini tetap dipakai agar akun tidak bisa "diambil alih" dengan mengubah
// id/username/passwordHash — fokus lab adalah otorisasi, bukan auth bypass.
const IMMUTABLE_FIELDS = ['id', 'username', 'passwordHash', 'joinedAt', 'createdAt'];

const VALID_ROLES = new Set(['customer', 'admin']);

function pickVulnerablePatch(body) {
  const patch = { ...body };
  for (const field of IMMUTABLE_FIELDS) delete patch[field];
  delete patch.__proto__; // jaga-jaga terhadap prototype pollution lewat literal JSON
  return patch;
}

function validateProfilePatch(patch) {
  for (const field of PROFILE_FIELDS) {
    if (field in patch && (typeof patch[field] !== 'string' || patch[field].length > 200)) {
      return `Field ${field} harus berupa string (maksimal 200 karakter).`;
    }
  }
  if ('role' in patch && !VALID_ROLES.has(patch.role)) {
    return 'Field role hanya menerima nilai "customer" atau "admin".';
  }
  return null;
}

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// VULN[mass-assignment / privilege escalation]: seluruh body (kecuali field
// identitas internal) disalin ke record user, termasuk `role`. Customer bisa
// mengubah dirinya menjadi admin lalu langsung memakai endpoint admin.
// FIX: saat SECURE_MODE=true hanya PROFILE_FIELDS yang diambil lewat
// pickAllowedFields(); `role` diabaikan sepenuhnya.
router.patch('/me', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(res, 'Body harus berupa objek JSON.');
  }

  const patch = isSecure(req)
    ? pickAllowedFields(PROFILE_FIELDS)(body)
    : pickVulnerablePatch(body);

  const validationError = validateProfilePatch(patch);
  if (validationError) return badRequest(res, validationError);

  if (Object.keys(patch).length === 0) {
    // Di mode SECURE, field di luar whitelist (termasuk `role`) diabaikan:
    // request tetap dianggap sukses, tetapi tidak ada yang berubah.
    if (isSecure(req) && Object.keys(body).length > 0) {
      return res.json({ user: toPublicUser(req.user) });
    }
    return badRequest(res, 'Tidak ada field profil yang bisa diubah.');
  }

  const updated = req.app.locals.db.updateUser(req.user.id, patch);
  if (!updated) return notFound(res, 'User tidak ditemukan.');

  return res.json({ user: toPublicUser(updated) });
});

// VULN[idor]: token valid apa pun boleh membaca profil user mana pun.
// FIX: ownerOnly() memastikan hanya pemilik (atau admin) yang boleh.
router.get(
  '/:id/profile',
  requireAuth,
  ownerOnly((req) => req.params.id, { allowAdmin: true }),
  (req, res) => {
    const user = req.app.locals.db.findUserById(req.params.id);
    if (!user) return notFound(res, 'User tidak ditemukan.');
    return res.json({ user: toPublicUser(user) });
  }
);

module.exports = router;
