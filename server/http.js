'use strict';

/**
 * Utilitas respons error. Semua error API memakai bentuk yang konsisten:
 *   { "error": "<kode>", "message": "<pesan manusiawi>" }
 *
 * Catatan: pesan sengaja tidak membocorkan apakah sebuah resource ada atau
 * tidak ketika akses ditolak, kecuali untuk 404 murni.
 */

function sendError(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

function badRequest(res, message = 'Permintaan tidak valid.') {
  return sendError(res, 400, 'bad_request', message);
}

function unauthorized(res, message = 'Autentikasi diperlukan untuk mengakses resource ini.') {
  return sendError(res, 401, 'unauthorized', message);
}

function forbidden(res, message = 'Anda tidak memiliki izin untuk mengakses resource ini.') {
  return sendError(res, 403, 'forbidden', message);
}

function notFound(res, message = 'Resource tidak ditemukan.') {
  return sendError(res, 404, 'not_found', message);
}

module.exports = { sendError, badRequest, unauthorized, forbidden, notFound };
