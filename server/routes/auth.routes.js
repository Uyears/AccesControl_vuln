'use strict';

const express = require('express');
const { badRequest, unauthorized, forbidden, sendError } = require('../http');
const { toPublicUser } = require('../db');

const router = express.Router();

// Hash dummy (bcrypt, cost 10) untuk menyamakan waktu respons saat username
// tidak ditemukan. Mencegah enumerasi akun lewat timing.
const DUMMY_HASH = '$2b$10$tXiOkeIqxFqk2.oEfCflnOd4eNBsQGMP8iLDGU.vQWHMnUacXgGPW';

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration(body) {
  const { username, password, name, email, phone } = body;
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return 'Username 3-32 karakter: huruf kecil, angka, titik, garis bawah, atau strip.';
  }
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return 'Nama harus 2-80 karakter.';
  }
  if (typeof email !== 'string' || email.length > 160 || !EMAIL_RE.test(email)) {
    return 'Alamat email tidak valid.';
  }
  if (phone !== undefined && (typeof phone !== 'string' || phone.length > 40)) {
    return 'Nomor telepon maksimal 40 karakter.';
  }
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return 'Password harus 10-128 karakter.';
  }
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'Password harus memuat huruf kecil, huruf besar, angka, dan simbol.';
  }
  return null;
}

router.post('/login', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest(res, 'Body harus berupa objek JSON.');
    }

    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return badRequest(res, 'Field username dan password wajib diisi.');
    }

    const db = req.app.locals.db;
    const auth = req.app.locals.auth;
    const user = db.findUserByUsername(username);

    const ok = await auth.verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !ok) {
      // Pesan sengaja generik: tidak mengungkap apakah username terdaftar.
      db.addAudit({
        actor: user ? user.username : 'anonymous',
        action: 'auth.login.failed',
        detail: `Percobaan login gagal untuk username ${JSON.stringify(username)}.`,
      });
      return unauthorized(res, 'Username atau password salah.');
    }

    if (user.status && user.status !== 'active') {
      return forbidden(res, 'Akun ini sedang tidak aktif. Hubungi dukungan.');
    }

    const token = auth.signToken(user);
    db.addAudit({
      actor: user.username,
      action: 'auth.login',
      detail: `Login berhasil sebagai ${user.role}.`,
    });
    // VULN[BFLA - client-controlled role]: cookie ini dapat diubah klien dan
    // dipercaya oleh endpoint seller/settings. Role yang benar ada di req.user.
    res.cookie('role', user.role, { sameSite: 'lax', path: '/' });

    return res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: auth.ttlSeconds,
      user: toPublicUser(user),
    });
  } catch (err) {
    return next(err);
  }
});
router.post('/register', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest(res, 'Body harus berupa objek JSON.');
    }
    if (req.app.locals.db.getSettings().allowRegistration !== true) {
      return forbidden(res, 'Pendaftaran akun sedang ditutup.');
    }
    const error = validateRegistration(body);
    if (error) return badRequest(res, error);

    const db = req.app.locals.db;
    const auth = req.app.locals.auth;
    const username = body.username.toLowerCase();
    const email = body.email.trim().toLowerCase();

    if (db.findUserByUsername(username)) {
      return sendError(res, 409, 'conflict', 'Username sudah dipakai.');
    }
    if (db.users.some((user) => user.email.toLowerCase() === email)) {
      return sendError(res, 409, 'conflict', 'Email sudah dipakai.');
    }

    const passwordHash = await auth.hashPassword(body.password);
    const user = db.createUser({
      username,
      passwordHash,
      name: body.name.trim(),
      email,
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    });
    db.addAudit({
      actor: user.username,
      action: 'auth.register',
      detail: `Akun customer ${user.id} dibuat.`,
    });

    const token = auth.signToken(user);
    res.cookie('role', user.role, { sameSite: 'lax', path: '/' });
    return res.status(201).json({
      token,
      tokenType: 'Bearer',
      expiresIn: auth.ttlSeconds,
      user: toPublicUser(user),
    });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;
