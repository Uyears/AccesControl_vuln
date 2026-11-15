'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startApp, api, login } = require('./helpers');

async function withLab(options, fn) {
  const lab = await startApp(options);
  try {
    await fn(lab);
  } finally {
    await lab.close();
  }
}

/* ------------------------------------------------------------------ */
/* Mode VULN (SECURE_MODE=false)                                       */
/* ------------------------------------------------------------------ */

test('VULN: alice bisa membaca profil bob lewat path dan query (IDOR)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const byPath = await api(lab.base, 'GET', '/api/users/1002/profile', { token: alice });
    assert.equal(byPath.status, 200);
    assert.equal(byPath.json.user.id, 1002);
    assert.equal(byPath.json.user.username, 'bob');
    assert.equal(byPath.json.user.email, 'bob@example.test');
    assert.equal(byPath.json.user.passwordHash, undefined);

    const byQuery = await api(lab.base, 'GET', '/api/users/profile?userId=1002', {
      token: alice,
    });
    assert.equal(byQuery.status, 200);
    assert.equal(byQuery.json.user.id, 1002);
  });
});

test('VULN: alice bisa membaca order bob beserta alamat pengirimannya', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'GET', '/api/orders/5002', { token: alice });

    assert.equal(res.status, 200);
    assert.equal(res.json.order.id, 5002);
    assert.equal(res.json.order.userId, 1002);
    assert.equal(res.json.address.id, 3002);
    assert.equal(res.json.address.recipient, 'Bob Santoso');
  });
});

test('VULN: alice bisa membaca tiket bob lewat path utama dan alias', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'GET', '/api/tickets/4002', { token: alice });

    assert.equal(res.status, 200);
    assert.equal(res.json.ticket.id, 4002);
    assert.equal(res.json.ticket.userId, 1002);
    assert.match(res.json.ticket.internalNotes, /bob@example\.test/);

    const alias = await api(lab.base, 'GET', '/api/support/tickets/4002', { token: alice });
    assert.equal(alias.status, 200);
    assert.equal(alias.json.ticket.id, 4002);
  });
});

test('VULN: alice bisa mengubah alamat bob (IDOR write)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const bob = await login(lab.base, 'bob', 'Password123!');

    const res = await api(lab.base, 'PATCH', '/api/addresses/3002', {
      token: alice,
      body: { id: 3002, label: 'Kantor', city: 'Bandung', postalCode: '40111' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.address.userId, 1002, 'kepemilikan alamat tidak berubah');
    assert.equal(res.json.address.city, 'Bandung');

    const bobView = await api(lab.base, 'GET', '/api/addresses/3002', { token: bob });
    assert.equal(bobView.status, 200);
    assert.equal(bobView.json.address.city, 'Bandung');
    assert.equal(bobView.json.address.postalCode, '40111');
  });
});

test('VULN: alice menaikkan role sendiri lewat mass assignment lalu memakai endpoint admin', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const escalation = await api(lab.base, 'PATCH', '/api/users/me', {
      token: alice,
      body: { name: 'Alice Prameswari', role: 'admin' },
    });
    assert.equal(escalation.status, 200);
    assert.equal(escalation.json.user.role, 'admin');

    const users = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(users.status, 200);
    assert.ok(users.json.users.some((user) => user.id === 1002));

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/1002', { token: alice });
    assert.equal(deleted.status, 204);

    const after = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(after.json.users.some((user) => user.id === 1002), false);
  });
});

test('VULN: customer bisa memakai endpoint admin tanpa eskalasi role (BFLA)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const list = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(list.status, 200);
    assert.equal(list.json.count, list.json.users.length);
    assert.ok(list.json.users.some((user) => user.id === 1001));

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/2001', { token: alice });
    assert.equal(deleted.status, 204);

    const profile = await api(lab.base, 'GET', '/api/users/2001/profile', { token: alice });
    assert.equal(profile.status, 404);
  });
});

test('VULN: dua langkah role change membuat customer menjadi admin', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const created = await api(lab.base, 'POST', '/api/admin/users/1001/role-change', {
      token: alice,
      body: { role: 'admin' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.request.targetId, 1001);

    const approve = await api(
      lab.base,
      'PATCH',
      `/api/admin/role-change-requests/${created.json.request.id}/approve`,
      { token: alice, body: {} }
    );
    assert.equal(approve.status, 200);
    assert.equal(approve.json.user.role, 'admin');

    // audit-log selalu memaksa cek role, jadi ini membuktikan role benar-benar berubah.
    const audit = await api(lab.base, 'GET', '/api/admin/audit-log', { token: alice });
    assert.equal(audit.status, 200);
  });
});

