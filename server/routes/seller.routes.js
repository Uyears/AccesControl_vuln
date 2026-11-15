'use strict';

const express = require('express');
const { requireAuth, requireCookieRole, isSecure } = require('../authz');

const router = express.Router();

// VULN[BFLA - client-controlled role]: customer yang mengubah cookie `role`
// menjadi `seller` bisa membuka panel penjual. Di SECURE role diambil dari
// akun pada token.
router.use(requireAuth, requireCookieRole('seller'));

router.get('/products', (req, res) => {
  const db = req.app.locals.db;
  const products = isSecure(req)
    ? db.listProducts({ sellerId: req.user.id, includeInactive: true })
    : db.listProducts({ includeInactive: true });
  res.json({ products });
});

router.get('/summary', (req, res) => {
  const db = req.app.locals.db;
  const products = isSecure(req)
    ? db.listProducts({ sellerId: req.user.id, includeInactive: true })
    : db.listProducts({ includeInactive: true });
  const orders = isSecure(req)
    ? db
        .listOrders()
        .filter((order) => order.items.some((item) => products.some((p) => p.id === item.productId)))
    : db.listOrders();
  res.json({
    products,
    orders,
    revenue: orders
      .filter((order) => order.paymentStatus === 'paid')
      .reduce((sum, order) => sum + order.total, 0),
  });
});

module.exports = router;
