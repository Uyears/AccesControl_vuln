import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  build: {
    // Express menyajikan folder ini secara statis.
    outDir: path.resolve(here, '..', 'server', 'public'),
    emptyOutDir: true,
    // Bundle tetap terbaca untuk memudahkan pengembangan.
    minify: false,
    sourcemap: true,
    target: 'es2020',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/openapi.json': 'http://127.0.0.1:3000',
    },
  },
});
