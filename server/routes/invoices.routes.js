'use strict';

const express = require('express');
const { requireAuth, ownerOnly } = require('../authz');
const { notFound } = require('../http');
const { toPublicUser } = require('../db');

const router = express.Router();

function resolveInvoiceOwner(req) {
  const invoice = req.app.locals.db.findInvoice(req.params.id);
  return invoice ? invoice.userId : undefined;
}

router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const invoices = db.listInvoicesByUser(req.user.id);
  res.json({ invoices });
});

// VULN[IDOR/BOLA]: invoice siapa pun bisa dibaca dengan menebak id berurutan.
// FIX: ownerOnly() membatasi ke pemilik invoice; admin tetap boleh.
router.get(
  '/:id',
  requireAuth,
  ownerOnly(resolveInvoiceOwner, { allowAdmin: true }),
  (req, res) => {
    const db = req.app.locals.db;
    const invoice = db.findInvoice(req.params.id);
    if (!invoice) return notFound(res, 'Invoice tidak ditemukan.');
    const order = db.findOrder(invoice.orderId);
    return res.json({ invoice, order });
  }
);

function pdfText(value) {
  return String(value)
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatRupiah(value) {
  return `Rp ${String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function renderInvoicePdf({ invoice, order, customer }) {
  const lines = [
    ['Nusa Supply', 16],
    ['Faktur ' + invoice.number, 12],
    ['Order #' + invoice.orderId + '  |  ' + invoice.issuedAt, 10],
    ['', 10],
    ['Ditagihkan kepada: ' + customer.name, 10],
    [customer.email, 10],
    ['', 10],
  ];
  if (order) {
    for (const item of order.items) {
      lines.push([`${item.name} x${item.qty} — ${formatRupiah(item.price * item.qty)}`, 10]);
    }
    lines.push(['', 10]);
    lines.push(['Total: ' + formatRupiah(order.total), 11]);
    lines.push(['Status pembayaran: ' + order.paymentStatus, 10]);
    lines.push(['Kurir: ' + (order.courier || '-') + '  ' + (order.trackingNumber || ''), 10]);
  }
  lines.push(['', 10]);
  lines.push(['Data fiktif. Dokumen ini dihasilkan oleh aplikasi latihan lokal.', 9]);

  let y = 800;
  let content = 'BT\n';
  for (const [text, size] of lines) {
    content += `1 0 0 1 50 ${y} Tm /F1 ${size} Tf (${pdfText(text)}) Tj\n`;
    y -= size + 8;
  }
  content += 'ET\n';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

router.get(
  '/:id/pdf',
  requireAuth,
  ownerOnly(resolveInvoiceOwner, { allowAdmin: true }),
  (req, res) => {
    const db = req.app.locals.db;
    const invoice = db.findInvoice(req.params.id);
    if (!invoice) return notFound(res, 'Invoice tidak ditemukan.');
    const order = db.findOrder(invoice.orderId);
    const customer = db.findUserById(invoice.userId);
    const pdf = renderInvoicePdf({ invoice, order, customer });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.id}.pdf"`);
    return res.send(pdf);
  }
);

module.exports = router;