test('VULN: invoice dan dokumen milik akun lain bisa dibaca, termasuk PDF', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const invoice = await api(lab.base, 'GET', '/api/invoices/7002', { token: alice });
    assert.equal(invoice.status, 200);
    assert.equal(invoice.json.invoice.userId, 1002);

    const pdf = await api(lab.base, 'GET', '/api/invoices/7002/pdf', { token: alice });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.match(pdf.text, /%PDF-1\.4/);

    const document = await api(lab.base, 'GET', '/api/documents/1/download', { token: alice });
    assert.equal(document.status, 200);
    assert.match(document.text, /KONTRAK KERJASAMA/);
  });
});

test('VULN: cookie role yang diubah membuat customer membuat produk (BFLA)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'POST', '/api/products', {
      token: alice,
      headers: { cookie: 'role=seller' },
      body: { name: 'Produk Uji', sku: 'UJI-001', price: 10000, stock: 2 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.product.sellerId, 1001);
  });
});

test('VULN: laporan admin bisa diunduh tanpa role admin', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'GET', '/api/admin/reports/export', { token: alice });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.text, /bob@example\.test/);
  });
});

test('VULN: /api/admin/audit-log tetap 403 untuk customer (kontrol negatif)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'GET', '/api/admin/audit-log', { token: alice });

    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'forbidden');
  });
});

test('VULN: endpoint admin menolak request tanpa token', async () => {
  await withLab({ secure: false }, async (lab) => {
    const res = await api(lab.base, 'GET', '/api/admin/users');
    assert.equal(res.status, 401);
    assert.equal(res.json.error, 'unauthorized');
  });
});

test('VULN: token tidak valid ditolak 401', async () => {
  await withLab({ secure: false }, async (lab) => {
    const res = await api(lab.base, 'GET', '/api/orders/5001', { token: 'bukan.token.valid' });
    assert.equal(res.status, 401);
  });
});

test('VULN: validasi penghapusan user tetap berjalan', async () => {
  await withLab({ secure: false }, async (lab) => {
    const admin = await login(lab.base, 'admin', 'Admin!2024');

    const self = await api(lab.base, 'DELETE', '/api/admin/users/9001', { token: admin });
    assert.equal(self.status, 400);

    const missing = await api(lab.base, 'DELETE', '/api/admin/users/7777', { token: admin });
    assert.equal(missing.status, 404);
  });
});

/* ------------------------------------------------------------------ */
/* Mode SECURE (SECURE_MODE=true)                                      */
/* ------------------------------------------------------------------ */

test('SECURE: IDOR horizontal ditolak 403 (profil, order, tiket, alias)', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    for (const path of [
      '/api/users/1002/profile',
      '/api/users/profile?userId=1002',
      '/api/orders/5002',
      '/api/tickets/4002',
      '/api/support/tickets/4002',
      '/api/invoices/7002',
      '/api/invoices/7002/pdf',
      '/api/documents/1/download',
    ]) {
      const res = await api(lab.base, 'GET', path, { token: alice });
      assert.equal(res.status, 403, path);
    }

    const ownOrder = await api(lab.base, 'GET', '/api/orders/5001', { token: alice });
    assert.equal(ownOrder.status, 200);
    assert.equal(ownOrder.json.order.userId, 1001);

    const ownTicket = await api(lab.base, 'GET', '/api/tickets/4001', { token: alice });
    assert.equal(ownTicket.status, 200);
  });
});

test('SECURE: IDOR write alamat ditolak 403, alamat sendiri tetap bisa diubah', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const other = await api(lab.base, 'PATCH', '/api/addresses/3002', {
      token: alice,
      body: { id: 3002, city: 'Bandung' },
    });
    assert.equal(other.status, 403);

    const own = await api(lab.base, 'PATCH', '/api/addresses/3001', {
      token: alice,
      body: { id: 3001, userId: 1002, city: 'Depok' },
    });
    assert.equal(own.status, 200);
    assert.equal(own.json.address.id, 3001);
    assert.equal(own.json.address.userId, 1001, 'userId tidak bisa diubah dari body');
    assert.equal(own.json.address.city, 'Depok');
  });
});

test('SECURE: field role diabaikan dan eskalasi tidak terjadi', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const res = await api(lab.base, 'PATCH', '/api/users/me', {
      token: alice,
      body: { name: 'Alice Prameswari', role: 'admin' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, 'customer');
    assert.equal(res.json.user.name, 'Alice Prameswari');

    const users = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(users.status, 403);

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/2001', { token: alice });
    assert.equal(deleted.status, 403);

    const admin = await login(lab.base, 'admin', 'Admin!2024');
    const check = await api(lab.base, 'GET', '/api/users/1002/profile', { token: admin });
    assert.equal(check.status, 200);
  });
});

