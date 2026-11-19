# Nusa Supply — Broken Access Control Lab

Aplikasi toko online kecil yang **sengaja rentan** untuk seminar
**“Beyond Authentication: Exploiting Broken Access Control”**.

> **Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.**

Semua data fiktif dan disimpan di memori. Aplikasi hanya untuk dijalankan di laptop
peserta (`127.0.0.1`), bukan untuk di-hosting. Satu-satunya kelas kelemahan yang
ditanam adalah **otorisasi** (IDOR/BOLA, BFLA, mass assignment, dan kontrol akses
yang bergantung pada input klien). Autentikasi, penyimpanan password, dan
penandatanganan token sengaja dibuat benar.

Lab ini sengaja hanya punya **perilaku rentan**. Tidak ada flag runtime untuk
mengaktifkan perilaku aman. Perbaikan dipelajari lewat komentar `// FIX:`,
`docs/remediation.md`, dan tes yang mengunci perilaku rentan.

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
| Dependency produksi | `express`, `jsonwebtoken`, `bcryptjs`, `multer`, `pdf-lib` — semuanya pure JS |
| Tes | `node:test`, 30 tes, server di port acak |

---

## 2. Menjalankan

Prasyarat: **Node.js 18.17+** (diuji pada Node 24.22) dan npm.

