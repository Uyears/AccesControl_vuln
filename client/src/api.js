const TOKEN_KEY = 'nusasupply.token';
const USER_KEY = 'nusasupply.user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function saveSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(status, payload) {
    super((payload && payload.message) || 'Permintaan tidak dapat diproses.');
    this.status = status;
    this.payload = payload;
  }
}

/* Helper tunggal untuk seluruh panggilan API aplikasi. */
export async function api(path, options = {}) {
  const { method = 'GET', body, auth = true } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (err) {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }
    throw new ApiError(response.status, payload);
  }

  return payload;
}

/* Unduh file yang dilindungi token tanpa membocorkan token di URL. */
export async function downloadFile(path, fallbackName) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }
    throw new ApiError(response.status, payload);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const name = match ? match[1] : fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
