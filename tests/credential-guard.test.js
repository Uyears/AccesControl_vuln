'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
const PASSWORDS = ['Password123!', 'Admin!2024', 'Seller123!'];
const USERNAMES = ['alice', 'bob', 'dian', 'toko.alpha', 'toko.bravo'];

function assertClean(label, text) {
  for (const value of [...PASSWORDS, ...USERNAMES]) {
    assert.equal(text.toLowerCase().includes(value.toLowerCase()), false, `${label} memuat "${value}"`);
  }
}

function readTree(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readTree(full, files);
    else if (/\.(js|map|html|json|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test('console, dokumen peserta, dan script rilis tidak memuat kredensial seed', () => {
  // README adalah dokumen fasilitator dan memang memuat akun latihan.
  const files = [
    'docs/PARTICIPANT.md',
    'docs/remediation.md',
    'server/index.js',
    'server/openapi.js',
    'start.sh',
    'scripts/make-portable.js',
    'scripts/make-portable.ps1',
  ];
  for (const file of files) {
    assertClean(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
});

test('bundle build frontend tidak memuat kredensial seed', () => {
  const files = readTree(PUBLIC_DIR);
  assert.ok(files.length > 0, 'server/public kosong; jalankan npm run build');
  for (const file of files) {
    assertClean(path.relative(ROOT, file), fs.readFileSync(file, 'utf8'));
  }
});

test('stdout, halaman publik, OpenAPI, dan aset statis bersih dari kredensial', { timeout: 20000 }, async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk.toString();
  });

  try {
    const deadline = Date.now() + 10000;
    while (!output.stdout.includes('http://') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(output.stdout, /http:\/\//, `server tidak start: ${output.stderr}`);
    assertClean('stdout', output.stdout);
    assertClean('stderr', output.stderr);

    const base = `http://127.0.0.1:${port}`;
    for (const endpoint of ['/api/health', '/openapi.json', '/']) {
      const response = await fetch(`${base}${endpoint}`);
      assert.equal(response.status, 200, endpoint);
      assertClean(endpoint, await response.text());
    }

    for (const file of readTree(PUBLIC_DIR)) {
      const route = `/${path.relative(PUBLIC_DIR, file).split(path.sep).join('/')}`;
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, route);
      assertClean(route, await response.text());
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000).unref();
    });
  }
});

test('respons login dan registrasi tidak membocorkan hash password', async () => {
  const { startApp, api, loginSeed } = require('./helpers');
  const lab = await startApp();
  try {
    const token = await loginSeed(lab, 'alice');
    const me = await api(lab.base, 'GET', '/api/users/me', { token });
    assert.equal(me.status, 200);
    assert.equal('passwordHash' in me.json.user, false);
    assert.equal('password' in me.json.user, false);

    const registered = await api(lab.base, 'POST', '/api/auth/register', {
      body: {
        username: 'guard.check',
        name: 'Guard Check',
        email: 'guard@example.test',
        password: 'Rahasia#123',
        role: 'admin',
      },
    });
    assert.equal(registered.status, 201);
    assert.equal('passwordHash' in registered.json.user, false);
    assert.equal(registered.json.user.role, 'customer');
  } finally {
    await lab.close();
  }
});
