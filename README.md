# Nusa Supply — Broken Access Control Lab

Aplikasi toko online kecil yang **sengaja rentan** untuk seminar
**“Beyond Authentication: Exploiting Broken Access Control”**.

> **Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.**

Semua data fiktif dan disimpan di memori. Aplikasi hanya untuk dijalankan di laptop
peserta (`127.0.0.1`), bukan untuk di-hosting. Satu-satunya kelas kelemahan yang
ditanam adalah **otorisasi** (IDOR/BOLA, BFLA, mass assignment). Autentikasi,
penyimpanan password, dan penandatanganan token sengaja dibuat benar.

---

## 1. Ringkasan

| Aspek | Nilai |
|---|---|
| Stack | Node.js (Express 4) + React 18 + Vite 6 |
| Data | In-memory, di-seed dari `data/seed.json`; restart = reset |
| Auth | JWT HS256, secret acak per proses, masa berlaku 2 jam |
| Password | `bcryptjs` (pure JavaScript), hash dibuat saat startup |
| Frontend | Di-build ke `server/public`, disajikan Express |
| Bundle | **Tidak diminify**, sourcemap aktif (bahan recon) |
| Default bind | `127.0.0.1:3000` |
| Dependency produksi | `express`, `jsonwebtoken`, `bcryptjs` — semuanya pure JS |
| Tes | `node:test`, 24 tes, dua instance (VULN + SECURE) di port acak |

---

## 2. Menjalankan

Prasyarat: **Node.js 18.17+** (diuji pada Node 24.22) dan npm.

```bash
npm install
npm run build      # build frontend ke server/public
npm start          # mode rentan  -> http://127.0.0.1:3000
```

Mode aman (perilaku yang benar, untuk remediation):

```bash
npm run start:secure
# atau: node server/index.js --secure
# atau: SECURE_MODE=true npm start
```

Buka browser ke <http://127.0.0.1:3000>. Jika port terpakai:
`PORT=3100 npm start`.

Pengembangan frontend (hot reload) sementara backend tetap di 3000:

```bash
npm run dev:client   # Vite di 127.0.0.1:5173, proxy /api ke 3000
npm run dev:server
```

### Menjalankan tes

```bash
npm test
```

Tes menjalankan `createApp({ secure })` pada port acak, sehingga mode VULN dan
SECURE diuji berdampingan tanpa saling mempengaruhi. Cakupan:

- 7 perilaku VULN (IDOR baca profil/order/tiket, IDOR tulis alamat,
  eskalasi role, BFLA daftar user, hapus user).
- Kontrol negatif `/api/admin/audit-log` → **selalu 403** untuk non-admin.
- Semua padanan SECURE → **403** (dan pemilik tetap bisa mengakses miliknya).
- Field `role` diabaikan di SECURE.
- 401 tanpa token / token rusak, 404 untuk resource tidak ada.
- Default bind `127.0.0.1`, peringatan keras untuk `HOST` non-loopback.
- Dependency produksi bebas native addon.

Pemeriksaan native addon juga bisa dijalankan terpisah:

```bash
node scripts/check-native-deps.js
```

---

## 3. Akun demo

| Username | Password | Role | ID | Catatan |
|---|---|---|---|---|
| `alice` | `Password123!` | customer | 1001 | order 5001, 5004; alamat 3001; tiket 4001, 4004 |
| `bob` | `Password123!` | customer | 1002 | order 5002, 5005; alamat 3002; tiket 4002 |
| `dian` | `Password123!` | customer | 2001 | akun korban demo penghapusan; order 5003, 5006; tiket 4003 |
| `admin` | `Admin!2024` | admin | 9001 | Rani Kusnadi, staf operasional |

Token disimpan frontend di `localStorage` dan dikirim sebagai
`Authorization: Bearer <token>`. Token kedaluwarsa 2 jam; restart server juga
membuat semua token lama tidak valid (secret baru).

---

## 4. Reset data

Tidak ada endpoint reset. **Hentikan server (Ctrl+C) lalu jalankan ulang.**
Seed awal dimuat dari `data/seed.json` setiap proses start. Perubahan dari demo
(alamat diubah, user dihapus, role dinaikkan) hilang setelah restart.

---

## 5. Mode VULN vs SECURE

`SECURE_MODE=false` (default) → guard otorisasi di `server/authz.js` menjadi
no-op untuk route yang memang ditandai rentan. `SECURE_MODE=true` →
semua guard aktif.

Perbedaan perilaku:

