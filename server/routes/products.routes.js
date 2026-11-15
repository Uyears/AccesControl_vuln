'use strict';

const express = require('express');
const { requireAuth, requireCookieRole, ownerOnly } = require('../authz');
const { badRequest, notFound } = require('../http');

const router = express.Router();

const PRODUCT_FIELDS = ['name', 'sku', 'description', 'category', 'price', 'stock', 'tone'];
const TONES = new Set(['slate', 'sand', 'amber', 'blue', 'teal', 'rose', 'violet', 'stone']);


function validateProduct(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'Body harus berupa objek JSON.';
  }

  const required = partial ? [] : ['name', 'sku', 'price', 'stock'];
  for (const field of required) {
    if (!(field in input)) return `Field ${field} wajib diisi.`;
  }

  for (const field of ['name', 'sku', 'description', 'category']) {
    if (field in input && (typeof input[field] !== 'string' || input[field].length > 500)) {
      return `Field ${field} harus berupa string (maksimal 500 karakter).`;
    }
  }

  if ('price' in input && (!Number.isInteger(input.price) || input.price < 0 || input.price > 1000000000)) {
    return 'Field price harus bilangan bulat rupiah yang wajar.';
  }
  if ('stock' in input && (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 100000)) {
    return 'Field stock harus bilangan bulat 0-100000.';
  }
  if ('tone' in input && !TONES.has(input.tone)) {
    return 'Field tone tidak dikenal.';
  }
  if ('active' in input && typeof input.active !== 'boolean') {
    return 'Field active harus boolean.';
  }
  return null;
}

function productPatch(body, { partial = false } = {}) {
  const patch = {};
  for (const field of [...PRODUCT_FIELDS, 'active']) {
    if (field in body) patch[field] = body[field];
  }
  if (typeof patch.name === 'string') patch.name = patch.name.trim();
  if (typeof patch.sku === 'string') patch.sku = patch.sku.trim().toUpperCase();
  if (typeof patch.description === 'string') patch.description = patch.description.trim();
  if (typeof patch.category === 'string') patch.category = patch.category.trim();
  if (!partial && patch.tone === undefined) patch.tone = 'slate';
  return patch;
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { category, sellerId, q } = req.query;
  let products = db.listProducts();
  if (typeof category === 'string' && category) {
    products = products.filter((product) => product.category === category);
  }
  if (sellerId !== undefined) {
    products = products.filter((product) => product.sellerId === Number(sellerId));
  }
  if (typeof q === 'string' && q.trim()) {
    const needle = q.trim().toLowerCase();
    products = products.filter((product) =>
      [product.name, product.sku, product.category, product.description]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }
  const categories = [...new Set(db.listProducts().map((product) => product.category))].sort();
  res.json({ products, categories });
});

router.get('/:id', (req, res) => {
  const product = req.app.locals.db.findProduct(req.params.id);
  if (!product || product.active === false) return notFound(res, 'Produk tidak ditemukan.');
  return res.json({ product });
});

// VULN[BFLA - client-controlled role]: pemeriksaan penjual memakai cookie
// `role`, sehingga customer yang mengubah cookie dapat membuat produk.
// FIX: requireCookieRole('seller') membaca role dari akun hasil verifikasi
// token saat SECURE_MODE=true.
router.post('/', requireAuth, requireCookieRole('seller'), (req, res) => {
  const body = req.body;
  const error = validateProduct(body);
  if (error) return badRequest(res, error);

  const db = req.app.locals.db;
  const patch = productPatch(body);
  if (db.listProducts({ includeInactive: true }).some((product) => product.sku === patch.sku)) {
    return badRequest(res, 'SKU sudah dipakai produk lain.');
  }

  const product = db.createProduct(req.user.id, patch);
  db.addAudit({
    actor: req.user.username,
    action: 'product.create',
    detail: `Produk ${product.id} (${product.sku}) dibuat untuk seller ${req.user.id}.`,
  });
  return res.status(201).json({ product });
});

function resolveProductSeller(req) {
  const product = req.app.locals.db.findProduct(req.params.id);
  return product ? product.sellerId : undefined;
}

// VULN[BOLA/IDOR - write]: tidak ada cek kepemilikan produk. Penjual mana pun
// (atau customer dengan cookie role=seller) bisa mengubah produk penjual lain.
// FIX: ownerOnly() memeriksa sellerId produk terhadap user dari token.
router.patch(
  '/:id',
  requireAuth,
  requireCookieRole('seller'),
  ownerOnly(resolveProductSeller),
  (req, res) => {
    const db = req.app.locals.db;
    const product = db.findProduct(req.params.id);
    if (!product) return notFound(res, 'Produk tidak ditemukan.');

    const error = validateProduct(req.body, { partial: true });
    if (error) return badRequest(res, error);
    const patch = productPatch(req.body, { partial: true });
    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'Tidak ada field produk yang bisa diubah.');
    }
    if (
      patch.sku &&
      db
        .listProducts({ includeInactive: true })
        .some((row) => row.sku === patch.sku && row.id !== product.id)
    ) {
      return badRequest(res, 'SKU sudah dipakai produk lain.');
    }

    const updated = db.updateProduct(product.id, patch);
    db.addAudit({
      actor: req.user.username,
      action: 'product.update',
      detail: `Produk ${product.id} diperbarui: ${Object.keys(patch).join(', ')}.`,
    });
    return res.json({ product: updated });
  }
);

// VULN[BOLA/IDOR - delete]: penghapusan produk tidak memeriksa pemilik saat
// SECURE_MODE=false.
router.delete(
  '/:id',
  requireAuth,
  requireCookieRole('seller'),
  ownerOnly(resolveProductSeller),
  (req, res) => {
    const db = req.app.locals.db;
    const product = db.findProduct(req.params.id);
    if (!product) return notFound(res, 'Produk tidak ditemukan.');

    db.deleteProduct(product.id);
    db.addAudit({
      actor: req.user.username,
      action: 'product.delete',
      detail: `Produk ${product.id} (${product.sku}) dihapus.`,
    });
    return res.status(204).end();
  }
);


module.exports = router;
