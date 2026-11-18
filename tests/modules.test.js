'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startApp, api, loginSeed } = require('./helpers');

async function withLab(options, fn) {
  const lab = await startApp(options);
  try {
    await fn(lab);
  } finally {
    await lab.close();
  }
}

async function uploadDocument(lab, token, folderId) {
  const form = new FormData();
  form.append('folderId', String(folderId));
  form.append('file', new Blob(['catatan uji otorisasi'], { type: 'text/plain' }), 'uji.txt');

  const response = await fetch(`${lab.base}/api/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

/* ------------------------------------------------------------------ */
/* Modul tambahan: endpoint tanpa autentikasi                          */
/* ------------------------------------------------------------------ */

test('VULN: company dan employee API terbuka tanpa token', async () => {
  await withLab({ secure: false }, async (lab) => {
    const invoices = await api(lab.base, 'GET', '/api/company/invoices');
    assert.equal(invoices.status, 200);
    assert.ok(invoices.json.count > 0);
    assert.ok(invoices.json.invoices[0].customer.email.endsWith('.test'));

    const employees = await api(lab.base, 'GET', '/api/employees');
    assert.equal(employees.status, 200);
    assert.ok(employees.json.count > 0);
    assert.ok(employees.json.employees[0].email.includes('@'));

    const one = await api(lab.base, 'GET', `/api/employees/${employees.json.employees[0].guid}`);
    assert.equal(one.status, 200);
    assert.equal(one.json.employee.guid, employees.json.employees[0].guid);
  });
});

test('SECURE: company dan employee API menolak tanpa token dan non-admin', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const admin = await loginSeed(lab, 'admin');

    for (const path of ['/api/company/invoices', '/api/employees']) {
      const anonymous = await api(lab.base, 'GET', path);
      assert.equal(anonymous.status, 401, path);

      const customer = await api(lab.base, 'GET', path, { token: alice });
      assert.equal(customer.status, 403, path);

      const staff = await api(lab.base, 'GET', path, { token: admin });
      assert.equal(staff.status, 200, path);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Modul tambahan: role dari cookie                                    */
/* ------------------------------------------------------------------ */

test('VULN: cookie role membuka panel penjual dan pengaturan admin', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const seller = await api(lab.base, 'GET', '/api/seller/summary', {
      token: alice,
      headers: { cookie: 'role=seller' },
    });
    assert.equal(seller.status, 200);
    assert.ok(seller.json.products.length > 0);

    const settings = await api(lab.base, 'GET', '/api/admin/settings', {
      token: alice,
      headers: { cookie: 'role=admin' },
    });
    assert.equal(settings.status, 200);

    const updated = await api(lab.base, 'PATCH', '/api/admin/settings', {
      token: alice,
      headers: { cookie: 'role=admin' },
      body: { supportEmail: 'operasional@example.test' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.settings.supportEmail, 'operasional@example.test');
  });
});

test('SECURE: cookie role tidak membuka panel penjual atau pengaturan admin', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const seller = await api(lab.base, 'GET', '/api/seller/summary', {
      token: alice,
      headers: { cookie: 'role=seller' },
    });
    assert.equal(seller.status, 403);

    const settings = await api(lab.base, 'GET', '/api/admin/settings', {
      token: alice,
      headers: { cookie: 'role=admin' },
    });
    assert.equal(settings.status, 403);
  });
});

/* ------------------------------------------------------------------ */
/* Modul tambahan: role-change request dan checkout                    */
/* ------------------------------------------------------------------ */

test('VULN: customer menyetujui permintaan role yang sudah ada di seed', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const approve = await api(lab.base, 'PATCH', '/api/admin/role-change-requests/1/approve', {
      token: alice,
      body: {},
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.json.user.role, 'admin');

    const audit = await api(lab.base, 'GET', '/api/admin/audit-log', { token: alice });
    assert.equal(audit.status, 200);
  });
});

test('SECURE: customer tidak bisa menyetujui role-change request', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const admin = await loginSeed(lab, 'admin');

    const denied = await api(lab.base, 'PATCH', '/api/admin/role-change-requests/1/approve', {
      token: alice,
      body: {},
    });
    assert.equal(denied.status, 403);

    const approved = await api(lab.base, 'PATCH', '/api/admin/role-change-requests/1/approve', {
      token: admin,
      body: {},
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.user.id, 1001);
    assert.equal(approved.json.user.role, 'admin');
  });
});

test('VULN: checkout memakai alamat milik customer lain', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const added = await api(lab.base, 'POST', '/api/cart/items', {
      token: alice,
      body: { productId: 101, qty: 1 },
    });
    assert.equal(added.status, 201);

    const checkout = await api(lab.base, 'POST', '/api/cart/checkout', {
      token: alice,
      body: { addressId: 3002 },
    });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.json.order.userId, 1001);
    assert.equal(checkout.json.order.addressId, 3002);
    assert.equal(checkout.json.address.userId, 1002);
  });
});

test('SECURE: checkout menolak alamat milik customer lain', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const added = await api(lab.base, 'POST', '/api/cart/items', {
      token: alice,
      body: { productId: 101, qty: 1 },
    });
    assert.equal(added.status, 201);

    const checkout = await api(lab.base, 'POST', '/api/cart/checkout', {
      token: alice,
      body: { addressId: 3002 },
    });
    assert.equal(checkout.status, 403);
  });
});

/* ------------------------------------------------------------------ */
/* Modul tambahan: order write dan endpoint admin                      */
/* ------------------------------------------------------------------ */

test('VULN: customer mengubah order orang lain dan membaca statistik admin', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const patched = await api(lab.base, 'PATCH', '/api/orders/5002', {
      token: alice,
      body: { status: 'Dikirim' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.order.userId, 1002);
    assert.equal(patched.json.order.status, 'Dikirim');

    const stats = await api(lab.base, 'GET', '/api/admin/stats', { token: alice });
    assert.equal(stats.status, 200);
    assert.ok(stats.json.stats.users > 0);

    const orders = await api(lab.base, 'GET', '/api/admin/orders', { token: alice });
    assert.equal(orders.status, 200);
    assert.ok(orders.json.orders.some((order) => order.userId === 1002));
  });
});

test('SECURE: customer tidak bisa mengubah order orang lain atau membaca statistik admin', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');

    const patched = await api(lab.base, 'PATCH', '/api/orders/5002', {
      token: alice,
      body: { status: 'Dikirim' },
    });
    assert.equal(patched.status, 403);

    for (const path of ['/api/admin/stats', '/api/admin/orders']) {
      const res = await api(lab.base, 'GET', path, { token: alice });
      assert.equal(res.status, 403, path);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Modul tambahan: upload dokumen ke folder partner                    */
/* ------------------------------------------------------------------ */

test('VULN: customer mengunggah dokumen ke folder milik partner', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const res = await uploadDocument(lab, alice, 1);

    assert.equal(res.status, 201);
    assert.equal(res.json.document.ownerId, 1001);
    assert.equal(res.json.document.folderId, 1);
  });
});

test('SECURE: customer tidak bisa mengunggah dokumen ke folder partner', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const res = await uploadDocument(lab, alice, 1);

    assert.equal(res.status, 403);
  });
});

test('VULN: customer mengunduh file dokumen partner', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const res = await api(lab.base, 'GET', '/api/documents/1/download', { token: alice });

    assert.equal(res.status, 200);
    assert.match(res.text, /KONTRAK KERJASAMA 2026/);
  });
});

test('SECURE: customer tidak bisa mengunduh file dokumen partner', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const res = await api(lab.base, 'GET', '/api/documents/1/download', { token: alice });

    assert.equal(res.status, 403);
  });
});

test('VULN: customer mengekspor laporan dengan Referer palsu', async () => {
  await withLab({ secure: false }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const res = await api(lab.base, 'GET', '/api/admin/reports/export', {
      token: alice,
      headers: { referer: `${lab.base}/admin` },
    });

    assert.equal(res.status, 200);
    assert.match(res.text, /"order_id","customer","email"/);
    assert.match(res.text, /alice@example\.test/);
  });
});

test('SECURE: Referer palsu tidak membuka ekspor laporan', async () => {
  await withLab({ secure: true }, async (lab) => {
    const alice = await loginSeed(lab, 'alice');
    const res = await api(lab.base, 'GET', '/api/admin/reports/export', {
      token: alice,
      headers: { referer: `${lab.base}/admin` },
    });

    assert.equal(res.status, 403);
  });
});
