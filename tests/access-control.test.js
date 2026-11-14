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

test('VULN: alice bisa membaca profil bob (IDOR horizontal)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'GET', '/api/users/1002/profile', { token: alice });

    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, 1002);
    assert.equal(res.json.user.username, 'bob');
    assert.equal(res.json.user.email, 'bob@example.test');
    assert.equal(res.json.user.passwordHash, undefined);
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

test('VULN: alice bisa membaca tiket dian, termasuk internal notes', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');
    const res = await api(lab.base, 'GET', '/api/tickets/4003', { token: alice });

    assert.equal(res.status, 200);
    assert.equal(res.json.ticket.id, 4003);
    assert.equal(res.json.ticket.userId, 2001);
    assert.match(res.json.ticket.internalNotes, /Kaliurang/);
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

    // Bukti perubahan persisten dan terlihat oleh pemilik asli.
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

    // Token yang sama langsung berlaku sebagai admin (guard membaca store).
    const users = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(users.status, 200);
    assert.ok(users.json.users.some((user) => user.id === 2001));

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/2001', { token: alice });
    assert.equal(deleted.status, 204);

    const after = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(after.status, 200);
    assert.equal(after.json.users.some((user) => user.id === 2001), false);
  });
});

test('VULN: customer bisa memakai endpoint admin tanpa eskalasi role (BFLA)', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const list = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(list.status, 200);
    assert.equal(list.json.count, 4);

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/2001', { token: alice });
    assert.equal(deleted.status, 204);

    const profile = await api(lab.base, 'GET', '/api/users/2001/profile', { token: alice });
    assert.equal(profile.status, 404);
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

test('SECURE: IDOR horizontal ditolak 403 (profil, order, tiket)', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await login(lab.base, 'alice', 'Password123!');

    const profile = await api(lab.base, 'GET', '/api/users/1002/profile', { token: alice });
    assert.equal(profile.status, 403);

    const order = await api(lab.base, 'GET', '/api/orders/5002', { token: alice });
    assert.equal(order.status, 403);

    const ticket = await api(lab.base, 'GET', '/api/tickets/4003', { token: alice });
    assert.equal(ticket.status, 403);

    // Resource milik sendiri tetap bisa diakses.
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

    // Data target tetap ada.
    const admin = await login(lab.base, 'admin', 'Admin!2024');
    const check = await api(lab.base, 'GET', '/api/users/2001/profile', { token: admin });
    assert.equal(check.status, 200);
  });
});

test('SECURE: admin tetap dapat mengakses endpoint admin', async () => {
  await withLab({ secure: true }, async (lab) => {
    const admin = await login(lab.base, 'admin', 'Admin!2024');

    const users = await api(lab.base, 'GET', '/api/admin/users', { token: admin });
    assert.equal(users.status, 200);
    assert.equal(users.json.count, 4);
    assert.equal(users.json.users.some((user) => 'passwordHash' in user), false);

    const audit = await api(lab.base, 'GET', '/api/admin/audit-log', { token: admin });
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.json.entries));

    const deleted = await api(lab.base, 'DELETE', '/api/admin/users/2001', { token: admin });
    assert.equal(deleted.status, 204);

    const gone = await api(lab.base, 'GET', '/api/users/2001/profile', { token: admin });
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
/* Perilaku yang sama di kedua mode                                    */
/* ------------------------------------------------------------------ */

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
