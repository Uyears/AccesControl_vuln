'use strict';

const express = require('express');
const { requireAuth, requireRole, isSecure } = require('../authz');
const { toPublicUser } = require('../db');

const router = express.Router();

/**
 * Kontrol akses yang hilang total di VULN: endpoint tidak memakai requireAuth.
 * Di SECURE, baru dipasang requireAuth + requireRole('admin').
 */
function secureAdminOnly(req, res, next) {
  if (!isSecure(req)) return next();
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    return requireRole('admin')(req, res, next);
  });
}

// VULN[missing authentication + BFLA]: daftar tagihan seluruh pelanggan
// (termasuk email dan nomor telepon) dapat diambil tanpa token sama sekali.
// Endpoint ini tidak ditautkan dari UI; hanya terlihat lewat recon.
// FIX: SECURE mewajibkan token admin.
router.get('/invoices', secureAdminOnly, (req, res) => {
  const db = req.app.locals.db;
  const invoices = db.listInvoices().map((invoice) => {
    const customer = db.findUserById(invoice.userId);
    return {
      ...invoice,
      customer: customer ? toPublicUser(customer) : null,
    };
  });
  res.json({ invoices, count: invoices.length });
});

module.exports = router;
