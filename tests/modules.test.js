'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, api, loginSeed } = require('./helpers');

test('company dan employee API terbuka tanpa token', async () => {
  const lab = await startApp();
  try {
    const invoices = await api(lab.base, 'GET', '/api/company/invoices');
    assert.equal(invoices.status, 200);
    assert.ok(invoices.json.invoices.length > 0);

    const employees = await api(lab.base, 'GET', '/api/employees');
    assert.equal(employees.status, 200);
    assert.ok(employees.json.employees.length > 0);
    assert.ok(employees.json.employees[0].email);
  } finally {
    await lab.close();
  }
});

test('artikel publik membocorkan profil internal penulis', async () => {
  const lab = await startApp();
  try {
    const response = await api(lab.base, 'GET', '/api/articles/merapikan-meja-kerja');
    assert.equal(response.status, 200);
    assert.equal(response.json.article.author.name, 'Andi Wijaya');
    assert.ok(response.json.article.authorProfile.email);
  } finally {
    await lab.close();
  }
});

test('checkout memakai alamat milik customer lain', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');

    const added = await api(lab.base, 'POST', '/api/cart/items', {
      token,
      body: { productId: 101, qty: 1 },
    });
    assert.equal(added.status, 201);

    const checkout = await api(lab.base, 'POST', '/api/cart/checkout', {
      token,
      body: { addressId: 3002 },
    });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.json.order.userId, 1001);
    assert.equal(checkout.json.address.id, 3002);
    assert.equal(checkout.json.address.userId, 1002);
  } finally {
    await lab.close();
  }
});

test('customer mengubah status order customer lain', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');
    const response = await api(lab.base, 'PATCH', '/api/orders/5002', {
      token,
      body: { status: 'Selesai', courier: 'Kurir Uji', trackingNumber: 'TEST-123' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.order.userId, 1002);
    assert.equal(response.json.order.status, 'Selesai');
  } finally {
    await lab.close();
  }
});

test('customer mengunggah dokumen ke folder milik partner', async () => {
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');
    const form = new FormData();
    form.append('folderId', '1');
    form.append('file', new Blob(['dokumen uji']), 'uji.txt');

    const response = await fetch(`${lab.base}/api/documents`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await response.json();

    assert.equal(response.status, 201);
    assert.equal(json.document.ownerId, 1001);
    assert.equal(json.document.folderId, 1);
  } finally {
    await lab.close();
  }
});
