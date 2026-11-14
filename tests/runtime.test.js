'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

const { resolveConfig, isLoopbackHost } = require('../server/config');

const ROOT = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'index.js');

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function launch(env) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const state = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => {
    state.stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    state.stderr += chunk.toString();
  });

  return { child, state };
}

async function waitFor(predicate, timeoutMs = 10000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('konfigurasi default: bind ke 127.0.0.1 dan port 3000', () => {
  const config = resolveConfig({}, []);
  assert.deepEqual(config, { host: '127.0.0.1', port: 3000, secure: false });

  for (const loopback of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
    assert.equal(isLoopbackHost(loopback), true);
  }
  for (const exposed of ['0.0.0.0', '192.168.1.5', '::', 'example.test']) {
    assert.equal(isLoopbackHost(exposed), false);
  }
});

test('konfigurasi: env HOST/PORT/SECURE_MODE dan flag --secure', () => {
  const envConfig = resolveConfig({ HOST: '127.0.0.2', PORT: '4100', SECURE_MODE: 'true' }, []);
  assert.deepEqual(envConfig, { host: '127.0.0.2', port: 4100, secure: true });

  const flagConfig = resolveConfig({}, ['--secure']);
  assert.equal(flagConfig.secure, true);

  assert.throws(() => resolveConfig({ PORT: 'abc' }, []), /PORT tidak valid/);
  assert.throws(() => resolveConfig({ PORT: '0' }, []), /PORT tidak valid/);
  assert.throws(() => resolveConfig({ PORT: '70000' }, []), /PORT tidak valid/);
});

test('server tanpa HOST mendengarkan di 127.0.0.1', { timeout: 20000 }, async () => {
  const port = await getFreePort();
  const { child, state } = launch({ PORT: String(port), HOST: '', SECURE_MODE: '' });

  try {
    const started = await waitFor(() => state.stdout.includes('Listen'));
    assert.equal(started, true, `server tidak start. stdout=${state.stdout} stderr=${state.stderr}`);

    assert.match(state.stdout, new RegExp(`Listen\\s+: 127\\.0\\.0\\.1:${port}`));
    assert.match(state.stdout, /Intentionally vulnerable training lab/);
    assert.match(state.stdout, /VULNERABLE/);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.secureMode, false);
  } finally {
    await stop(child);
  }
});

test('HOST non-loopback mencetak peringatan keras', { timeout: 20000 }, async () => {
  const port = await getFreePort();
  const { child, state } = launch({ HOST: '0.0.0.0', PORT: String(port), SECURE_MODE: '' });

  try {
    const warned = await waitFor(() => state.stderr.includes('PERINGATAN KEAMANAN'));
    assert.equal(warned, true, `peringatan tidak muncul. stderr=${state.stderr}`);
    assert.match(state.stderr, /HOST=0\.0\.0\.0/);
  } finally {
    await stop(child);
  }
});

test('mode SECURE lewat env mencetak mode yang benar', { timeout: 20000 }, async () => {
  const port = await getFreePort();
  const { child, state } = launch({ PORT: String(port), SECURE_MODE: 'true', HOST: '127.0.0.1' });

  try {
    const started = await waitFor(() => state.stdout.includes('SECURE'));
    assert.equal(started, true, `server tidak start. stdout=${state.stdout} stderr=${state.stderr}`);
    assert.match(state.stdout, /SECURE \(SECURE_MODE=true\)/);
  } finally {
    await stop(child);
  }
});

test('dependency produksi bebas native addon', () => {
  const output = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-native-deps.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(output, /OK: tidak ada native addon/);
  for (const expected of ['express', 'jsonwebtoken', 'bcryptjs']) {
    assert.match(output, new RegExp(`\\b${expected}\\b`));
  }
});
