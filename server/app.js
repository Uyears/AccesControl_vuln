'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { createAuth } = require('./auth');
const { createDb } = require('./db');
const { sendError } = require('./http');
const { buildOpenApi } = require('./openapi');

const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

/**
 * Factory aplikasi. Setiap pemanggilan mendapat store dan JWT secret sendiri,
 * sehingga tes bisa menjalankan dua instance (VULN dan SECURE) sekaligus tanpa
 * saling mempengaruhi.
 */
function createApp({ secure = false, port = 3000 } = {}) {
  const app = express();

  app.locals.secure = secure === true;
  app.locals.db = createDb();
  app.locals.auth = createAuth();

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
    });
  });

  app.get('/openapi.json', (req, res) => {
    res.json(buildOpenApi({ port }));
  });

  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/users', require('./routes/users.routes'));
  app.use('/api/addresses', require('./routes/addresses.routes'));
  app.use('/api/orders', require('./routes/orders.routes'));
  app.use('/api/tickets', require('./routes/tickets.routes'));
  app.use('/api/support/tickets', require('./routes/tickets.routes'));
  app.use('/api/products', require('./routes/products.routes'));
  app.use('/api/seller', require('./routes/seller.routes'));
  app.use('/api/cart', require('./routes/cart.routes'));
  app.use('/api/invoices', require('./routes/invoices.routes'));
  app.use('/api/documents', require('./routes/documents.routes'));
  app.use('/api/company', require('./routes/company.routes'));
  app.use('/api/employees', require('./routes/employees.routes'));
  app.use('/api/articles', require('./routes/articles.routes'));
  app.use('/api/admin', require('./routes/admin.routes'));

  // Route API yang tidak dikenal tetap menjawab JSON 404, bukan index.html.
  app.use('/api', (req, res) => {
    sendError(res, 404, 'not_found', 'Endpoint API tidak ditemukan.');
  });

  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(
      express.static(PUBLIC_DIR, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
        },
      })
    );
  }

  // SPA fallback: semua GET non-API dilayani index.html (kecuali aset statis).
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!fs.existsSync(INDEX_HTML)) {
      return res
        .status(503)
        .type('text/plain; charset=utf-8')
        .send(
          'Frontend belum dibangun.\n\nJalankan "npm run build" lalu buka http://127.0.0.1:3000\n' +
            'Untuk pengembangan: "npm run dev:client" (Vite) + "npm run dev:server".\n'
        );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(INDEX_HTML);
  });

  // Error handler terakhir: body JSON rusak, payload terlalu besar, dll.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return sendError(res, 400, 'bad_request', 'Body JSON tidak valid.');
    }
    if (err && err.type === 'entity.too.large') {
      return sendError(res, 413, 'payload_too_large', 'Body permintaan terlalu besar.');
    }
    if (err && err.name === 'MulterError') {
      return sendError(res, 400, 'bad_request', `Upload ditolak: ${err.message}.`);
    }
    if (err && typeof err.message === 'string' && err.message.startsWith('Hanya file teks')) {
      return sendError(res, 400, 'bad_request', err.message);
    }
    console.error('[bac-lab] unhandled error:', err);
    return sendError(res, 500, 'server_error', 'Terjadi kesalahan pada server.');
  });

  return app;
}

module.exports = { createApp, PUBLIC_DIR, INDEX_HTML };
