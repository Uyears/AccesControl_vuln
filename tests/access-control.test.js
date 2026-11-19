'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, api, loginSeed } = require('./helpers');

test('customer bisa membaca profil customer lain lewat path dan query (IDOR)', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const byPath = await api(lab.base, 'GET', '/api/users/1002/profile', { token });
    assert.equal(byPath.status, 200);
    assert.equal(byPath.json.user.id, 1002);
    assert.equal(byPath.json.user.username, 'bob');
    assert.equal(byPath.json.user.email, 'bob@example.test');

    const byQuery = await api(lab.base, 'GET', '/api/users/profile?userId=1002', { token });
    assert.equal(byQuery.status, 200);
    assert.equal(byQuery.json.user.id, 1002);
  } finally {
    await lab.close();
  }
});

test('customer bisa membaca order customer lain beserta alamat pengirimannya', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');
    const response = await api(lab.base, 'GET', '/api/orders/5002', { token });

    assert.equal(response.status, 200);
    assert.equal(response.json.order.id, 5002);
    assert.equal(response.json.order.userId, 1002);
    assert.equal(response.json.address.userId, 1002);
  } finally {
    await lab.close();
  }
});

test('customer bisa membaca tiket customer lain lewat path utama dan alias', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    for (const basePath of ['/api/tickets', '/api/support/tickets']) {
      const response = await api(lab.base, 'GET', `${basePath}/4002`, { token });
      assert.equal(response.status, 200, basePath);
      assert.equal(response.json.ticket.id, 4002);
      assert.equal(response.json.ticket.userId, 1002);
    }
  } finally {
    await lab.close();
  }
});

test('customer bisa mengubah alamat customer lain (IDOR write)', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');
    const response = await api(lab.base, 'PATCH', '/api/addresses/3002', {
      token,
      body: {
        label: 'Alamat diubah alice',
        recipient: 'Bob Diubah',
        line1: 'Jl. Contoh No. 99',
        city: 'Bandung',
        postalCode: '40123',
        phone: '081200000000',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.address.userId, 1002);
    assert.equal(response.json.address.recipient, 'Bob Diubah');

    const reread = await api(lab.base, 'GET', '/api/addresses/3002', { token });
    assert.equal(reread.status, 200);
    assert.equal(reread.json.address.recipient, 'Bob Diubah');
  } finally {
    await lab.close();
  }
});

test('customer menaikkan role sendiri lewat mass assignment lalu memakai endpoint admin', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const escalation = await api(lab.base, 'PATCH', '/api/users/me', {
      token,
      body: { name: 'Alice', role: 'admin' },
    });
    assert.equal(escalation.status, 200);
    assert.equal(escalation.json.user.role, 'admin');

    const adminRead = await api(lab.base, 'GET', '/api/admin/users', { token });
    assert.equal(adminRead.status, 200);
    assert.ok(adminRead.json.users.length >= 6);
  } finally {
    await lab.close();
  }
});

test('customer memakai endpoint admin tanpa eskalasi role (BFLA)', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const users = await api(lab.base, 'GET', '/api/admin/users', { token });
    assert.equal(users.status, 200);
    assert.ok(users.json.users.some((user) => user.username === 'bob'));

    const remove = await api(lab.base, 'DELETE', '/api/admin/users/2001', { token });
    assert.equal(remove.status, 204);

    const after = await api(lab.base, 'GET', '/api/admin/users', { token });
    assert.equal(after.json.users.some((user) => user.id === 2001), false);
  } finally {
    await lab.close();
  }
});

test('dua langkah role change membuat customer menjadi admin', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const created = await api(lab.base, 'POST', '/api/admin/users/1001/role-change', {
      token,
      body: { role: 'admin' },
    });
    assert.equal(created.status, 201);

    const approved = await api(
      lab.base,
      'PATCH',
      `/api/admin/role-change-requests/${created.json.request.id}/approve`,
      { token }
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.json.user.id, 1001);
    assert.equal(approved.json.user.role, 'admin');

    const adminRead = await api(lab.base, 'GET', '/api/admin/users', { token });
    assert.equal(adminRead.status, 200);
  } finally {
    await lab.close();
  }
});

