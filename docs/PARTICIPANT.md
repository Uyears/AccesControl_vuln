# PARTICIPANT — Lembar Kerja Broken Access Control

Anda memegang satu akun pelanggan di **Nusa Supply**, toko online fiktif.
Tugas Anda bukan “menebak flag”, melainkan membuktikan bahwa kontrol akses
aplikasi ini bisa dilewati — lalu menjelaskan buktinya.

> Lab ini sengaja rentan dan hanya berjalan di laptop Anda.
> **Jangan** memakai teknik yang sama pada sistem tanpa izin tertulis.

---

## Persiapan

1. Fasilitator menjalankan server lab di laptop.
2. Buka `http://127.0.0.1:3000`.
3. Daftar akun pelanggan baru lewat halaman **Daftar**, atau pakai akun yang
   dibagikan fasilitator secara lisan. Jangan memakai kredensial bawaan yang
   tidak diberikan kepada Anda.
4. Buka Burp Suite dan pastikan request `fetch` ke `/api/...` terlihat.
   Jika tidak muncul: pakai browser bawaan Burp, atau di Firefox set
   `network.proxy.allow_hijacking_localhost = true`.
5. Perhatikan header `Authorization: Bearer <token>` pada setiap request.
   Token juga tersimpan di `localStorage` browser.

Akun hasil registrasi selalu berperan `customer`. Akun staf dan penjual hanya
tersedia bila fasilitator memberikannya.

---

## Tugas

### Recon: apa yang tidak terlihat di menu

Aplikasi pelanggan hanya menampilkan Katalog, Ringkasan, Pesanan, Invoice,
Bantuan, dan Jurnal. Cari tahu apa lagi yang bisa diakses.

- Periksa `/openapi.json`.
- Buka bundle JavaScript dan sourcemap di DevTools.
- Cari path yang tidak muncul di navigasi.

Yang perlu Anda catat: path apa yang ditemukan, dari mana asalnya, dan apakah
path itu benar-benar bisa dipanggil.

### Membedakan tersembunyi dan rentan

Ada satu endpoint admin yang sengaja **tidak** ikut melemah. Coba akses dengan
token pelanggan Anda, lalu jelaskan mengapa hasilnya bukan temuan.

Pertanyaan: apa perbedaan antara “endpoint berhasil ditemukan” dan “endpoint
salah otorisasi”? Sertakan status code sebagai bukti.

### Buktikan kamu bisa melihat data pelanggan lain

Gunakan Burp atau `curl` untuk:

1. Menemukan akun pelanggan lain dari endpoint yang tidak seharusnya Anda
   akses. Catat bagaimana kamu mendapatkan ID-nya.
2. Membaca order milik akun tersebut.
3. Membaca profilnya.
4. Membaca tiket support milik pelanggan lain.

Untuk tiap percobaan, simpan request dan respons. Tunjukkan field mana yang
seharusnya tidak Anda lihat. Perhatikan apakah ada data pengiriman, nomor
telepon, atau catatan internal.

### Buktikan kamu bisa mengubah data orang lain

Ubah alamat pengiriman milik pelanggan lain. Kirim body yang masuk akal (lihat
field pada alamat Anda sendiri), lalu buktikan perubahan itu terbaca oleh
aplikasi.

Pertanyaan: field `id` ada di body request. Apakah mengubahnya mengubah target?
Mengapa?

### Naikkan hak akses Anda

Coba kirim field tambahan yang tidak ada di form profil. Apakah server
menerimanya? Jika ya, buktikan bahwa hak akses Anda benar-benar berubah, bukan
hanya tampilan.

Setelah itu, akses salah satu endpoint operasional dan lakukan satu aksi yang
seharusnya hanya boleh dilakukan staf. Catat siapa yang terdampak.

### Bandingkan dengan bentuk perbaikan

Lab ini hanya punya satu perilaku: rentan. Untuk melihat bentuk perbaikannya,
buka `server/authz.js` dan `docs/remediation.md`, lalu bandingkan:

- Guard mana yang di lab sengaja no-op, dan apa isi guard yang benar?
- Mengapa `role` harus diambil dari token, bukan cookie atau `Referer`?
- Mengapa endpoint kontrol negatif tetap 403 tanpa mengubah kode route?

Simpan catatan sebelum vs sesudah. Ini bagian yang membedakan “menemukan bug”
dari “memahami perbaikan”.

### Jelaskan dampaknya

Untuk satu temuan yang paling kuat, tuliskan dampak konkret: data atau aksi
apa, milik siapa, dan apa konsekuensinya pada objek di lab ini.
Hindari kalimat umum seperti “bisa menyebabkan kebocoran data”. Sebutkan
field, objek, dan aksi.

---

## Yang harus dikumpulkan

Satu PoC untuk satu temuan (boleh lebih), masing-masing berisi:

1. **Judul** singkat dan spesifik.
2. **Request** lengkap (method, path, header, body).
3. **Response** aktual (status + body yang relevan).
4. **Expected** — apa yang seharusnya terjadi.
5. **Actual** — apa yang benar-benar terjadi.
6. **Dampak** — siapa/apa yang terdampak, dengan bukti dari lab.
7. **Catatan perbaikan** — satu atau dua kalimat, bukan esai.

Jangan menyertakan token asli di laporan akhir; ganti dengan `<TOKEN>`.

---

## Template PoC

```markdown
### <judul temuan>

**Aktor:** pelanggan biasa (akun Anda)
**Target:** <endpoint + id objek>
**Perilaku:** rentan

**Request**
```http
<METHOD> <path> HTTP/1.1
Host: 127.0.0.1:3000
Authorization: Bearer <TOKEN>
Content-Type: application/json

<body bila ada>
```

**Response aktual**
```http
HTTP/1.1 <status>
Content-Type: application/json

<body yang relevan, boleh dipotong dengan jelas>
```

**Expected:** <status/perilaku yang benar>

**Actual:** <status/perilaku yang terjadi>

**Dampak:** <data/aksi konkret, pemilik objek, konsekuensi>

**Perbaikan yang disarankan:** <guard/allowlist di server, bukan di UI>
```

---

## Pertanyaan penutup

1. Di endpoint mana keputusan otorisasi hilang: object-level, function-level,
   atau keduanya?
2. Mengapa menyembunyikan tombol di UI bukan perbaikan?
3. Mengapa allowlist field lebih aman daripada menghapus `role` dari body?
4. Apa yang membuat sebuah temuan layak dilaporkan, dan apa yang hanya
   merupakan hasil recon?
5. Setelah membaca `docs/remediation.md`, perubahan server mana yang paling
   kecil namun menutup seluruh kelas masalah ini?
