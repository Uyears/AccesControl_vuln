'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveConfig, isLoopbackHost } = require('../server/config');
const { LAB_WARNING } = require('../server/index');

const ROOT = path.join(__dirname, '..');
const MODE_NEEDLE = ['SECURE', 'MODE'].join('_');

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

function runServer(env) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk.toString();
  });
  return { child, output };
}

async function waitForUrl(output, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!output.stdout.includes('http://') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!output.stdout.includes('http://')) {
    throw new Error(`server tidak siap: ${output.stderr || output.stdout}`);
  }
}

async function stop(child) {
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

test('konfigurasi default: bind ke 127.0.0.1 dan port 3000', () => {
  const config = resolveConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(isLoopbackHost(config.host), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});

test('env PORT diterima dan nilai tidak valid ditolak', () => {
  assert.equal(resolveConfig({ PORT: '4123' }).port, 4123);
  assert.throws(() => resolveConfig({ PORT: 'abc' }), /PORT tidak valid/);
  assert.throws(() => resolveConfig({ PORT: '70000' }), /PORT tidak valid/);
});

test('output startup normal hanya banner dan URL', { timeout: 20000 }, async () => {
  const port = await freePort();
  const { child, output } = runServer({ HOST: '127.0.0.1', PORT: String(port) });
  try {
    await waitForUrl(output);
    const lines = output.stdout.trim().split(/\r?\n/);
    assert.deepEqual(lines, [LAB_WARNING, `http://127.0.0.1:${port}`]);
    assert.equal(output.stderr.trim(), '');
  } finally {
    await stop(child);
  }
});

test('server tanpa HOST mendengarkan di 127.0.0.1', { timeout: 20000 }, async () => {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port) };
  delete env.HOST;
  const { child, output } = runServer(env);
  try {
    await waitForUrl(output);
    assert.match(output.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}`));
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
  } finally {
    await stop(child);
  }
});

test('HOST non-loopback mencetak peringatan keras', { timeout: 20000 }, async () => {
  const port = await freePort();
  const { child, output } = runServer({ HOST: '0.0.0.0', PORT: String(port) });
  try {
    await waitForUrl(output);
    assert.match(output.stderr, /PERINGATAN KEAMANAN/);
    assert.match(output.stdout, new RegExp(`http://0\\.0\\.0\\.0:${port}`));
  } finally {
    await stop(child);
  }
});

test('tidak ada referensi mode aman di source, launcher, atau dokumentasi', () => {
  const roots = ['server', 'client/src', 'tests', 'scripts', 'docs'];
  const rootFiles = ['package.json', 'README.md', 'start.sh'];
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'public') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx|mjs|md|json|sh|ps1|html|css|txt)$/.test(entry.name)) files.push(full);
    }
  }

  for (const root of roots) walk(path.join(ROOT, root));
  for (const file of rootFiles) files.push(path.join(ROOT, file));

  for (const file of files) {
    const relative = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(content.includes(MODE_NEEDLE), false, `${relative} masih memuat ${MODE_NEEDLE}`);
  }

  assert.equal(fs.existsSync(path.join(ROOT, 'start-secure.bat')), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(Object.hasOwn(pkg.scripts, 'start:secure'), false);
});

test('dependency produksi bebas native addon', { timeout: 20000 }, async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'check-native-deps.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 0, stderr);
});