test('SECURE: role change dan cookie role tidak menaikkan hak akses', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const created = await api(lab.base, 'POST', '/api/admin/users/1001/role-change', {
      token: alice,
      body: { role: 'admin' },
    });
    assert.equal(created.status, 403);

    const product = await api(lab.base, 'POST', '/api/products', {
      token: alice,
      headers: { cookie: 'role=seller' },
      body: { name: 'Produk Uji', sku: 'UJI-001', price: 10000, stock: 2 },
    });
    assert.equal(product.status, 403);

    const report = await api(lab.base, 'GET', '/api/admin/reports/export', {
      token: alice,
      headers: { referer: `${lab.base}/admin` },
    });
    assert.equal(report.status, 403);
  });
});

test('SECURE: admin tetap dapat mengakses endpoint admin', async () => {
  await withLab({ secure: true }, async (lab) => {
    const admin = await login(lab.base, 'admin', 'Admin!2024');

    const users = await api(lab.base, 'GET', '/api/admin/users', { token: admin });
    assert.equal(users.status, 200);
    assert.equal(users.json.count, users.json.users.length);
    assert.equal(users.json.users.some((user) => 'passwordHash' in user), false);

    const audit = await api(lab.base, 'GET', '/api/admin/audit-log', { token: admin });
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.json.entries));

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/1002', { token: admin });
    assert.equal(deleted.status, 204);

    const gone = await api(lab.base, 'GET', '/api/users/1002/profile', { token: admin });
    assert.equal(gone.status, 404);
  });
});

test('SECURE: admin boleh membaca profil siapa pun, audit-log menolak customer', async () => {
  await withLab({ secure: true }, async (lab) => {
    const admin = await login(lab.base, 'admin', 'Admin!2024');
    const profile = await api(lab.base, 'GET', '/api/users/1001/profile', { token: admin });
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.id, 1001);

    const alice = await login(lab.base, 'alice', 'Password123!');
    const audit = await api(lab.base, 'GET', '/api/admin/audit-log', { token: alice });
    assert.equal(audit.status, 403);
  });
});

/* ------------------------------------------------------------------ */
/* Registrasi dan perilaku yang sama di kedua mode                     */
/* ------------------------------------------------------------------ */

test('Kedua mode: registrasi membuat customer dan mengabaikan role dari body', async () => {
  for (const secure of [false, true]) {
    await withLab({ secure }, async (lab) => {
      const res = await api(lab.base, 'POST', '/api/auth/register', {
        body: {
          username: 'carol',
          name: 'Carol Lestari',
          email: 'carol@example.test',
          password: 'Rahasia#123',
          role: 'admin',
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.json.user.role, 'customer');
      assert.equal(res.json.user.passwordHash, undefined);

      const token = await login(lab.base, 'carol', 'Rahasia#123');
      const me = await api(lab.base, 'GET', '/api/users/me', { token });
      assert.equal(me.status, 200);
      assert.equal(me.json.user.id, 1003);
      assert.equal(me.json.user.role, 'customer');

      const duplicate = await api(lab.base, 'POST', '/api/auth/register', {
        body: {
          username: 'carol',
          name: 'Carol Lestari',
          email: 'carol2@example.test',
          password: 'Rahasia#123',
        },
      });
      assert.equal(duplicate.status, 409);
    });
  }
});

test('Kedua mode: login menolak password salah dan field kosong', async () => {
  for (const secure of [false, true]) {
    await withLab({ secure }, async (lab) => {
      const wrong = await api(lab.base, 'POST', '/api/auth/login', {
        body: { username: 'alice', password: 'salah' },
      });
      assert.equal(wrong.status, 401);
      assert.equal(wrong.json.token, undefined);

      const missing = await api(lab.base, 'POST', '/api/auth/login', { body: { username: 'alice' } });
      assert.equal(missing.status, 400);

      const malformed = await fetch(`${lab.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      });
      assert.equal(malformed.status, 400);
    });
  }
});

test('Kedua mode: order yang tidak ada menjawab 404, bukan 403', async () => {
  for (const secure of [false, true]) {
    await withLab({ secure }, async (lab) => {
      const alice = await login(lab.base, 'alice', 'Password123!');
      const res = await api(lab.base, 'GET', '/api/orders/9999', { token: alice });
      assert.equal(res.status, 404);
    });
  }
});

test('Kedua mode: endpoint API tidak dikenal menjawab JSON 404', async () => {
  for (const secure of [false, true]) {
    await withLab({ secure }, async (lab) => {
      const res = await api(lab.base, 'GET', '/api/tidak-ada');
      assert.equal(res.status, 404);
      assert.equal(res.json.error, 'not_found');
    });
  }
});
