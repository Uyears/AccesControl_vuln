'use strict';

const express = require('express');
const { requireAuth, requireRole, isSecure } = require('../authz');
const { notFound } = require('../http');

const router = express.Router();

/**
 * VULN[missing authentication]: direktori karyawan/partner dapat dibaca tanpa
 * token. GUID memang sulit ditebak, tetapi endpoint daftar membocorkan semua
 * GUID beserta email dan nomor telepon.
 * FIX: SECURE mewajibkan admin.
 */
function secureAdminOnly(req, res, next) {
  if (!isSecure(req)) return next();
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    return requireRole('admin')(req, res, next);
  });
}

router.get('/', secureAdminOnly, (req, res) => {
  const employees = req.app.locals.db.listEmployees();
  res.json({ employees, count: employees.length });
});

router.get('/:guid', secureAdminOnly, (req, res) => {
  const employee = req.app.locals.db.findEmployeeByGuid(req.params.guid);
  if (!employee) return notFound(res, 'Profil tidak ditemukan.');
  return res.json({ employee });
});

module.exports = router;
