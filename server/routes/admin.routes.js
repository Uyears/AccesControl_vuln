'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../authz');
const { badRequest, notFound } = require('../http');

const router = express.Router();

// VULN[BFLA - missing authorization check]: tidak ada pemeriksaan role.
// Siapa pun yang punya token valid bisa membaca seluruh daftar user, termasuk
// email, nomor telepon, dan role.
// FIX: requireRole('admin') menolak (403) saat SECURE_MODE=true.
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = req.app.locals.db.listUsers();
  res.json({ users, count: users.length });
});

// VULN[BFLA]: penghapusan user tidak memeriksa role. UI hanya menyembunyikan
// tombolnya untuk non-admin; API tetap menerima request tersebut.
// FIX: requireRole('admin') di depan handler.
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = req.app.locals.db;
  const target = db.findUserById(req.params.id);
  if (!target) return notFound(res, 'User tidak ditemukan.');

  if (target.id === req.user.id) {
    return badRequest(res, 'Akun yang sedang dipakai tidak bisa dihapus.');
  }

  db.deleteUser(target.id);
  db.addAudit({
    actor: req.user.username,
    action: 'user.delete',
    detail: `User ${target.id} (${target.username}, role ${target.role}) dihapus.`,
  });

  return res.status(204).end();
});

// KONTROL NEGATIF — sengaja selalu 403 untuk non-admin di kedua mode.
// { enforce: true } memaksa guard berjalan meskipun SECURE_MODE=false.
// Tujuannya: endpoint tersembunyi yang berhasil ditemukan belum tentu rentan.
router.get(
  '/audit-log',
  requireAuth,
  requireRole('admin', { enforce: true }),
  (req, res) => {
    res.json({ entries: req.app.locals.db.listAuditLog() });
  }
);

module.exports = router;
