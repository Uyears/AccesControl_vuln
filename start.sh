#!/usr/bin/env bash
# Menjalankan lab dengan Node.js yang terpasang di sistem (macOS/Linux).
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js tidak ditemukan. Pasang Node.js 18+ lalu coba lagi." >&2
  exit 1
fi

if [ ! -f server/public/index.html ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm tidak ditemukan; tidak bisa membangun frontend." >&2
    exit 1
  fi

  log_file=$(mktemp)
  trap 'rm -f "$log_file"' EXIT

  if [ ! -d node_modules ]; then
    if ! npm install --silent >"$log_file" 2>&1; then
      cat "$log_file" >&2
      exit 1
    fi
  fi

  if ! npm run build >"$log_file" 2>&1; then
    cat "$log_file" >&2
    exit 1
  fi
fi

exec node server/index.js
