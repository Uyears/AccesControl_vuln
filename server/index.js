'use strict';

const { createApp } = require('./app');
const { resolveConfig, isLoopbackHost } = require('./config');

const LAB_WARNING = 'Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.';

function formatHost(host) {
  const value = String(host);
  if (value.includes(':') && !value.startsWith('[')) return `[${value}]`;
  return value;
}

function printBanner(config, actualPort) {
  console.log(LAB_WARNING);
  console.log(`http://${formatHost(config.host)}:${actualPort}`);
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

  if (!isLoopbackHost(config.host)) printExposureWarning(config.host);

  const app = createApp({ port: config.port });

  const server = app.listen(config.port, config.host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : config.port;
    printBanner(config, actualPort);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[bac-lab] Port ${config.port} sudah dipakai. Set PORT lain, misalnya PORT=3100 npm start.`);
    } else {
      console.error('[bac-lab] Gagal menjalankan server:', err);
    }
    process.exitCode = 1;
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { main, printBanner, LAB_WARNING };
