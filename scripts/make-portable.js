#!/usr/bin/env node
'use strict';

/**
 * Merakit paket portable Windows: node.exe + server + frontend build +
 * node_modules produksi + start.bat / start-secure.bat, lalu (bila tersedia)
 * membungkusnya menjadi satu zip.
 *
 * Prasyarat di mesin perakit:
 *  - Node.js dan npm terpasang (dipakai untuk `npm ci --omit=dev`)
 *  - koneksi internet (unduh node.exe resmi dari nodejs.org)
 *  - `zip` di Linux/macOS, atau PowerShell di Windows
 *
 * Pemakaian:
 *   npm run build
 *   node scripts/make-portable.js
 *
 * Opsi environment:
 *   NODE_VERSION=22.11.0   versi Node Windows yang diunduh (default: versi Node perakit)
 *   SKIP_ZIP=1             hanya menghasilkan folder release/lab
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const RELEASE_ROOT = path.join(ROOT, 'release');
const LAB_DIR = path.join(RELEASE_ROOT, 'lab');
const NODE_VERSION = (process.env.NODE_VERSION || process.version).replace(/^v/, '');
const SKIP_ZIP = process.env.SKIP_ZIP === '1';
const ZIP_PATH = path.join(RELEASE_ROOT, 'bac-lab-portable.zip');

const WIN_NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

function fail(message) {
  console.error(`[portable] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: options.cwd || ROOT,
    env: process.env,
    shell: options.shell === true,
  });
  if (result.error) {
    fail(`gagal menjalankan ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} keluar dengan kode ${result.status}`);
  }
}

function copy(relativePath) {
  const source = path.join(ROOT, relativePath);
  const target = path.join(LAB_DIR, relativePath);
  if (!fs.existsSync(source)) fail(`file yang harus disalin tidak ada: ${relativePath}`);
  fs.cpSync(source, target, { recursive: true });
}

const WIN_NODE_ZIP = `node-v${NODE_VERSION}-win-x64.zip`;
const WIN_NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${WIN_NODE_ZIP}`;
const WIN_NODE_EXE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;
function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('terlalu banyak redirect'));
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          const next = new URL(response.headers.location, url).toString();
          download(next, destination, redirects + 1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} untuk ${url}`));
          return;
        }

        const total = Number(response.headers['content-length'] || 0);
        let received = 0;
        let lastPct = -1;
        const file = fs.createWriteStream(destination);
        response.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              lastPct = pct;
              process.stdout.write(`[portable] mengunduh node.exe ${pct}%\n`);
            }
          }
        });
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

function findFile(directory, fileName) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, fileName);
      if (found) return found;
    } else if (entry.name === fileName) {
      return full;
    }
  }
  return null;
}

/**
 * Mengunduh zip resmi nodejs.org lalu mengambil node.exe dari dalamnya.
 * Bila alat ekstraksi tidak tersedia, jatuh ke unduhan biner resmi langsung
 * (masih dari nodejs.org) agar perakitan tidak gagal.
 */
async function installNodeExe() {
  const destination = path.join(LAB_DIR, 'node.exe');
  const zipPath = path.join(RELEASE_ROOT, WIN_NODE_ZIP);
  const tempDir = path.join(RELEASE_ROOT, '.node-extract');

  console.log(`[portable] mengunduh ${WIN_NODE_ZIP}...`);
  await download(WIN_NODE_ZIP_URL, zipPath);

  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  let extracted = false;
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tempDir}' -Force`,
      ],
      { stdio: 'inherit' }
    );
    extracted = !result.error && result.status === 0;
  } else {
    const result = spawnSync('unzip', ['-o', '-q', zipPath, '-d', tempDir], { stdio: 'inherit' });
    extracted = !result.error && result.status === 0;
  }

  let installed = false;
  if (extracted) {
    const exe = findFile(tempDir, 'node.exe');
    if (exe) {
      fs.copyFileSync(exe, destination);
      installed = true;
    }
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });

  if (!installed) {
    console.warn('[portable] ekstraksi zip gagal; mengunduh node.exe resmi secara langsung.');
    await download(WIN_NODE_EXE_URL, destination);
  }
}

function writeStartScripts() {
  const startBat = [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    '',
    'rem Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.',
    'set "SECURE_MODE=false"',
    'set "HOST=127.0.0.1"',
    'if "%PORT%"=="" set "PORT=3000"',
    '',
    'echo.',
    'echo  Nusa Supply - Broken Access Control Lab (MODE VULNERABLE)',
    'echo  Buka http://127.0.0.1:%PORT% setelah server siap.',
    'echo  Hentikan dengan Ctrl+C.',
    'echo.',
    '',
    'node.exe server\\index.js',
    'echo.',
    'echo  Server berhenti.',
    'pause',
    '',
  ].join('\r\n');

  const startSecureBat = startBat
    .replace('(MODE VULNERABLE)', '(MODE SECURE)')
    .replace('set "SECURE_MODE=false"', 'set "SECURE_MODE=true"');

  fs.writeFileSync(path.join(LAB_DIR, 'start.bat'), startBat);
  fs.writeFileSync(path.join(LAB_DIR, 'start-secure.bat'), startSecureBat);

  const startSh = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cd "$(dirname "$0")"',
    'if [ ! -f server/public/index.html ]; then',
    '  echo "Frontend belum dibangun. Jalankan: npm run build" >&2',
    '  exit 1',
    'fi',
    'exec node server/index.js "$@"',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(LAB_DIR, 'start.sh'), startSh, { mode: 0o755 });
}

