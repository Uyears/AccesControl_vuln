'use strict';

/**
 * Konfigurasi runtime lab.
 *
 * Default sengaja loopback-only: lab ini HARUS tetap di laptop peserta.
 * HOST hanya boleh di-override untuk keperluan pengujian/packaging lokal.
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parsePort(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`PORT tidak valid: ${JSON.stringify(raw)} (harus 1-65535).`);
  }
  return value;
}

function resolveConfig(env = process.env) {
  const host = (env.HOST && String(env.HOST).trim()) || DEFAULT_HOST;
  const port = parsePort(env.PORT);
  return { host, port };
}

function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host).trim().toLowerCase());
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  resolveConfig,
  isLoopbackHost,
  parsePort,
};
