'use strict';

/**
 * Inventaris OpenAPI untuk seluruh route API.
 *
 * Dokumen ini sengaja lengkap: peserta memakai `/openapi.json` sebagai bahan
 * recon untuk menemukan endpoint yang tidak ditautkan dari UI. Dokumen ini
 * hanya menyatakan bentuk API, bukan status otorisasinya.
 */

const TAGS = [
  { name: 'Public' },
  { name: 'Auth' },
  { name: 'Account' },
  { name: 'Commerce' },
  { name: 'Seller' },
  { name: 'Support' },
  { name: 'Documents' },
  { name: 'Admin' },
];

function pathParam(name, description) {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'integer' },
  };
}

function queryParam(name, description, schema = { type: 'string' }) {
  return { name, in: 'query', required: false, description, schema };
}

function op(tag, summary, { description, parameters, requestBody, responses, deprecated, public: isPublic } = {}) {
  const operation = {
    tags: [tag],
    summary,
    responses: responses || { 200: { description: 'OK' } },
  };
  if (description) operation.description = description;
  if (parameters && parameters.length) operation.parameters = parameters;
  if (requestBody) operation.requestBody = requestBody;
  if (deprecated) operation.deprecated = true;
  if (isPublic) operation.security = [];
  return operation;
}

const jsonBody = (schema) => ({
  required: true,
  content: { 'application/json': { schema } },
});

const userRef = { $ref: '#/components/schemas/User' };

