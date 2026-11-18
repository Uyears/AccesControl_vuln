'use strict';

const { createApp } = require('./app');
const { resolveConfig, isLoopbackHost, DEFAULT_PORT } = require('./config');

const BANNER_LINE = '='.repeat(78);
const LAB_WARNING = 'Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.';

function modeLabel(secure) {
  return secure
    ? 'SECURE (SECURE_MODE=true) — guard otorisasi aktif'
    : 'VULNERABLE (SECURE_MODE=false) — guard otorisasi no-op';
}

function printBanner(config, actualPort) {
  const url = `http://127.0.0.1:${actualPort}`;
  console.log(BANNER_LINE);
  console.log('  Nusa Supply — Broken Access Control Lab');
  console.log(`  ${LAB_WARNING}`);
  console.log(BANNER_LINE);
  console.log(`  Mode    : ${modeLabel(config.secure)}`);
  console.log(`  Listen  : ${config.host}:${actualPort}`);
  console.log(`  URL     : ${config.host === '127.0.0.1' ? url : `http://${config.host}:${actualPort}`}`);
  console.log('');
  console.log('  Akun latihan disiapkan oleh fasilitator (docs/FACILITATOR.md).');
  console.log('  Reset data: hentikan server (Ctrl+C) lalu jalankan ulang.');
  console.log(`  Sekarang: ${config.secure ? 'npm run start:secure' : 'npm start'}`);
  console.log(BANNER_LINE);
}

function printExposureWarning(host) {
  const lines = [
    '',
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '!!  PERINGATAN KEAMANAN: HOST BUKAN LOOPBACK                             !!',
    `!!  HOST=${host} — server ini bisa diakses dari jaringan lain.            !!`,
    '!!  Lab ini sengaja rentan. JANGAN dijalankan di jaringan publik.        !!',
    '!!  Hentikan sekarang (Ctrl+C) dan jalankan tanpa variabel HOST.         !!',
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '',
  ];
  console.error(lines.join('\n'));
}

function main() {
  let config;
  try {
    config = resolveConfig();
  } catch (err) {
    console.error(`[bac-lab] ${err.message}`);
    process.exit(1);
  }

  console.log(`[bac-lab] ${LAB_WARNING}`);
  if (!isLoopbackHost(config.host)) printExposureWarning(config.host);

  const app = createApp({ secure: config.secure, port: config.port });

  const server = app.listen(config.port, config.host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : config.port;
    printBanner(config, actualPort);
    if (actualPort !== DEFAULT_PORT) {
      console.log(`[bac-lab] Port aktif: ${actualPort}`);
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[bac-lab] Port ${config.port} sudah dipakai. Set PORT lain, misalnya PORT=3100 npm start.`);
    } else {
      console.error('[bac-lab] Gagal menjalankan server:', err);
    }
    process.exitCode = 1;
  });

  const shutdown = (signal) => {
    console.log(`\n[bac-lab] Menerima ${signal}, menghentikan server...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) main();

module.exports = { main, printBanner, LAB_WARNING };
