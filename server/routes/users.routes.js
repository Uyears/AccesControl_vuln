'use strict';

const express = require('express');
const { requireAuth, ownerOnly } = require('../authz');
const { badRequest, notFound } = require('../http');
const { toPublicUser } = require('../db');

const router = express.Router();

const PROFILE_FIELDS = ['name', 'email', 'phone'];

// Field identitas/internal yang tidak boleh diubah lewat profil. Fokus lab
// adalah otorisasi, bukan auth bypass, jadi field ini tetap dibuang.
const IMMUTABLE_FIELDS = ['id', 'username', 'passwordHash', 'joinedAt', 'createdAt', 'status'];

const VALID_ROLES = new Set(['customer', 'seller', 'admin']);

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
    return 'Field role hanya menerima nilai "customer", "seller", atau "admin".';
  }
  return null;
}

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// VULN[mass-assignment / privilege escalation]: seluruh body (kecuali field
// identitas internal) disalin ke record user, termasuk `role`. Customer bisa
// mengubah dirinya menjadi admin lalu langsung memakai endpoint admin.
// FIX: ambil hanya PROFILE_FIELDS lewat pickAllowedFields(); `role` diabaikan.
router.patch('/me', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(res, 'Body harus berupa objek JSON.');
  }

  const patch = pickVulnerablePatch(body);

  const validationError = validateProfilePatch(patch);
  if (validationError) return badRequest(res, validationError);

  if (Object.keys(patch).length === 0) {
    return badRequest(res, 'Tidak ada field profil yang bisa diubah.');
  }

  const updated = req.app.locals.db.updateUser(req.user.id, patch);
  if (!updated) return notFound(res, 'User tidak ditemukan.');

  return res.json({ user: toPublicUser(updated) });
});

// VULN[IDOR via query parameter]: endpoint pengganti yang tidak ditautkan dari
// UI. userId diambil dari query, bukan dari token.
// FIX: hanya izinkan userId sendiri (admin boleh semua).
router.get('/profile', requireAuth, (req, res) => {
  const raw = req.query.userId;
  const id = raw === undefined ? req.user.id : Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return badRequest(res, 'Parameter userId harus berupa angka.');
  }

  const user = req.app.locals.db.findUserById(id);
  if (!user) return notFound(res, 'User tidak ditemukan.');
  return res.json({ user: toPublicUser(user) });
});

// VULN[IDOR]: token valid apa pun boleh membaca profil user mana pun.
// FIX: ownerOnly() memastikan hanya pemilik (atau admin) yang boleh.
router.get(
  '/:id/profile',
  requireAuth,
  ownerOnly(
    (req) => {
      const user = req.app.locals.db.findUserById(req.params.id);
      return user ? user.id : undefined;
    },
    { allowAdmin: true }
  ),
  (req, res) => {
    const user = req.app.locals.db.findUserById(req.params.id);
    if (!user) return notFound(res, 'User tidak ditemukan.');
    return res.json({ user: toPublicUser(user) });
  }
);

module.exports = router;
