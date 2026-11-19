'use strict';

const express = require('express');
const { requireAuth, ownerOnly, pickAllowedFields } = require('../authz');
const { badRequest, notFound } = require('../http');

const router = express.Router();

const ADDRESS_FIELDS = ['label', 'recipient', 'line1', 'city', 'postalCode', 'phone'];

function resolveAddressOwner(req) {
  const address = req.app.locals.db.findAddress(req.params.id);
  return address ? address.userId : undefined;
}

router.get('/', requireAuth, (req, res) => {
  const addresses = req.app.locals.db.listAddressesByUser(req.user.id);
  res.json({ addresses });
});

router.get('/:id', requireAuth, ownerOnly(resolveAddressOwner), (req, res) => {
  const address = req.app.locals.db.findAddress(req.params.id);
  if (!address) return notFound(res, 'Alamat tidak ditemukan.');
  return res.json({ address });
});

router.post('/', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(res, 'Body harus berupa objek JSON.');
  }
  const patch = pickAllowedFields(ADDRESS_FIELDS)(body);
  for (const field of ['recipient', 'line1', 'city', 'postalCode']) {
    if (typeof patch[field] !== 'string' || !patch[field].trim()) {
      return badRequest(res, `Field ${field} wajib diisi.`);
    }
  }
  for (const field of ADDRESS_FIELDS) {
    if (field in patch) {
      if (typeof patch[field] !== 'string' || patch[field].length > 200) {
        return badRequest(res, `Field ${field} harus berupa string (maksimal 200 karakter).`);
      }
      patch[field] = patch[field].trim();
    }
  }
  if (!patch.label) patch.label = 'Rumah';

  const db = req.app.locals.db;
  const address = db.createAddress(req.user.id, patch);
  db.addAudit({
    actor: req.user.username,
    action: 'address.create',
    detail: `Alamat ${address.id} dibuat.`,
  });
  return res.status(201).json({ address });
});

// VULN[idor / BOLA - write]: alamat milik siapa pun bisa diubah. Body memang
// berisi `id` (klien mengirim objek utuh), tetapi yang menentukan target adalah
// id di path — jadi mengubah id di body tidak menolong maupun menghalangi.
// FIX: ownerOnly() mengecek kepemilikan alamat sebelum update.
router.patch(
  '/:id',
  requireAuth,
  ownerOnly(resolveAddressOwner),
  (req, res) => {
    const db = req.app.locals.db;
    const address = db.findAddress(req.params.id);
    if (!address) return notFound(res, 'Alamat tidak ditemukan.');

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest(res, 'Body harus berupa objek JSON.');
    }

    // Field-level allowlist: id/userId tidak pernah diambil dari body.
    // Materi lab ada pada object-level authorization.
    const patch = pickAllowedFields(ADDRESS_FIELDS)(body);
    for (const field of ADDRESS_FIELDS) {
      if (field in patch && (typeof patch[field] !== 'string' || patch[field].length > 200)) {
        return badRequest(res, `Field ${field} harus berupa string (maksimal 200 karakter).`);
      }
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'Tidak ada field alamat yang bisa diubah.');
    }

    const updated = db.updateAddress(address.id, patch);
    db.addAudit({
      actor: req.user.username,
      action: 'address.update',
      detail: `Alamat ${address.id} diperbarui: ${Object.keys(patch).join(', ')}.`,
    });

    return res.json({ address: updated });
  }
);

module.exports = router;
