'use strict';

const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { requireAuth, ownerOnly } = require('../authz');
const { badRequest, notFound } = require('../http');
const { toDocument } = require('../db');

const router = express.Router();

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.log']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return callback(new Error('Hanya file teks (.txt, .md, .csv, .log) yang diterima.'));
    }
    return callback(null, true);
  },
});

function resolveDocumentOwner(req) {
  const document = req.app.locals.db.findDocument(req.params.id);
  return document ? document.ownerId : undefined;
}

router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documents = db.listDocumentsByOwner(req.user.id).map(toDocument);
  const folders = db.listFoldersByOwner(req.user.id);
  res.json({ documents, folders });
});

// VULN[IDOR/BOLA]: dokumen milik partner lain bisa dibaca dengan id berurutan.
// FIX: ownerOnly() memeriksa ownerId dokumen.
router.get(
  '/:id',
  requireAuth,
  ownerOnly(resolveDocumentOwner, { allowAdmin: true }),
  (req, res) => {
    const document = req.app.locals.db.findDocument(req.params.id);
    if (!document) return notFound(res, 'Dokumen tidak ditemukan.');
    return res.json({ document: toDocument(document) });
  }
);

// VULN[IDOR/BOLA - file download]: isi file ikut terbaca tanpa cek pemilik.
router.get(
  '/:id/download',
  requireAuth,
  ownerOnly(resolveDocumentOwner, { allowAdmin: true }),
  (req, res) => {
    const db = req.app.locals.db;
    const document = db.findDocument(req.params.id);
    if (!document) return notFound(res, 'Dokumen tidak ditemukan.');

    const content = db.getDocumentContent(document.id);
    if (!content) return notFound(res, 'File dokumen tidak tersedia.');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.attachment(document.filename);
    return res.send(content);
  }
);

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return badRequest(res, 'File wajib diunggah pada field `file`.');

  const folderId = Number(req.body && req.body.folderId);
  const folder = db.findFolder(folderId);
  if (!folder) return notFound(res, 'Folder dokumen tidak ditemukan.');

  // VULN[BOLA/IDOR - write]: upload ke folder milik partner lain diizinkan.
  // FIX: folder harus milik user yang terautentikasi.

  const extension = path.extname(req.file.originalname).toLowerCase();
  const document = db.createDocument({
    ownerId: req.user.id,
    folderId: folder.id,
    filename: path.basename(req.file.originalname).slice(0, 160) || `dokumen${extension}`,
    mime: req.file.mimetype || 'text/plain',
    size: req.file.size,
    content: req.file.buffer,
  });

  db.addAudit({
    actor: req.user.username,
    action: 'document.upload',
    detail: `Dokumen ${document.id} diunggah ke folder ${folder.id}.`,
  });

  return res.status(201).json({ document: toDocument(document) });
});

module.exports = router;