function buildOpenApi({ port = 3000 } = {}) {
  const userSummary = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      username: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      role: { type: 'string', enum: ['customer', 'seller', 'admin'] },
      status: { type: 'string', enum: ['active', 'suspended'] },
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
        'Inventaris endpoint API internal toko Nusa Supply. Gunakan bearer token dari /api/auth/login untuk endpoint yang memerlukan autentikasi.',
    },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    tags: TAGS,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        User: userSummary,
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string', format: 'password' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['username', 'password', 'name', 'email'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string', format: 'password' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
          },
        },
        ProfilePatch: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            role: { type: 'string', enum: ['customer', 'seller', 'admin'] },
          },
        },
        Address: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            label: { type: 'string' },
            recipient: { type: 'string' },
            phone: { type: 'string' },
            line1: { type: 'string' },
            city: { type: 'string' },
            province: { type: 'string' },
            postalCode: { type: 'string' },
          },
        },
        TicketMessageRequest: {
          type: 'object',
          required: ['body'],
          properties: { body: { type: 'string', maxLength: 2000 } },
        },
        StatusPatch: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'suspended'] },
          },
        },
        RoleChangeRequest: {
          type: 'object',
          required: ['role'],
          properties: {
            role: { type: 'string', enum: ['customer', 'seller', 'admin'] },
          },
        },
        SettingsPatch: {
          type: 'object',
          properties: {
            maintenanceMode: { type: 'boolean' },
            allowRegistration: { type: 'boolean' },
            supportEmail: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/health': {
        get: op('Public', 'Status kesehatan server', { public: true }),
      },
      '/api/auth/login': {
        post: op('Auth', 'Login dan terbitkan bearer token', {
          public: true,
          requestBody: jsonBody({ $ref: '#/components/schemas/LoginRequest' }),
          responses: {
            200: { description: 'Token dan profil user' },
            401: { description: 'Kredensial salah' },
            403: { description: 'Akun tidak aktif' },
          },
        }),
      },
      '/api/auth/register': {
        post: op('Auth', 'Registrasi akun pelanggan', {
          public: true,
          requestBody: jsonBody({ $ref: '#/components/schemas/RegisterRequest' }),
          responses: { 201: { description: 'Akun dibuat' }, 409: { description: 'Username sudah dipakai' } },
        }),
      },
      '/api/users/me': {
        get: op('Account', 'Profil user yang sedang login'),
        patch: op('Account', 'Perbarui profil user yang sedang login', {
          requestBody: jsonBody({ $ref: '#/components/schemas/ProfilePatch' }),
        }),
      },
      '/api/users/profile': {
        get: op('Account', 'Profil user berdasarkan query userId', {
          parameters: [queryParam('userId', 'ID user; default user yang login', { type: 'integer' })],
        }),
      },
      '/api/users/{id}/profile': {
        get: op('Account', 'Profil user berdasarkan path', {
          parameters: [pathParam('id', 'ID user')],
        }),
      },
      '/api/addresses': {
        get: op('Commerce', 'Daftar alamat user yang sedang login'),
        post: op('Commerce', 'Tambah alamat', {
          requestBody: jsonBody({
            type: 'object',
            required: ['recipient', 'phone', 'line1', 'city', 'province', 'postalCode'],
            properties: {
              label: { type: 'string' },
              recipient: { type: 'string' },
              phone: { type: 'string' },
              line1: { type: 'string' },
              city: { type: 'string' },
              province: { type: 'string' },
              postalCode: { type: 'string' },
            },
          }),
          responses: { 201: { description: 'Alamat dibuat' } },
        }),
      },
      '/api/addresses/{id}': {
        get: op('Commerce', 'Detail alamat', { parameters: [pathParam('id', 'ID alamat')] }),
        patch: op('Commerce', 'Ubah alamat', {
          parameters: [pathParam('id', 'ID alamat')],
          requestBody: jsonBody({ $ref: '#/components/schemas/Address' }),
        }),
      },
      '/api/orders': {
        get: op('Commerce', 'Daftar order milik user yang login'),
      },
      '/api/orders/{id}': {
        get: op('Commerce', 'Detail order', { parameters: [pathParam('id', 'ID order')] }),
        patch: op('Commerce', 'Ubah status atau alamat pengiriman order', {
          parameters: [pathParam('id', 'ID order')],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              status: { type: 'string' },
              addressId: { type: 'integer' },
            },
          }),
        }),
      },
      '/api/tickets': {
        get: op('Support', 'Daftar tiket milik user yang login'),
      },
      '/api/tickets/{id}': {
        get: op('Support', 'Detail tiket dan percakapan', {
          parameters: [pathParam('id', 'ID tiket')],
        }),
      },
      '/api/tickets/{id}/messages': {
        post: op('Support', 'Kirim balasan pada tiket', {
          parameters: [pathParam('id', 'ID tiket')],
          requestBody: jsonBody({ $ref: '#/components/schemas/TicketMessageRequest' }),
          responses: { 201: { description: 'Pesan ditambahkan' } },
        }),
      },
      '/api/support/tickets': {
        get: op('Support', 'Alias lama daftar tiket', { deprecated: true }),
      },
      '/api/support/tickets/{id}': {
        get: op('Support', 'Alias lama detail tiket', {
          deprecated: true,
          parameters: [pathParam('id', 'ID tiket')],
        }),
      },
      '/api/support/tickets/{id}/messages': {
        post: op('Support', 'Alias lama balasan tiket', {
          deprecated: true,
          parameters: [pathParam('id', 'ID tiket')],
          requestBody: jsonBody({ $ref: '#/components/schemas/TicketMessageRequest' }),
          responses: { 201: { description: 'Pesan ditambahkan' } },
        }),
      },
      '/api/products': {
        get: op('Commerce', 'Katalog produk', {
          public: true,
          parameters: [
            queryParam('category', 'Filter kategori'),
            queryParam('sellerId', 'Filter penjual', { type: 'integer' }),
            queryParam('q', 'Pencarian teks'),
          ],
        }),
        post: op('Seller', 'Buat produk baru', {
          requestBody: jsonBody({
            type: 'object',
            required: ['name', 'category', 'price'],
            properties: {
              name: { type: 'string' },
              sku: { type: 'string' },
              category: { type: 'string' },
              price: { type: 'integer' },
              description: { type: 'string' },
              stock: { type: 'integer' },
            },
          }),
          responses: { 201: { description: 'Produk dibuat' } },
        }),
      },
      '/api/products/{id}': {
        get: op('Commerce', 'Detail produk', {
          public: true,
          parameters: [pathParam('id', 'ID produk')],
        }),
        patch: op('Seller', 'Ubah produk', {
          parameters: [pathParam('id', 'ID produk')],
          requestBody: jsonBody({ type: 'object' }),
        }),
        delete: op('Seller', 'Nonaktifkan produk', {
          parameters: [pathParam('id', 'ID produk')],
          responses: { 204: { description: 'Produk dinonaktifkan' } },
        }),
      },
      '/api/seller/products': {
        get: op('Seller', 'Daftar seluruh produk termasuk yang nonaktif'),
      },
      '/api/seller/summary': {
        get: op('Seller', 'Ringkasan penjualan penjual'),
      },
      '/api/cart': {
        get: op('Commerce', 'Isi keranjang user yang login'),
      },
      '/api/cart/items': {
        post: op('Commerce', 'Tambah produk ke keranjang', {
          requestBody: jsonBody({
            type: 'object',
            required: ['productId', 'qty'],
            properties: {
              productId: { type: 'integer' },
              qty: { type: 'integer', minimum: 1 },
            },
          }),
        }),
      },
      '/api/cart/items/{productId}': {
        patch: op('Commerce', 'Ubah jumlah produk di keranjang', {
          parameters: [pathParam('productId', 'ID produk')],
          requestBody: jsonBody({
            type: 'object',
            required: ['qty'],
            properties: { qty: { type: 'integer', minimum: 1 } },
          }),
        }),
        delete: op('Commerce', 'Hapus produk dari keranjang', {
          parameters: [pathParam('productId', 'ID produk')],
          responses: { 204: { description: 'Item dihapus' } },
        }),
      },
      '/api/cart/checkout': {
        post: op('Commerce', 'Checkout keranjang menjadi order', {
          requestBody: jsonBody({
            type: 'object',
            required: ['addressId'],
            properties: { addressId: { type: 'integer' } },
          }),
          responses: { 201: { description: 'Order dibuat' } },
        }),
      },
      '/api/invoices': {
        get: op('Commerce', 'Daftar invoice milik user yang login'),
      },
      '/api/invoices/{id}': {
        get: op('Commerce', 'Detail invoice', {
          parameters: [pathParam('id', 'ID invoice')],
        }),
      },
      '/api/invoices/{id}/pdf': {
        get: op('Commerce', 'Unduh invoice sebagai PDF', {
          parameters: [pathParam('id', 'ID invoice')],
          responses: {
            200: {
              description: 'Berkas PDF',
              content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
            },
          },
        }),
      },
      '/api/documents': {
        get: op('Documents', 'Daftar dokumen dan folder milik user yang login'),
        post: op('Documents', 'Unggah dokumen ke folder', {
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file', 'folderId'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    folderId: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Dokumen dibuat' } },
        }),
      },
      '/api/documents/{id}': {
        get: op('Documents', 'Metadata dokumen', {
          parameters: [pathParam('id', 'ID dokumen')],
        }),
      },
      '/api/documents/{id}/download': {
        get: op('Documents', 'Unduh isi dokumen', {
          parameters: [pathParam('id', 'ID dokumen')],
          responses: {
            200: {
              description: 'Isi berkas',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
          },
        }),
      },
      '/api/company/invoices': {
        get: op('Public', 'Daftar tagihan seluruh pelanggan', { public: true }),
      },
      '/api/employees': {
        get: op('Public', 'Direktori karyawan dan partner', { public: true }),
      },
      '/api/employees/{guid}': {
        get: op('Public', 'Profil karyawan berdasarkan GUID', {
          public: true,
          parameters: [
            {
              name: 'guid',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
        }),
      },
      '/api/articles': {
        get: op('Public', 'Daftar artikel', { public: true }),
      },
      '/api/articles/{slug}': {
        get: op('Public', 'Detail artikel', {
          public: true,
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
          ],
        }),
      },
      '/api/admin/users': {
        get: op('Admin', 'Daftar seluruh akun'),
      },
      '/api/admin/users/{id}': {
        patch: op('Admin', 'Ubah status akun', {
          parameters: [pathParam('id', 'ID user')],
          requestBody: jsonBody({ $ref: '#/components/schemas/StatusPatch' }),
        }),
        delete: op('Admin', 'Hapus akun', {
          parameters: [pathParam('id', 'ID user')],
          responses: { 204: { description: 'Akun dihapus' } },
        }),
      },
      '/api/admin/users/{id}/role-change': {
        post: op('Admin', 'Ajukan perubahan role user', {
          parameters: [pathParam('id', 'ID user')],
          requestBody: jsonBody({ $ref: '#/components/schemas/RoleChangeRequest' }),
          responses: { 201: { description: 'Permintaan dibuat' } },
        }),
      },
      '/api/admin/role-change-requests': {
        get: op('Admin', 'Daftar permintaan perubahan role'),
      },
      '/api/admin/role-change-requests/{id}/approve': {
        patch: op('Admin', 'Setujui permintaan perubahan role', {
          parameters: [pathParam('id', 'ID permintaan')],
        }),
      },
      '/api/admin/settings': {
        get: op('Admin', 'Baca pengaturan operasional'),
        patch: op('Admin', 'Ubah pengaturan operasional', {
          requestBody: jsonBody({ $ref: '#/components/schemas/SettingsPatch' }),
        }),
      },
      '/api/admin/stats': {
        get: op('Admin', 'Statistik operasional'),
      },
      '/api/admin/orders': {
        get: op('Admin', 'Daftar seluruh order'),
      },
      '/api/admin/reports/export': {
        get: op('Admin', 'Ekspor laporan order sebagai CSV', {
          responses: {
            200: {
              description: 'Berkas CSV',
              content: { 'text/csv': { schema: { type: 'string' } } },
            },
          },
        }),
      },
      '/api/admin/audit-log': {
        get: op('Admin', 'Audit log operasional'),
      },
    },
  };
}

module.exports = { buildOpenApi };
