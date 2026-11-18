#!/usr/bin/env bash
# Menjalankan lab dengan Node.js yang terpasang di sistem (macOS/Linux).
#   ./start.sh            -> mode VULNERABLE
#   ./start.sh --secure   -> mode SECURE
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js tidak ditemukan. Pasang Node.js 18+ lalu coba lagi." >&2
  exit 1
fi

if [ ! -f server/public/index.html ]; then
  echo "[bac-lab] Frontend belum dibangun. Menjalankan npm run build..."
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm tidak ditemukan; tidak bisa membangun frontend." >&2
    exit 1
  fi
  if [ ! -d node_modules ]; then
    echo "[bac-lab] Memasang dependency..."
    npm install
  fi
  npm run build
fi

exec node server/index.js "$@"