| Endpoint | VULN | SECURE |
|---|---|---|
| `POST /api/auth/login` | login normal | sama |
| `GET /api/users/:id/profile` | user mana pun (IDOR baca) | 403 kecuali pemilik/admin |
| `GET /api/orders/:id` | order siapa pun | 403 kecuali pemilik |
| `GET /api/tickets/:id` | tiket siapa pun, termasuk `internalNotes` | 403 kecuali pemilik |
| `PATCH /api/addresses/:id` | alamat siapa pun bisa diubah | 403 kecuali pemilik |
| `PATCH /api/users/me` | `role` diterima (mass assignment) | `role` diabaikan |
| `GET /api/admin/users` | tanpa cek role (BFLA) | 403 untuk non-admin |
| `DELETE /api/admin/users/:id` | tanpa cek role (BFLA) | 403 untuk non-admin |
| `GET /api/admin/audit-log` | **403 untuk non-admin** | 403 untuk non-admin |

Baris terakhir adalah **kontrol negatif**: endpoint tersembunyi yang berhasil
ditemukan belum tentu rentan. Ini sengaja supaya peserta tidak menyimpulkan
“bisa menemukan endpoint = temuan”.

Setiap titik rentan ditandai komentar di source:

```js
// VULN[BFLA - missing authorization check]: ...
// FIX: requireRole('admin') menolak (403) saat SECURE_MODE=true.
```

Cari semua penanda:

```bash
grep -rn "VULN\[" server/
```

`server/authz.js` adalah satu-satunya tempat guard:

- `requireAuth` — selalu aktif di kedua mode.
- `requireRole(role, { enforce })` — no-op di VULN kecuali `enforce: true`.
- `ownerOnly(resolveOwnerId, { allowAdmin })` — no-op di VULN.
- `pickAllowedFields(...fields)` — whitelist field, dipakai di kedua mode.

`requireAuth` memuat ulang user dari store pada setiap request (bukan dari klaim
token). Efek yang disengaja: perubahan `role` di store langsung berlaku pada
request berikutnya, sehingga eskalasi lewat `PATCH /api/users/me` bisa
dibuktikan tanpa login ulang.

---

## 6. Bahan recon yang tersedia

- `/openapi.json` — dokumen **parsial**, memuat sebagian endpoint termasuk
  `/api/admin/users`, `/api/admin/users/{id}`, dan `/api/admin/audit-log`.
- Bundle frontend `server/public/assets/*.js` — **tidak diminify**, berisi
  halaman/panel admin dan path API.
- `server/public/assets/*.js.map` — sourcemap aktif; source asli bisa dipulihkan.
- Panel admin ada di bundle untuk semua user, tetapi menu “Operasional” hanya
  dirender untuk role `admin` di sisi klien. UI adalah kontrol tampilan, bukan
  kontrol akses.

Contoh:

```bash
curl -s http://127.0.0.1:3000/openapi.json | head -c 400
grep -o '/api/admin/[a-z-]*' server/public/assets/*.js | sort -u
```

---

## 7. Burp Suite dan localhost

Browser modern sering **tidak** meneruskan trafik `localhost`/`127.0.0.1` lewat
proxy, sehingga request tidak muncul di Burp. Dua solusi:

1. **Pakai browser bawaan Burp** — Proxy → Intercept → **Open browser**, lalu
   buka `http://127.0.0.1:3000`.
2. **Firefox** — buka `about:config`, set
   `network.proxy.allow_hijacking_localhost` = `true`, lalu konfigurasi proxy
   manual ke `127.0.0.1:8080`.

Pastikan Burp tidak memblokir `127.0.0.1` di daftar “TLS pass through” dan
matikan cache browser saat membandingkan VULN vs SECURE.

---

## 8. Packaging portable (Windows)

```bash
npm run build
npm run portable            # = npm run build + node scripts/make-portable.js
```

Hasil: `release/lab/` dan `release/bac-lab-portable.zip`.

Isi paket:

```text
release/lab/
├─ node.exe                 # diunduh resmi dari nodejs.org saat perakit menjalankan skrip
├─ server/                  # Express + routes + public/ (hasil build)
├─ data/seed.json
├─ node_modules/            # produksi saja (npm ci --omit=dev)
├─ start.bat                # SECURE_MODE=false
├─ start-secure.bat         # SECURE_MODE=true
├─ start.sh                 # macOS/Linux, memakai Node terpasang
└─ README.txt
```

Peserta Windows hanya perlu mengekstrak zip lalu double-click `start.bat`.
Tidak perlu Node.js, npm, atau hak administrator.

Opsi:

```bash
NODE_VERSION=22.11.0 npm run portable   # versi Node Windows yang diunduh
SKIP_ZIP=1 npm run portable             # hanya folder, tanpa zip
```

