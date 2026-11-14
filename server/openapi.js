'use strict';

/**
 * Dokumen OpenAPI parsial — sengaja tidak lengkap.
 * Bahan recon: peserta bisa menemukan endpoint admin dari sini atau dari
 * bundle JavaScript frontend. Tidak semua route didokumentasikan.
 */

function buildOpenApi({ port = 3000 } = {}) {
  const userSummary = {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1001 },
      username: { type: 'string', example: 'alice' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      role: { type: 'string', enum: ['customer', 'admin'] },
      loyaltyTier: { type: 'string' },
      joinedAt: { type: 'string' },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'Nusa Supply API',
      version: '1.0.0',
      description:
        'API internal toko Nusa Supply. Dokumen ini tidak lengkap dan hanya memuat sebagian endpoint.',
    },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        User: userSummary,
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/auth/login': {
        post: {
          security: [],
          summary: 'Login dan dapatkan bearer token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'alice' },
                    password: { type: 'string', example: 'Password123!' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Token dan profil user' },
            401: { description: 'Kredensial salah' },
          },
        },
      },
      '/api/users/me': {
        get: { summary: 'Profil user yang sedang login', responses: { 200: { description: 'OK' } } },
        patch: {
          summary: 'Perbarui profil user yang sedang login',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profil terbaru' } },
        },
      },
      '/api/users/{id}/profile': {
        get: {
          summary: 'Profil user berdasarkan id',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
        },
      },
      '/api/orders': {
        get: { summary: 'Daftar order milik user yang login', responses: { 200: { description: 'OK' } } },
      },
      '/api/orders/{id}': {
        get: {
          summary: 'Detail order',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'OK' }, 404: { description: 'Tidak ditemukan' } },
        },
      },
      '/api/addresses/{id}': {
        patch: {
          summary: 'Perbarui alamat pengiriman',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    recipient: { type: 'string' },
                    line1: { type: 'string' },
                    city: { type: 'string' },
                    postalCode: { type: 'string' },
                    phone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Alamat terbaru' } },
        },
      },
      '/api/tickets/{id}': {
        get: {
          summary: 'Detail tiket support',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'OK' } },
        },
      },
      '/api/admin/users': {
        get: {
          summary: 'Daftar seluruh user (operasional)',
          'x-internal': true,
          responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden' } },
        },
      },
      '/api/admin/users/{id}': {
        delete: {
          summary: 'Hapus akun user (operasional)',
          'x-internal': true,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 204: { description: 'Dihapus' }, 403: { description: 'Forbidden' } },
        },
      },
      '/api/admin/audit-log': {
        get: {
          summary: 'Audit log operasional',
          'x-internal': true,
          responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden' } },
        },
      },
    },
  };
}

module.exports = { buildOpenApi };
