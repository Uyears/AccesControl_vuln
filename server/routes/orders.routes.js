'use strict';

const express = require('express');
const { requireAuth, ownerOnly } = require('../authz');
const { notFound } = require('../http');

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

module.exports = router;
