'use strict';

const express = require('express');
const { requireAuth, ownerOnly } = require('../authz');
const { badRequest, notFound } = require('../http');

const router = express.Router();

function resolveTicketOwner(req) {
  const ticket = req.app.locals.db.findTicket(req.params.id);
  return ticket ? ticket.userId : undefined;
}

router.get('/', requireAuth, (req, res) => {
  const tickets = req.app.locals.db.listTicketsByUser(req.user.id);
  res.json({ tickets });
});

// VULN[idor / BOLA]: tiket siapa pun bisa dibaca, termasuk `internalNotes`
// yang seharusnya hanya untuk tim operasional.
// FIX: ownerOnly() membatasi tiket ke pemiliknya.
router.get('/:id', requireAuth, ownerOnly(resolveTicketOwner), (req, res) => {
  const ticket = req.app.locals.db.findTicket(req.params.id);
  if (!ticket) return notFound(res, 'Tiket tidak ditemukan.');
  return res.json({ ticket });
});

// VULN[BOLA/IDOR - write]: balasan bisa dikirim ke tiket siapa pun. Pesan
// masuk ke thread korban dan `updatedAt` tiket ikut berubah.
// FIX: ownerOnly(resolveTicketOwner) sebelum menambah pesan.
router.post('/:id/messages', requireAuth, ownerOnly(resolveTicketOwner), (req, res) => {
  const db = req.app.locals.db;
  const ticket = db.findTicket(req.params.id);
  if (!ticket) return notFound(res, 'Tiket tidak ditemukan.');

  const body = req.body && req.body.body;
  if (typeof body !== 'string' || !body.trim()) {
    return badRequest(res, 'Field body wajib berupa teks balasan.');
  }
  if (body.length > 2000) {
    return badRequest(res, 'Balasan maksimal 2000 karakter.');
  }

  const message = db.addTicketMessage(ticket.id, {
    authorId: req.user.id,
    body: body.trim(),
    internal: false,
  });
  db.addAudit({
    actor: req.user.username,
    action: 'ticket.reply',
    detail: `Balasan ditambahkan ke tiket ${ticket.id}.`,
  });

  return res.status(201).json({ message, ticket });
});

module.exports = router;
