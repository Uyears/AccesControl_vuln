'use strict';

const express = require('express');
const { requireAuth, ownerOnly } = require('../authz');
const { notFound } = require('../http');

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

module.exports = router;