test('invoice, PDF, dan dokumen milik akun lain bisa dibaca', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const invoice = await api(lab.base, 'GET', '/api/invoices/7002', { token });
    assert.equal(invoice.status, 200);
    assert.equal(invoice.json.invoice.userId, 1002);

    const pdf = await api(lab.base, 'GET', '/api/invoices/7002/pdf', { token });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.match(pdf.text || '', /^%PDF-/);

    const document = await api(lab.base, 'GET', '/api/documents/1', { token });
    assert.equal(document.status, 200);
    assert.equal(document.json.document.ownerId, 8001);

    const download = await api(lab.base, 'GET', '/api/documents/1/download', { token });
    assert.equal(download.status, 200);
    assert.ok(download.text.length > 0);
  } finally {
    await lab.close();
  }
});

test('cookie role yang diubah klien membuka panel seller dan settings admin', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const sellerProducts = await api(lab.base, 'GET', '/api/seller/products', {
      token,
      headers: { cookie: 'role=seller' },
    });
    assert.equal(sellerProducts.status, 200);
    assert.ok(sellerProducts.json.products.length > 0);

    const created = await api(lab.base, 'POST', '/api/products', {
      token,
      headers: { cookie: 'role=seller' },
      body: {
        name: 'Produk Uji',
        sku: 'TEST-ALICE-1',
        description: 'Dibuat customer dengan cookie seller.',
        category: 'Uji',
        price: 10000,
        stock: 1,
        tone: 'slate',
      },
    });
    assert.equal(created.status, 201);

    const settings = await api(lab.base, 'GET', '/api/admin/settings', {
      token,
      headers: { cookie: 'role=admin' },
    });
    assert.equal(settings.status, 200);
    assert.ok(settings.json.settings);
  } finally {
    await lab.close();
  }
});

test('laporan admin terbuka dengan Referer palsu dan statistik admin bisa dibaca', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const report = await api(lab.base, 'GET', '/api/admin/reports/export', {
      token,
      headers: { referer: 'http://127.0.0.1/admin' },
    });
    assert.equal(report.status, 200);
    assert.match(report.headers.get('content-type'), /text\/csv/);
    assert.match(report.text, /Order|order/);

    const stats = await api(lab.base, 'GET', '/api/admin/stats', { token });
    assert.equal(stats.status, 200);
    assert.ok(stats.json.stats);
  } finally {
    await lab.close();
  }
});

test('audit-log adalah kontrol negatif: selalu 403 untuk customer, 200 untuk admin', async () => {
  const lab = await startApp();
  try {
    const customer = await loginSeed(lab, 'alice');
    const admin = await loginSeed(lab, 'admin');

    const denied = await api(lab.base, 'GET', '/api/admin/audit-log', { token: customer });
    assert.equal(denied.status, 403);

    const allowed = await api(lab.base, 'GET', '/api/admin/audit-log', { token: admin });
    assert.equal(allowed.status, 200);
    assert.ok(Array.isArray(allowed.json.entries));
  } finally {
    await lab.close();
  }
});

test('tanpa token atau dengan token tidak valid tetap 401', async () => {
  const lab = await startApp();
  try {
    const missing = await api(lab.base, 'GET', '/api/admin/users');
    assert.equal(missing.status, 401);

    const invalid = await api(lab.base, 'GET', '/api/orders/5001', {
      token: 'token.palsu.tidak.valid',
    });
    assert.equal(invalid.status, 401);
  } finally {
    await lab.close();
  }
});

test('registrasi membuat customer dan mengabaikan role dari body', async () => {
  const lab = await startApp();
  try {
    const registered = await api(lab.base, 'POST', '/api/auth/register', {
      body: {
        username: 'baru.customer',
        name: 'Customer Baru',
        email: 'baru@example.test',
        password: 'Rahasia#12345',
        role: 'admin',
      },
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.json.user.role, 'customer');
    assert.equal('passwordHash' in registered.json.user, false);
  } finally {
    await lab.close();
  }
});

test('resource yang tidak ada menjawab 404, bukan 403', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');
    const response = await api(lab.base, 'GET', '/api/orders/999999', { token });
    assert.equal(response.status, 404);
  } finally {
    await lab.close();
  }
});
