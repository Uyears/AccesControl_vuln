'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, api, loginSeed } = require('./helpers');

test('customer bisa menulis balasan ke tiket customer lain (IDOR write)', async () => {
  const lab = await startApp();
  try {
    const alice = await loginSeed(lab, 'alice');
    const bob = await loginSeed(lab, 'bob');

    const read = await api(lab.base, 'GET', '/api/tickets/4002', { token: alice });
    assert.equal(read.status, 200);
    assert.equal(read.json.ticket.userId, 1002);

    const reply = await api(lab.base, 'POST', '/api/tickets/4002/messages', {
      token: alice,
      body: { body: 'Balasan dari akun lain.' },
    });
    assert.equal(reply.status, 201);
    assert.equal(reply.json.message.authorId, 1001);
    assert.equal(reply.json.message.body, 'Balasan dari akun lain.');
    assert.equal(reply.json.ticket.userId, 1002);

    const bobView = await api(lab.base, 'GET', '/api/tickets/4002', { token: bob });
    assert.equal(bobView.status, 200);
    assert.ok(
      bobView.json.ticket.messages.some(
        (message) => message.id === reply.json.message.id && message.body === 'Balasan dari akun lain.'
      )
    );
  } finally {
    await lab.close();
  }
});

test('customer menangguhkan akun lain lewat endpoint admin (BFLA)', async () => {
  const lab = await startApp();
  try {
    const alice = await loginSeed(lab, 'alice');
    const bob = await loginSeed(lab, 'bob');

    const response = await api(lab.base, 'PATCH', '/api/admin/users/1002', {
      token: alice,
      body: { status: 'suspended' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.user.id, 1002);
    assert.equal(response.json.user.status, 'suspended');

    const bobAfter = await api(lab.base, 'GET', '/api/orders/5002', { token: bob });
    assert.equal(bobAfter.status, 401);

    const self = await api(lab.base, 'PATCH', '/api/admin/users/1001', {
      token: alice,
      body: { status: 'suspended' },
    });
    assert.equal(self.status, 400);

    const invalid = await api(lab.base, 'PATCH', '/api/admin/users/1002', {
      token: alice,
      body: { status: 'deleted' },
    });
    assert.equal(invalid.status, 400);

    const missing = await api(lab.base, 'PATCH', '/api/admin/users/999999', {
      token: alice,
      body: { status: 'suspended' },
    });
    assert.equal(missing.status, 404);
  } finally {
    await lab.close();
  }
});

test('login ditolak untuk akun yang sudah ditangguhkan', async () => {
  const lab = await startApp();
  try {
    const password = 'Rahasia#12345';
    const registered = await api(lab.base, 'POST', '/api/auth/register', {
      body: {
        username: 'korban.status',
        name: 'Korban Status',
        email: 'korban.status@example.test',
        password,
      },
    });
    assert.equal(registered.status, 201);

    const admin = await loginSeed(lab, 'admin');
    const suspended = await api(lab.base, 'PATCH', `/api/admin/users/${registered.json.user.id}`, {
      token: admin,
      body: { status: 'suspended' },
    });
    assert.equal(suspended.status, 200);

    const login = await api(lab.base, 'POST', '/api/auth/login', {
      body: { username: 'korban.status', password },
    });
    assert.equal(login.status, 403);
    assert.equal(login.json.token, undefined);
  } finally {
    await lab.close();
  }
});

test('method override tidak dihormati dan alias tiket memakai handler yang sama', async () => {
  const lab = await startApp();
  try {
    const alice = await loginSeed(lab, 'alice');

    const override = await api(lab.base, 'POST', '/api/admin/users/1002', {
      token: alice,
      headers: { 'x-http-method-override': 'DELETE' },
    });
    assert.equal(override.status, 404);

    const users = await api(lab.base, 'GET', '/api/admin/users', { token: alice });
    assert.equal(users.status, 200);
    assert.ok(users.json.users.some((user) => user.id === 1002));

    const alias = await api(lab.base, 'GET', '/api/support/tickets/4002', { token: alice });
    assert.equal(alias.status, 200);
    assert.equal(alias.json.ticket.userId, 1002);

    const aliasReply = await api(lab.base, 'POST', '/api/support/tickets/4002/messages', {
      token: alice,
      body: { body: 'Balasan lewat alias dukungan.' },
    });
    assert.equal(aliasReply.status, 201);
    assert.equal(aliasReply.json.message.authorId, 1001);
    assert.equal(aliasReply.json.ticket.userId, 1002);
  } finally {
    await lab.close();
  }
});

test('openapi.json mendokumentasikan seluruh route dan method API', async () => {
  const lab = await startApp();
  const expected = {
    '/api/health': ['get'],
    '/api/auth/login': ['post'],
    '/api/auth/register': ['post'],
    '/api/users/me': ['get', 'patch'],
    '/api/users/profile': ['get'],
    '/api/users/{id}/profile': ['get'],
    '/api/addresses': ['get', 'post'],
    '/api/addresses/{id}': ['get', 'patch'],
    '/api/orders': ['get'],
    '/api/orders/{id}': ['get', 'patch'],
    '/api/tickets': ['get'],
    '/api/tickets/{id}': ['get'],
    '/api/tickets/{id}/messages': ['post'],
    '/api/support/tickets': ['get'],
    '/api/support/tickets/{id}': ['get'],
    '/api/support/tickets/{id}/messages': ['post'],
    '/api/products': ['get', 'post'],
    '/api/products/{id}': ['get', 'patch', 'delete'],
    '/api/seller/products': ['get'],
    '/api/seller/summary': ['get'],
    '/api/cart': ['get'],
    '/api/cart/items': ['post'],
    '/api/cart/items/{productId}': ['patch', 'delete'],
    '/api/cart/checkout': ['post'],
    '/api/invoices': ['get'],
    '/api/invoices/{id}': ['get'],
    '/api/invoices/{id}/pdf': ['get'],
    '/api/documents': ['get', 'post'],
    '/api/documents/{id}': ['get'],
    '/api/documents/{id}/download': ['get'],
    '/api/company/invoices': ['get'],
    '/api/employees': ['get'],
    '/api/employees/{guid}': ['get'],
    '/api/articles': ['get'],
    '/api/articles/{slug}': ['get'],
    '/api/admin/users': ['get'],
    '/api/admin/users/{id}': ['patch', 'delete'],
    '/api/admin/users/{id}/role-change': ['post'],
    '/api/admin/role-change-requests': ['get'],
    '/api/admin/role-change-requests/{id}/approve': ['patch'],
    '/api/admin/settings': ['get', 'patch'],
    '/api/admin/stats': ['get'],
    '/api/admin/orders': ['get'],
    '/api/admin/reports/export': ['get'],
    '/api/admin/audit-log': ['get'],
  };

  try {
    const response = await api(lab.base, 'GET', '/openapi.json');
    assert.equal(response.status, 200);
    const paths = response.json.paths;

    assert.deepEqual(Object.keys(paths).sort(), Object.keys(expected).sort());
    for (const [route, methods] of Object.entries(expected)) {
      const actual = Object.keys(paths[route])
        .filter((key) => ['get', 'post', 'patch', 'put', 'delete'].includes(key))
        .sort();
      assert.deepEqual(actual, methods.slice().sort(), `method ${route}`);
    }

    assert.deepEqual(paths['/api/company/invoices'].get.security, []);
    assert.deepEqual(paths['/api/admin/users'].get.security, undefined);
  } finally {
    await lab.close();
  }
});
