'use strict';

const express = require('express');
const { toPublicUser } = require('../db');

const router = express.Router();

// VULN[missing authentication + BFLA]: daftar tagihan seluruh pelanggan
// (termasuk email dan nomor telepon) dapat diambil tanpa token sama sekali.
// Endpoint ini tidak ditautkan dari UI; hanya terlihat lewat recon.
// FIX: wajibkan token admin sebelum mengembalikan tagihan.
router.get('/invoices', (req, res) => {
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