Alternative native Windows (PowerShell 5.1+):

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File scripts\make-portable.ps1
```

Catatan: `node.exe` diunduh saat **perakitan**, bukan saat peserta menjalankan
lab. Di mesin tanpa internet, siapkan `node.exe` secara manual di
`release/lab/` atau gunakan `start.sh` dengan Node yang sudah terpasang.

---

## 9. Struktur proyek

```text
.
├─ server/
│  ├─ index.js          # entry: config, banner, bind, shutdown
│  ├─ app.js            # createApp({ secure }), static, SPA fallback, error JSON
│  ├─ authz.js          # requireAuth, requireRole, ownerOnly, pickAllowedFields
│  ├─ auth.js           # bcrypt + JWT (secret acak per proses)
│  ├─ db.js             # store in-memory dari data/seed.json
│  ├─ config.js         # HOST/PORT/SECURE_MODE, deteksi loopback
│  ├─ http.js           # format error konsisten
│  ├─ openapi.js        # dokumen OpenAPI parsial
│  ├─ routes/           # auth, users, addresses, orders, tickets, admin
│  └─ public/           # hasil build frontend (diabaikan git)
├─ client/
│  ├─ index.html
│  ├─ vite.config.mjs   # outDir server/public, minify:false, sourcemap:true
│  └─ src/              # React: pages, router kecil, auth context, styles
├─ data/seed.json       # 4 user, 6 order, 4 alamat, 4 tiket, audit log awal
├─ tests/               # node:test (access-control + runtime)
├─ scripts/
│  ├─ check-native-deps.js
│  ├─ make-portable.js
│  └─ make-portable.ps1
├─ docs/
│  ├─ FACILITATOR.md
│  ├─ PARTICIPANT.md
│  └─ remediation.md
├─ start.sh
└─ package.json
```

---

## 10. Asumsi dan keputusan teknis

1. **Express 4**, bukan 5, agar perilaku middleware stabil dan mudah dijelaskan.
2. **`bcryptjs`** dan **`jsonwebtoken`** dipilih karena pure JavaScript; tidak
   ada native addon di dependency produksi. Vite/esbuild adalah dev dependency
   (binary native) dan tidak ikut ke paket portable.
3. **`node:test`** tanpa framework tambahan; server dijalankan di port acak.
4. **Data in-memory**; seed tidak disimpan kembali ke disk, sehingga peserta
   selalu bisa mengulang dari kondisi awal.
5. **Token memuat `sub`, `username`, `role`** untuk kenyamanan, tetapi
   otorisasi selalu memakai user yang dimuat ulang dari store. Ini membuat
   eskalasi role langsung terlihat, tanpa mengorbankan validitas JWT.
6. **Frontend memakai router kecil buatan sendiri** (history API) agar tidak
   menambah dependency dan mudah dibaca saat sourcemap dibuka.
7. **`GET /api/addresses` dan `GET /api/orders`/`GET /api/tickets`** selalu
   mengembalikan data milik token yang dipakai — di kedua mode. IDOR ada pada
   endpoint detail berbasis `:id`, sesuai tabel skenario.
8. **Panel admin** tetap ada di bundle untuk semua user; menu dan tombol hanya
   disembunyikan di klien. Ini adalah bahan demo “UI bukan kontrol akses”.
9. **Kontrol negatif audit-log** sengaja memakai `requireRole('admin', { enforce: true })`,
   sehingga 403 di kedua mode.
10. **Tidak ada endpoint reset, upload, atau fitur yang mengeksekusi kode.**
    Semua input divalidasi sebagai string dengan batas panjang; tidak ada
    template engine, `eval`, atau akses filesystem dari input pengguna.

---

## 11. Yang belum diverifikasi

- **Packaging Windows** (`make-portable.js`/`.ps1`): logika diuji di Linux
  (unduh `node.exe`, `npm ci --omit=dev`, zip), tetapi eksekusi `start.bat`,
  `node.exe`, dan `Compress-Archive` pada Windows asli belum dijalankan di sini.
- **Proxy localhost**: perilaku Burp vs browser tidak bisa dijamin dari sini;
  ikuti dua solusi di bagian 7 dan uji di laptop peserta.
- **Tampilan pada browser fisik** diverifikasi dengan Chromium headless pada
  viewport desktop; kombinasi browser/OS lain belum diuji.

---

## 12. Dokumen pendamping

- [`docs/FACILITATOR.md`](docs/FACILITATOR.md) — peta skenario ke Demo 02/03/04
  dan hands-on, request contoh, expected vs actual, dampak.
- [`docs/PARTICIPANT.md`](docs/PARTICIPANT.md) — tugas berbasis skenario dan
  template PoC.
- [`docs/remediation.md`](docs/remediation.md) — pasangan snippet
  VULNERABLE vs SECURE per endpoint.
# AccesControl_vuln
# AccesControl_vuln
