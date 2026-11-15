'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 jam: cukup untuk sesi seminar.

/**
 * Secret dibuat acak setiap kali proses start, sehingga:
 *  - token dari sesi sebelumnya otomatis tidak berlaku (data pun ikut reset),
 *  - tidak ada secret hardcoded yang bisa dipakai ulang.
 *
 * Ini BUKAN bagian dari materi kerentanan: autentikasi di lab ini benar.
 */
function createAuth(options = {}) {
  const secret = options.secret || crypto.randomBytes(32).toString('hex');

  return {
    secret,
    ttlSeconds: TOKEN_TTL_SECONDS,

    hashPassword(plain) {
      return bcrypt.hash(plain, 10);
    },

    verifyPassword(plain, hash) {
      return bcrypt.compare(plain, hash);
    },

    signToken(user) {
      return jwt.sign(
        { username: user.username, role: user.role },
        secret,
        {
          algorithm: 'HS256',
          subject: String(user.id),
          issuer: 'nusasupply',
          expiresIn: TOKEN_TTL_SECONDS,
        }
      );
    },

    verifyToken(token) {
      return jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'nusasupply',
      });
    },
  };
}

module.exports = { createAuth, TOKEN_TTL_SECONDS };
