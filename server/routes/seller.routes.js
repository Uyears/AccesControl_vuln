'use strict';

const express = require('express');
const { requireAuth, requireCookieRole } = require('../authz');

const router = express.Router();

// VULN[BFLA - client-controlled role]: customer yang mengubah cookie `role`
// menjadi `seller` bisa membuka panel penjual.
// FIX: ambil role dari akun hasil verifikasi token, bukan cookie.
router.use(requireAuth, requireCookieRole('seller'));

// VULN[BOLA/IDOR]: daftar produk tidak difilter berdasarkan seller pemanggil.
router.get('/products', (req, res) => {
  const db = req.app.locals.db;
  res.json({ products: db.listProducts({ includeInactive: true }) });
});

// VULN[BOLA/IDOR]: ringkasan penjual menjumlahkan seluruh order di toko,
// bukan hanya order yang berisi produk milik penjual.
router.get('/summary', (req, res) => {
  const db = req.app.locals.db;
  const products = db.listProducts({ includeInactive: true });
  const orders = db.listOrders();
  res.json({
    products,
    orders,
    revenue: orders
      .filter((order) => order.paymentStatus === 'paid')
      .reduce((sum, order) => sum + order.total, 0),
  });
});

module.exports = router;
