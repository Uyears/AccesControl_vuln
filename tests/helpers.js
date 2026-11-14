'use strict';

const http = require('node:http');
const { createApp } = require('../server/app');

async function startApp({ secure = false } = {}) {
  const app = createApp({ secure });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    app,
    server,
    port,
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function api(base, method, apiPath, { token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (token) requestHeaders.authorization = `Bearer ${token}`;

  const response = await fetch(`${base}${apiPath}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (err) {
      json = null;
    }
  }

  return { status: response.status, headers: response.headers, text, json };
}

async function login(base, username, password) {
  const response = await api(base, 'POST', '/api/auth/login', {
    body: { username, password },
  });
  if (response.status !== 200 || !response.json || !response.json.token) {
    throw new Error(`Login ${username} gagal: ${response.status} ${response.text}`);
  }
  return response.json.token;
}

module.exports = { startApp, api, login };
