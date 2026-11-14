'use strict';

const express = require('express');
const { badRequest, unauthorized } = require('../http');
const { toPublicUser } = require('../db');

const router = express.Router();

// Hash dummy (bcrypt, cost 10) untuk menyamakan waktu respons saat username
// tidak ditemukan. Mencegah enumerasi akun lewat timing.
const DUMMY_HASH = '$2b$10$tXiOkeIqxFqk2.oEfCflnOd4eNBsQGMP8iLDGU.vQWHMnUacXgGPW';

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

    const token = auth.signToken(user);
    db.addAudit({
      actor: user.username,
      action: 'auth.login',
      detail: `Login berhasil sebagai ${user.role}.`,
    });

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

module.exports = router;