```bash
npm install
npm run build      # build frontend ke server/public
npm start          # -> http://127.0.0.1:3000
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

Tes menjalankan `createApp()` pada port acak. Cakupan:

- IDOR baca profil/order/tiket, IDOR tulis alamat, eskalasi role lewat mass
  assignment, dan BFLA daftar/hapus user.
- Modul tambahan: invoice partner, direktori staf, checkout, ubah order,
  dokumen, cookie role, dan ekspor laporan berbasis `Referer`.
- Kontrol negatif `/api/admin/audit-log` → **selalu 403** untuk non-admin.
- 401 tanpa token / token rusak, 404 untuk resource tidak ada.
- Default bind `127.0.0.1`, peringatan keras untuk `HOST` non-loopback.
- Dependency produksi bebas native addon.

Pemeriksaan native addon juga bisa dijalankan terpisah:

```bash
node scripts/check-native-deps.js
```

---

## 3. Akun latihan

| Peran | Username | Password | Catatan |
|---|---|---|---|
| customer | `alice` | `Password123!` | Akun utama hands-on; punya order 5001 dan tiket 4001 |
| customer | `bob` | `Password123!` | Pemilik order 5002 dan alamat 3002 (target IDOR) |
| customer | `dian` | `Password123!` | Akun korban untuk demo `DELETE /api/admin/users/:id` |
| seller | `toko.alpha` | `Seller123!` | Produk Alpha Works; panel penjual |
| seller | `toko.bravo` | `Seller123!` | Produk Bravo Office; panel penjual |
| admin | `admin` | `Admin!2024` | Panel operasional dan audit log |

Halaman **Daftar** terbuka untuk membuat akun pelanggan baru; akun hasil
registrasi selalu berperan `customer`. Restart server menghapus akun baru dan
mengembalikan seluruh seed.

Token disimpan frontend di `localStorage` dan dikirim sebagai
`Authorization: Bearer <token>`. Token kedaluwarsa 2 jam; restart server juga
membuat semua token lama tidak valid (secret baru).

---

## 4. Reset data

Tidak ada endpoint reset. **Hentikan server (Ctrl+C) lalu jalankan ulang.**
Seed awal dimuat dari `data/seed.json` setiap proses start. Perubahan dari demo
(alamat diubah, user dihapus, role dinaikkan) hilang setelah restart.

---

## 5. Perilaku rentan yang ditanam

Semua guard otorisasi ada di `server/authz.js` dan sengaja no-op kecuali
`requireAuth` serta guard kontrol negatif audit-log.

| Endpoint | Perilaku di lab | Yang seharusnya |
|---|---|---|
| `POST /api/auth/login` | login normal, balas token | sama |
| `GET /api/users/:id/profile` | user mana pun (IDOR baca) | 403 kecuali pemilik/admin |
| `GET /api/users/profile?userId=` | user mana pun (IDOR via query) | 403 kecuali pemilik/admin |
| `GET /api/orders/:id` | order siapa pun beserta alamat | 403 kecuali pemilik |
| `PATCH /api/orders/:id` | status order siapa pun bisa diubah | 403 kecuali pemilik/admin |
| `GET /api/tickets/:id` | tiket siapa pun, termasuk `internalNotes` | 403 kecuali pemilik |
| `POST /api/tickets/:id/messages` | balasan bisa ditulis ke tiket siapa pun | 403 kecuali pemilik |
| `GET /api/addresses/:id` | alamat siapa pun | 403 kecuali pemilik |
| `PATCH /api/addresses/:id` | alamat siapa pun bisa diubah | 403 kecuali pemilik |
| `PATCH /api/users/me` | `role` diterima (mass assignment) | allowlist `name/email/phone` |
| `GET /api/admin/users` | tanpa cek role (BFLA) | 403 untuk non-admin |
| `DELETE /api/admin/users/:id` | tanpa cek role (BFLA) | 403 untuk non-admin |
| `PATCH /api/admin/users/:id` | status akun siapa pun bisa diubah (BFLA) | 403 untuk non-admin |
| `POST /api/admin/users/:id/role-change` | customer boleh mengajukan | 403 untuk non-admin |
| `PATCH /api/admin/role-change-requests/:id/approve` | customer menyetujui miliknya sendiri | 403 untuk non-admin |
| `GET/PATCH /api/admin/settings` | hanya cek cookie `role=admin` | role dari token |
| `GET /api/admin/stats`, `/api/admin/orders` | tanpa cek role | 403 untuk non-admin |
| `GET /api/admin/reports/export` | hanya cek header `Referer` | role dari token |
| `GET /api/admin/audit-log` | **403 untuk non-admin** | 403 untuk non-admin |
| `GET /api/company/invoices` | tanpa autentikasi | auth + role partner |
| `GET /api/employees` | tanpa autentikasi | auth + role internal |
| `POST /api/cart/checkout` | alamat milik user lain diterima | alamat harus milik pemanggil |
| `GET /api/invoices/:id`, `/:id/pdf` | invoice siapa pun | 403 kecuali pemilik |
| `GET /api/documents/:id/download` | dokumen siapa pun | 403 kecuali pemilik/folder |
| `POST /api/documents` | menulis ke folder partner mana pun | folder harus milik pemanggil |
| `GET /api/seller/*`, `POST /api/products` | cookie `role=seller` dipercaya | role dari token |
| `GET /api/articles/:slug` | memuat profil internal penulis | hanya field publik |

`GET /api/admin/audit-log` adalah **kontrol negatif**: endpoint tersembunyi yang
berhasil ditemukan belum tentu rentan. Ini sengaja supaya peserta tidak
menyimpulkan “bisa menemukan endpoint = temuan”.

Setiap titik rentan ditandai komentar di source:

```js
// VULN[BFLA - missing authorization check]: ...
// FIX: requireRoleStrict('admin') menolak non-admin dengan 403.
```

Cari semua penanda:

```bash
grep -rn "VULN\[" server/
```

Guard di `server/authz.js`:

- `requireAuth` — selalu aktif: token diverifikasi, user dimuat dari store.
- `requireRole(role)` — sengaja no-op (missing function-level authorization).
- `requireRoleStrict(role)` — guard yang benar; dipakai endpoint kontrol negatif.
- `requireCookieRole(role)` — mempercayai cookie `role` yang dapat diubah klien.
- `refererGuard({ requiredPath })` — mempercayai header `Referer`.
- `ownerOnly(resolveOwnerId, { allowAdmin })` — sengaja no-op.
- `pickAllowedFields(...fields)` — allowlist field; dipakai pada alamat, tetapi
  tidak pada `PATCH /api/users/me`.

`requireAuth` memuat ulang user dari store pada setiap request (bukan dari klaim
token). Efek yang disengaja: perubahan `role` di store langsung berlaku pada
request berikutnya, sehingga eskalasi lewat `PATCH /api/users/me` bisa
dibuktikan tanpa login ulang.

---

## 6. Bahan recon yang tersedia

- `/openapi.json` — inventaris **lengkap** seluruh route dan method API, termasuk
  endpoint yang tidak ditautkan dari UI seperti `/api/admin/*`,
  `/api/company/invoices`, dan `/api/employees`.
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
matikan cache browser saat membandingkan respons.

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
├─ start.bat
├─ start.sh                 # macOS/Linux, memakai Node terpasang
└─ README.txt
```

Peserta Windows hanya perlu mengekstrak zip lalu double-click `start.bat`.
Tidak perlu Node.js, npm, atau hak administrator. Server mencetak satu baris
peringatan dan URL; tidak ada banner tambahan.

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
│  ├─ app.js            # createApp(), static, SPA fallback, error JSON
│  ├─ authz.js          # requireAuth, role/cookie/owner guards, pickAllowedFields
│  ├─ auth.js           # bcrypt + JWT (secret acak per proses)
│  ├─ db.js             # store in-memory dari data/seed.json
│  ├─ config.js         # HOST/PORT, deteksi loopback
│  ├─ http.js           # format error konsisten
│  ├─ openapi.js        # dokumen OpenAPI parsial
│  ├─ routes/           # auth, users, orders, admin, produk, seller, dokumen, dll.
│  └─ public/           # hasil build frontend (diabaikan git)
├─ client/
│  ├─ index.html
│  ├─ vite.config.mjs   # outDir server/public, minify:false, sourcemap:true
│  └─ src/              # React: pages, router kecil, auth context, styles
├─ data/seed.json       # 6 user, 8 produk, 8 order, 6 alamat, 4 tiket, 3 artikel
├─ tests/               # node:test: access-control, modul, runtime, credential guard
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
   mengembalikan data milik token yang dipakai. IDOR ada pada endpoint detail
   berbasis `:id`, sesuai tabel skenario.
8. **Panel admin** tetap ada di bundle untuk semua user; menu dan tombol hanya
   disembunyikan di klien. Ini adalah bahan demo “UI bukan kontrol akses”.
9. **Kontrol negatif audit-log** memakai `requireRoleStrict('admin')`, sehingga
   selalu 403 untuk non-admin.
10. **Tidak ada endpoint reset atau fitur yang mengeksekusi kode.** Satu-satunya
    unggahan adalah dokumen teks (`.txt`, `.md`, `.csv`, `.log`) yang disimpan
    di memori; tidak ada akses filesystem dari input pengguna.

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
- [`docs/remediation.md`](docs/remediation.md) — pasangan snippet rentan vs
  perbaikan per endpoint.
