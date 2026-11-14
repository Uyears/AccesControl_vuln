'use strict';

/**
 * Memastikan dependency PRODUKSI bebas native addon.
 *
 * Yang diperiksa:
 *  - package-lock.json: paket non-dev yang punya `hasInstallScript`
 *  - node_modules: keberadaan binding.gyp, field `gypfile`, atau file *.node
 *
 * Dev dependency boleh native (esbuild/vite), karena tidak ikut ke paket
 * portable dan tidak dibutuhkan saat lab dijalankan.
 */

const fs = require('node:fs');
const path = require('node:path');

// Argumen opsional: folder yang diperiksa (default root repo). make-portable
// memakai ini untuk memeriksa release/lab setelah dependency produksi dipasang.
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const LOCK_PATH = path.join(ROOT, 'package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isProductionEntry(entry) {
  if (!entry || entry.link) return false;
  if (entry.dev === true || entry.devOptional === true) return false;
  if (entry.optional === true && entry.dev === true) return false;
  return true;
}

function findNativeArtifacts(packageDir, depth = 0) {
  const findings = [];
  if (depth > 3) return findings;

  let entries;
  try {
    entries = fs.readdirSync(packageDir, { withFileTypes: true });
  } catch (err) {
    return findings;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(packageDir, entry.name);
    if (entry.isDirectory()) {
      findings.push(...findNativeArtifacts(full, depth + 1));
    } else if (entry.name === 'binding.gyp' || entry.name.endsWith('.node')) {
      findings.push(path.relative(ROOT, full));
    }
  }
  return findings;
}

function run() {
  if (!fs.existsSync(LOCK_PATH)) {
    console.error('[check-native-deps] package-lock.json tidak ditemukan. Jalankan npm install dulu.');
    process.exit(1);
  }

  const lock = readJson(LOCK_PATH);
  const packages = lock.packages || {};

  const productionPackages = [];
  const problems = [];

  for (const [lockKey, entry] of Object.entries(packages)) {
    if (!lockKey.startsWith('node_modules/')) continue;
    if (!isProductionEntry(entry)) continue;

    const name = lockKey.slice('node_modules/'.length);
    const dir = path.join(ROOT, lockKey);
    productionPackages.push(name);

    if (entry.hasInstallScript === true) {
      problems.push(`${name}: punya install script (kemungkinan node-gyp / binary download)`);
    }

    if (!fs.existsSync(dir)) continue;

    let pkgJson = null;
    try {
      pkgJson = readJson(path.join(dir, 'package.json'));
    } catch (err) {
      /* package.json tidak wajib ada untuk paket tertentu */
    }
    if (pkgJson && pkgJson.gypfile) {
      problems.push(`${name}: package.json menandai gypfile`);
    }

    const artifacts = findNativeArtifacts(dir);
    for (const artifact of artifacts) {
      problems.push(`${name}: artefak native ${artifact}`);
    }
  }

  const unique = [...new Set(problems)].sort();

  console.log(`[check-native-deps] ${productionPackages.length} paket produksi diperiksa.`);
  console.log(`[check-native-deps] daftar: ${[...new Set(productionPackages)].sort().join(', ')}`);

  if (unique.length > 0) {
    console.error('');
    console.error('[check-native-deps] GAGAL: ditemukan dependency produksi dengan native addon:');
    for (const problem of unique) console.error(`  - ${problem}`);
    console.error('');
    console.error('Ganti dependency tersebut dengan alternatif pure JavaScript.');
    process.exit(1);
  }

  console.log('[check-native-deps] OK: tidak ada native addon di dependency produksi.');
}

run();
