'use strict';

const express = require('express');
const {
  requireAuth,
  requireRole,
  requireRoleStrict,
  requireCookieRole,
  refererGuard,
} = require('../authz');
const { badRequest, notFound } = require('../http');
const { toPublicUser } = require('../db');

const router = express.Router();

const VALID_ROLES = new Set(['customer', 'seller', 'admin']);

// VULN[BFLA - missing authorization check]: tidak ada pemeriksaan role.
// Siapa pun yang punya token valid bisa membaca seluruh daftar user, termasuk
// email, nomor telepon, dan role.
// FIX: requireRoleStrict('admin') menolak non-admin dengan 403.
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

// VULN[BFLA]: status akun siapa pun bisa diubah tanpa pemeriksaan role. UI
// hanya menyembunyikan kontrolnya; endpoint tetap menerima token customer.
// FIX: requireRoleStrict('admin').
router.patch('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = req.app.locals.db;
  const target = db.findUserById(req.params.id);
  if (!target) return notFound(res, 'User tidak ditemukan.');

  if (target.id === req.user.id) {
    return badRequest(res, 'Status akun yang sedang dipakai tidak bisa diubah dari panel ini.');
  }

  const status = req.body && req.body.status;
  if (status !== 'active' && status !== 'suspended') {
    return badRequest(res, 'Field status harus "active" atau "suspended".');
  }

  const updated = db.updateUser(target.id, { status });
  db.addAudit({
    actor: req.user.username,
    action: 'user.status',
    detail: `Status user ${target.id} (${target.username}) menjadi ${status}.`,
  });
  return res.json({ user: toPublicUser(updated) });
});

// VULN[BFLA - missing function-level authorization]: customer boleh membuat
// permintaan perubahan role untuk dirinya sendiri (atau akun lain). Tidak ada
// pemeriksaan role pada langkah ini.
// FIX: gunakan requireRoleStrict('admin').
router.post('/users/:id/role-change', requireAuth, requireRole('admin'), (req, res) => {
  const db = req.app.locals.db;
  const target = db.findUserById(req.params.id);
  if (!target) return notFound(res, 'User tidak ditemukan.');

  const role = req.body && req.body.role;
  if (!VALID_ROLES.has(role)) {
    return badRequest(res, 'Field role harus customer, seller, atau admin.');
  }

  const request = db.createRoleChangeRequest({
    targetId: target.id,
    role,
    requestedBy: req.user.id,
  });
  db.addAudit({
    actor: req.user.username,
    action: 'role.change.request',
    detail: `Permintaan ${request.id}: user ${target.id} -> ${role}.`,
  });
  return res.status(201).json({ request });
});

// VULN[BFLA - missing function-level authorization + two-step escalation]:
// customer dapat menyetujui permintaan role-nya sendiri. Perubahan baru aktif
// pada request berikutnya karena requireAuth memuat user dari store.
// FIX: hanya admin yang boleh menyetujui.
router.patch(
  '/role-change-requests/:id/approve',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const db = req.app.locals.db;
    const request = db.findRoleChangeRequest(req.params.id);
    if (!request) return notFound(res, 'Permintaan tidak ditemukan.');
    if (request.status !== 'pending') {
      return badRequest(res, 'Permintaan ini sudah diproses.');
    }

    const target = db.findUserById(request.targetId);
    if (!target) return notFound(res, 'User tujuan tidak ditemukan.');

    const updated = db.updateUser(target.id, { role: request.role });
    request.status = 'approved';
    request.decidedBy = req.user.id;
    request.decidedAt = new Date().toISOString();

    db.addAudit({
      actor: req.user.username,
      action: 'role.change.approve',
      detail: `Permintaan ${request.id} disetujui: user ${target.id} menjadi ${request.role}.`,
    });

    return res.json({ request, user: toPublicUser(updated) });
  }
);

router.get(
  '/role-change-requests',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    res.json({ requests: req.app.locals.db.listRoleChangeRequests() });
  }
);

// VULN[BFLA - client-controlled role]: endpoint pengaturan operasional hanya
// memeriksa cookie `role`, yang bisa diubah klien dari DevTools/Burp.
// FIX: ambil role dari akun hasil verifikasi token, bukan cookie.
router.get(
  '/settings',
  requireAuth,
  requireCookieRole('admin'),
  (req, res) => {
    res.json({ settings: req.app.locals.db.getSettings() });
  }
);

router.patch(
  '/settings',
  requireAuth,
  requireCookieRole('admin'),
  (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest(res, 'Body harus berupa objek JSON.');
    }

    const patch = {};
    for (const field of ['maintenanceMode', 'allowRegistration']) {
      if (field in body) {
        if (typeof body[field] !== 'boolean') return badRequest(res, `Field ${field} harus boolean.`);
        patch[field] = body[field];
      }
    }
    if ('supportEmail' in body) {
      if (typeof body.supportEmail !== 'string' || body.supportEmail.length > 160) {
        return badRequest(res, 'Field supportEmail harus berupa string.');
      }
      patch.supportEmail = body.supportEmail;
    }
    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'Tidak ada pengaturan yang bisa diubah.');
    }

    const db = req.app.locals.db;
    const settings = db.updateSettings(patch);
    db.addAudit({
      actor: req.user.username,
      action: 'settings.update',
      detail: `Pengaturan diperbarui: ${Object.keys(patch).join(', ')}.`,
    });
    return res.json({ settings });
  }
);

router.get('/stats', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ stats: req.app.locals.db.stats() });
});

router.get('/orders', requireAuth, requireRole('admin'), (req, res) => {
  const db = req.app.locals.db;
  const orders = db.listOrders().map((order) => ({
    ...order,
    customer: toPublicUser(db.findUserById(order.userId)),
  }));
  res.json({ orders, count: orders.length });
});

// VULN[BFLA - Referer-based authorization]: hanya header Referer yang dicek.
// Header ini dapat dipalsukan lewat Burp/curl. Data CSV berisi email pelanggan.
// FIX: pakai role admin dari token; Referer tidak dipercaya.
router.get(
  '/reports/export',
  requireAuth,
  refererGuard({ requiredPath: '/admin' }),
  (req, res) => {
    const db = req.app.locals.db;
    const rows = [['order_id', 'customer', 'email', 'status', 'total']];
    for (const order of db.listOrders()) {
      const customer = db.findUserById(order.userId);
      rows.push([
        order.id,
        customer ? customer.name : '-',
        customer ? customer.email : '-',
        order.status,
        order.total,
      ]);
    }
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nusa-orders.csv"');
    return res.send(csv);
  }
);

// KONTROL NEGATIF — selalu 403 untuk non-admin, bahkan di lab yang seluruh
// guard lainnya no-op. Tujuannya: endpoint tersembunyi yang berhasil ditemukan
// belum tentu rentan.
router.get(
  '/audit-log',
  requireAuth,
  requireRoleStrict('admin'),
  (req, res) => {
    res.json({ entries: req.app.locals.db.listAuditLog() });
  }
);

module.exports = router;