function writeReadme() {
  const readme = [
    'NUSA SUPPLY - BROKEN ACCESS CONTROL LAB',
    '=======================================',
    '',
    'Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.',
    '',
    'WINDOWS',
    '  1. Ekstrak seluruh isi zip ke satu folder.',
    '  2. Double-click start.bat         -> mode VULNERABLE',
    '     atau start-secure.bat          -> mode SECURE',
    '  3. Browser akan diarahkan ke http://127.0.0.1:3000 (buka manual bila perlu).',
    '  4. Hentikan server dengan Ctrl+C di jendela command prompt.',
    '',
    '  Tidak perlu Node.js, npm, atau hak administrator.',
    '',
    'MAC / LINUX',
    '  1. Pastikan Node.js 18+ terpasang.',
    '  2. ./start.sh            -> mode VULNERABLE',
    '     ./start.sh --secure   -> mode SECURE',
    '',
    'AKUN LATIHAN',
    '  Kredensial akun dibagikan langsung oleh fasilitator dan tidak',
    '  disimpan di paket portable ini. Halaman Daftar terbuka untuk',
    '  membuat akun pelanggan baru bila diperlukan.',
    '',
    'RESET DATA',
    '  Hentikan server lalu jalankan ulang. Tidak ada endpoint reset.',
    '',
    'BURP SUITE',
    '  Browser sering tidak meneruskan trafik localhost lewat proxy. Dua solusi:',
    '  - pakai browser bawaan Burp (Proxy > Intercept > Open browser), atau',
    '  - Firefox: about:config -> network.proxy.allow_hijacking_localhost = true',
    '',
    'DOKUMENTASI',
    '  README lengkap, docs/FACILITATOR.md, docs/PARTICIPANT.md, dan',
    '  docs/remediation.md ada di paket sumber, bukan di folder portable ini.',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(LAB_DIR, 'README.txt'), readme);
}

function makeZip() {
  if (SKIP_ZIP) {
    console.log('[portable] SKIP_ZIP=1, zip tidak dibuat.');
    return;
  }
  if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH, { force: true });

  if (process.platform === 'win32') {
    run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path '${LAB_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force`,
    ]);
  } else {
    const probe = spawnSync('zip', ['-v'], { stdio: 'ignore' });
    if (probe.error || probe.status !== 0) {
      console.warn('[portable] perintah `zip` tidak ditemukan; folder release/lab tetap siap dipakai.');
      return;
    }
    run('zip', ['-rq', ZIP_PATH, 'lab'], { cwd: RELEASE_ROOT });
  }
  console.log(`[portable] zip selesai: ${path.relative(ROOT, ZIP_PATH)}`);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'server', 'public', 'index.html'))) {
    fail('frontend belum dibangun. Jalankan `npm run build` lebih dulu.');
  }
  if (!fs.existsSync(path.join(ROOT, 'package-lock.json'))) {
    fail('package-lock.json tidak ditemukan; jalankan `npm install` lebih dulu.');
  }

  console.log(`[portable] Node Windows: v${NODE_VERSION} (${WIN_NODE_ZIP_URL})`);
  if (fs.existsSync(LAB_DIR)) fs.rmSync(LAB_DIR, { recursive: true, force: true });
  fs.mkdirSync(LAB_DIR, { recursive: true });

  // 1. Server + data + frontend build (server/public ikut tersalin).
  copy('server');
  copy('data');
  copy('package.json');
  copy('package-lock.json');
  copy('start.sh');

  // 2. Dependency produksi saja, tanpa lifecycle script.
  console.log('[portable] memasang dependency produksi...');
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: LAB_DIR });

  // 3. node.exe portable resmi (dari zip resmi nodejs.org).
  await installNodeExe();

  // 4. Launcher + README.
  writeStartScripts();
  writeReadme();

  // 5. Verifikasi dependency produksi di folder portable bebas native addon.
  run(process.execPath, [path.join(ROOT, 'scripts', 'check-native-deps.js'), LAB_DIR]);

  // 6. Zip final.
  makeZip();

  console.log('[portable] selesai. Folder: release/lab');
  console.log('[portable] Windows: ekstrak zip lalu double-click start.bat.');
}

main().catch((error) => {
  console.error(`[portable] ${error.stack || error.message}`);
  process.exit(1);
});
