'use strict';

const express = require('express');
const { requireAuth } = require('../authz');
const { badRequest, notFound } = require('../http');

const router = express.Router();

function parseQty(value) {
  if (!Number.isInteger(value) || value < 1 || value > 99) return null;
  return value;
}

router.get('/', requireAuth, (req, res) => {
  res.json({ cart: req.app.locals.db.cartView(req.user.id) });
});

router.post('/items', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(res, 'Body harus berupa objek JSON.');
  }

  const productId = Number(body.productId);
  const qty = parseQty(body.qty);
  if (!Number.isInteger(productId) || productId <= 0) {
    return badRequest(res, 'Field productId wajib berupa angka.');
  }
  if (qty === null) return badRequest(res, 'Field qty harus 1-99.');

  const product = db.findProduct(productId);
  if (!product || product.active === false) return notFound(res, 'Produk tidak ditemukan.');
  if (qty > product.stock) return badRequest(res, 'Jumlah melebihi stok yang tersedia.');

  db.addCartItem(req.user.id, product.id, qty);
  return res.status(201).json({ cart: db.cartView(req.user.id) });
});

router.patch('/items/:productId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const productId = Number(req.params.productId);
  const product = db.findProduct(productId);
  if (!product) return notFound(res, 'Produk tidak ditemukan.');

  const qty = req.body && req.body.qty;
  if (!Number.isInteger(qty) || qty < 0 || qty > 99) {
    return badRequest(res, 'Field qty harus 0-99.');
  }
  if (qty > product.stock) return badRequest(res, 'Jumlah melebihi stok yang tersedia.');

  db.updateCartItem(req.user.id, product.id, qty);
  return res.json({ cart: db.cartView(req.user.id) });
});

router.delete('/items/:productId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  db.removeCartItem(req.user.id, Number(req.params.productId));
  return res.status(204).end();
});

// VULN[BOLA/IDOR pada relasi checkout]: alamat pengiriman boleh milik user
// lain. Request valid, tetapi pesanan memakai alamat/kontak orang lain.
// FIX: pastikan alamat milik pemanggil sebelum membuat order.
router.post('/checkout', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const cart = db.cartView(req.user.id);
  if (cart.items.length === 0) return badRequest(res, 'Keranjang masih kosong.');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(res, 'Body harus berupa objek JSON.');
  }
  const address = db.findAddress(body.addressId);
  if (!address) return notFound(res, 'Alamat pengiriman tidak ditemukan.');


  const items = cart.items.map((item) => ({
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    qty: item.qty,
    price: item.price,
  }));

  const order = db.createOrder({
    userId: req.user.id,
    addressId: address.id,
    items,
    status: 'Menunggu pembayaran',
    paymentStatus: 'unpaid',
  });
  const invoice = db.createInvoice(order);

  for (const item of items) {
    const product = db.findProduct(item.productId);
    if (product) db.updateProduct(product.id, { stock: Math.max(0, product.stock - item.qty) });
  }

  db.clearCart(req.user.id);
  db.addAudit({
    actor: req.user.username,
    action: 'order.checkout',
    detail: `Order ${order.id} dibuat dengan alamat ${address.id}, invoice ${invoice.number}.`,
  });

  return res.status(201).json({ order, invoice, address });
});

module.exports = router;
