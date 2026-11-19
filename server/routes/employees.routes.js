'use strict';

const express = require('express');
const { notFound } = require('../http');

const router = express.Router();

// VULN[missing authentication]: direktori karyawan/partner dapat dibaca tanpa
// token. GUID memang sulit ditebak, tetapi endpoint daftar membocorkan semua
// GUID beserta email dan nomor telepon.
// FIX: wajibkan token admin sebelum mengembalikan direktori.
router.get('/', (req, res) => {
  const employees = req.app.locals.db.listEmployees();
  res.json({ employees, count: employees.length });
});

router.get('/:guid', (req, res) => {
  const employee = req.app.locals.db.findEmployeeByGuid(req.params.guid);
  if (!employee) return notFound(res, 'Profil tidak ditemukan.');
  return res.json({ employee });
});

module.exports = router;
