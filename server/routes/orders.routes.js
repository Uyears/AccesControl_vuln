'use strict';

const express = require('express');
const { requireAuth, ownerOnly } = require('../authz');
const { badRequest, notFound } = require('../http');

const router = express.Router();

function resolveOrderOwner(req) {
  const order = req.app.locals.db.findOrder(req.params.id);
  return order ? order.userId : undefined;
}

router.get('/', requireAuth, (req, res) => {
  const orders = req.app.locals.db.listOrdersByUser(req.user.id);
  res.json({ orders });
});

// VULN[idor / BOLA]: tidak ada pemeriksaan kepemilikan; order siapa pun bisa
// dibaca selama token valid.
// FIX: ownerOnly() menolak (403) jika order bukan milik pemanggil.
router.get('/:id', requireAuth, ownerOnly(resolveOrderOwner), (req, res) => {
  const db = req.app.locals.db;
  const order = db.findOrder(req.params.id);
  if (!order) return notFound(res, 'Order tidak ditemukan.');

  const address = db.findAddress(order.addressId);
  return res.json({ order, address });
});

const ORDER_FIELDS = ['status', 'courier', 'trackingNumber'];

// VULN[BOLA/IDOR - write]: status pengiriman order siapa pun bisa diubah.
// Dampaknya bukan sekadar data: status "Selesai" dapat memutus alur refund.
// FIX: ownerOnly() (atau admin) sebelum update.
router.patch(
  '/:id',
  requireAuth,
  ownerOnly(resolveOrderOwner, { allowAdmin: true }),
  (req, res) => {
    const db = req.app.locals.db;
    const order = db.findOrder(req.params.id);
    if (!order) return notFound(res, 'Order tidak ditemukan.');

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest(res, 'Body harus berupa objek JSON.');
    }

    const patch = {};
    for (const field of ORDER_FIELDS) {
      if (!(field in body)) continue;
      if (typeof body[field] !== 'string' || body[field].length > 120) {
        return badRequest(res, `Field ${field} harus berupa string (maksimal 120 karakter).`);
      }
      patch[field] = body[field];
    }
    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'Tidak ada field order yang bisa diubah.');
    }
    if (
      'status' in patch &&
      !['Diproses', 'Dikirim', 'Selesai', 'Dibatalkan', 'Menunggu pembayaran'].includes(patch.status)
    ) {
      return badRequest(res, 'Nilai status tidak dikenal.');
    }

    const updated = db.updateOrder(order.id, patch);
    db.addAudit({
      actor: req.user.username,
      action: 'order.update',
      detail: `Order ${order.id} diperbarui: ${Object.keys(patch).join(', ')}.`,
    });
    return res.json({ order: updated });
  }
);

module.exports = router;
