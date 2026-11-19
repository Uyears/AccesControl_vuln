# Remediation — Broken Access Control

Dokumen ini memetakan perilaku rentan di lab ke perbaikannya. Snippet
“VULNERABLE” diambil dari source lab (`server/`), sedangkan snippet
“DIPERBAIKI” menunjukkan bentuk guard yang benar. Saat Demo 04, tunjukkan file
asli dan komentar `// VULN[...]` / `// FIX:` di route, bukan pseudo-code.

Prinsip yang dipakai:

1. **Autentikasi ≠ otorisasi.** `requireAuth` hanya menjawab “siapa Anda”.
   Setiap resource tetap butuh keputusan “boleh atau tidak”.
2. **Object-level authorization** dicek di server, memakai identitas pemilik
   dari store — bukan dari body, query, atau klaim token.
3. **Function-level authorization** memakai role dari store, bukan dari UI,
   cookie, atau header.
4. **Mass assignment** dicegah dengan allowlist field, bukan blocklist.
5. **Satu perilaku per build.** Lab ini sengaja hanya menjalankan perilaku
   rentan; perbaikan ditunjukkan lewat kode dan tes, bukan flag runtime.

Data in-memory kembali ke seed saat server di-restart.

---

## 0. Guard terpusat — `server/authz.js`

VULNERABLE (kondisi lab):

```js
// requireRole sengaja no-op: route admin hanya "dilindungi" UI.
function requireRole(role) {
  return function roleGuard(req, res, next) {
    return next();
  };
}

// ownerOnly sengaja no-op: resource siapa pun boleh diakses.
function ownerOnly(resolveOwnerId, options = {}) {
  return function ownerGuard(req, res, next) {
    return next();
  };
}
```

DIPERBAIKI:

```js
function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== role) {
      return forbidden(res, 'Role akun Anda tidak diizinkan untuk operasi ini.');
    }
    return next();
  };
}

function ownerOnly(resolveOwnerId) {
  return function ownerGuard(req, res, next) {
    const ownerId = resolveOwnerId(req);
    if (ownerId === undefined || ownerId === null) {
      return notFound(res, 'Resource tidak ditemukan.');
    }
    const isOwner = String(ownerId) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return forbidden(res, 'Anda bukan pemilik resource ini.');
    }
    return next();
  };
}
```

`requireAuth` **tidak** ikut di-no-op-kan: tanpa token tetap 401; token rusak
tetap 401. Satu-satunya guard role yang sudah benar di lab adalah
`requireRoleStrict('admin')`, dipakai oleh endpoint kontrol negatif audit-log.

---

## 1. `GET /api/users/:id/profile` — IDOR baca (horizontal)

VULNERABLE — `server/routes/users.routes.js`:

```js
router.get(
  '/:id/profile',
  requireAuth,
  ownerOnly((req) => {
    const user = req.app.locals.db.findUserById(req.params.id);
    return user ? user.id : undefined;
  }, { allowAdmin: true }),
  (req, res) => {
    const user = req.app.locals.db.findUserById(req.params.id);
    if (!user) return notFound(res, 'User tidak ditemukan.');
    return res.json({ user: toPublicUser(user) });
  }
);
// ownerOnly no-op -> pelanggan A membaca profil pelanggan B
```

DIPERBAIKI — guard yang sama, sekarang mengeksekusi pengecekan:

```js
router.get('/:id/profile', requireAuth, ownerOnly(resolveUserOwner), (req, res) => {
  // ownerOnly sudah menolak 403 bila user.id !== req.user.id dan bukan admin
});
```

Hasil: akun customer A → `GET /api/users/<id milik customer B>` = **403**, bukan 200. Perbaiki juga
`GET /api/users/profile?userId=` yang mengambil target dari query, bukan token.

---

## 2. `GET /api/orders/:id` — IDOR baca order

VULNERABLE — `server/routes/orders.routes.js`:

```js
router.get('/:id', requireAuth, ownerOnly(resolveOrderOwner), (req, res) => {
  const order = req.app.locals.db.findOrder(req.params.id);
  if (!order) return notFound(res, 'Order tidak ditemukan.');

  const address = req.app.locals.db.findAddress(order.addressId);
  return res.json({ order, address }); // VULN: tanpa cek kepemilikan
});
```

DIPERBAIKI:

```js
function resolveOrderOwner(req) {
  const order = req.app.locals.db.findOrder(req.params.id);
  return order ? order.userId : undefined;
}

router.get('/:id', requireAuth, ownerOnly(resolveOrderOwner), (req, res) => {
  // ownerOnly menolak 403 bila order.userId !== req.user.id
});
```

Perhatikan: owner diambil dari record order, bukan dari parameter request.
Mengubah `id` di URL justru memilih objek lain yang tetap harus ditolak.

---

## 3. `GET /api/tickets/:id` — IDOR baca tiket + data internal

VULNERABLE — `server/routes/tickets.routes.js`:

```js
router.get('/:id', requireAuth, ownerOnly(resolveTicketOwner), (req, res) => {
  const ticket = req.app.locals.db.findTicket(req.params.id);
  if (!ticket) return notFound(res, 'Tiket tidak ditemukan.');
  return res.json({ ticket }); // termasuk internalNotes
});
```

DIPERBAIKI: guard aktif; tiket hanya bisa dibaca pemiliknya (atau admin).

```js
router.get('/:id', requireAuth, ownerOnly(resolveTicketOwner), (req, res) => {
  // 403 bila ticket.userId !== req.user.id
});
```

Catatan: `internalNotes` adalah data sensitif. Setelah otorisasi diperbaiki,
pisahkan representasi staf dan pelanggan (defense in depth). Lab ini fokus pada
object-level authorization, bukan redaksi field.

---

## 4. `PATCH /api/addresses/:id` — IDOR tulis (horizontal)

VULNERABLE — `server/routes/addresses.routes.js`:

```js
router.patch(
  '/:id',
  requireAuth,
  ownerOnly(resolveAddressOwner),
  (req, res) => {
    const address = req.app.locals.db.findAddress(req.params.id);
    if (!address) return notFound(res, 'Alamat tidak ditemukan.');

    const patch = pickAllowedFields(ADDRESS_FIELDS)(req.body); // field-level aman
    const updated = req.app.locals.db.updateAddress(address.id, patch); // VULN
    return res.json({ address: updated });
  }
);
```

DIPERBAIKI:

```js
function resolveAddressOwner(req) {
  const address = req.app.locals.db.findAddress(req.params.id);
  return address ? address.userId : undefined;
}

router.patch('/:id', requireAuth, ownerOnly(resolveAddressOwner), (req, res) => {
  // 403 bila bukan pemilik
});
```

Dua lapis yang harus dibedakan:

- **Field-level allowlist** (`id`, `userId` diabaikan) sudah ada di lab.
  Ini mencegah penyerang memindahkan alamat ke akun lain lewat body.
- **Object-level authorization** adalah materi lab: siapa yang boleh
  menyentuh alamat tersebut. Allowlist field tidak memperbaikinya.

`id` di body tidak menentukan target; path yang menentukan. Karena itu
menambahkan pengecekan pada `body.id` bukan perbaikan.

---

## 5. `PATCH /api/users/me` — mass assignment → privilege escalation

VULNERABLE — `server/routes/users.routes.js`:

```js
function pickVulnerablePatch(body) {
  const patch = { ...body }; // semua field disalin
  for (const field of IMMUTABLE_FIELDS) delete patch[field];
  delete patch.__proto__;
  return patch; // termasuk `role`
}

router.patch('/me', requireAuth, (req, res) => {
  const patch = pickVulnerablePatch(req.body); // VULN
  const updated = req.app.locals.db.updateUser(req.user.id, patch);
  return res.json({ user: toPublicUser(updated) });
});
```

DIPERBAIKI:

```js
const PROFILE_FIELDS = ['name', 'email', 'phone'];

router.patch('/me', requireAuth, (req, res) => {
  const patch = pickAllowedFields(PROFILE_FIELDS)(req.body); // `role` dibuang
  // ...
  const updated = req.app.locals.db.updateUser(req.user.id, patch);
  return res.json({ user: toPublicUser(updated) });
});
```

Request `{"role":"admin"}` tetap dijawab **200** (idempoten), tetapi tidak ada
field yang berubah dan role tetap `customer`. Klien tidak perlu menangani error
khusus untuk field yang diabaikan.

Mengapa allowlist: blocklist (`delete body.role`) rapuh — field baru di masa
depan otomatis lolos. Allowlist membalik default menjadi “tolak kecuali
diizinkan”.

Perbaiki juga endpoint role-change dua langkah: customer tidak boleh membuat
maupun menyetujui permintaan role untuk dirinya sendiri.

---

## 6. `GET /api/admin/users` — missing authorization (BFLA)

VULNERABLE — `server/routes/admin.routes.js`:

```js
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = req.app.locals.db.listUsers();
  res.json({ users, count: users.length });
});
// requireRole no-op -> customer melihat semua akun
```

DIPERBAIKI:

```js
router.get('/users', requireAuth, requireRoleStrict('admin'), (req, res) => {
  // non-admin -> 403
});
```

Yang berubah bukan route-nya, melainkan apakah guard mengeksekusi pengecekan.
Karena itu komentar VULN/FIX diletakkan di guard dan di route.

---

## 7. `DELETE /api/admin/users/:id` — BFLA destruktif

VULNERABLE:

```js
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const target = req.app.locals.db.findUserById(req.params.id);
  if (!target) return notFound(res, 'User tidak ditemukan.');
  if (target.id === req.user.id) {
    return badRequest(res, 'Akun yang sedang dipakai tidak bisa dihapus.');
  }
  req.app.locals.db.deleteUser(target.id);
  return res.status(204).end();
});
```

DIPERBAIKI: `requireRoleStrict('admin')` → non-admin **403**. Admin tetap bisa
menghapus, dan akun sendiri tetap tidak bisa dihapus.

Catatan: tombol “Hapus” di UI hanya disembunyikan untuk non-admin. UI bukan
kontrol akses; request langsung tetap harus ditolak server.

---

## 8. `GET /api/admin/audit-log` — kontrol negatif (tidak rentan)

Route ini **tidak** ikut di-no-op-kan:

```js
router.get(
  '/audit-log',
  requireAuth,
  requireRoleStrict('admin'),
  (req, res) => {
    res.json({ entries: req.app.locals.db.listAuditLog() });
  }
);
```

Hasil: customer selalu **403**. Ini contoh endpoint tersembunyi yang ditemukan
lewat recon tetapi tidak menghasilkan temuan.

---

## 9. Otorisasi dari input klien yang salah

### 9.1 Cookie `role` — `server/authz.js`

VULNERABLE:

```js
function requireCookieRole(role) {
  return function cookieRoleGuard(req, res, next) {
    if (!req.user) return unauthorized(res);
    if (readCookie(req, 'role') !== role) {
      return forbidden(res, 'Role sesi tidak diizinkan untuk operasi ini.');
    }
    return next();
  };
}
```

DIPERBAIKI:

```js
function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== role) return forbidden(res);
    return next();
  };
}
```

Ganti seluruh pemakaian `requireCookieRole` dengan `requireRole`. Cookie hanya
data yang dikirim klien; role harus berasal dari akun hasil verifikasi token.

### 9.2 Header `Referer` — `server/authz.js`

VULNERABLE:

```js
function refererGuard(options = {}) {
  const requiredPath = options.requiredPath || '/admin';
  return function refererAccessGuard(req, res, next) {
    if (!req.user) return unauthorized(res);
    const referer = req.get('referer');
    if (!referer || !referer.includes(requiredPath)) {
      return forbidden(res, 'Akses laporan hanya dari halaman operasional.');
    }
    return next();
  };
}
```

DIPERBAIKI: hapus `refererGuard` dari route dan pakai `requireRoleStrict('admin')`.
`Referer` dapat dipalsukan lewat Burp/curl dan tidak boleh menjadi kontrol akses.

---

## 10. Modul tambahan

| Endpoint | Perbaikan |
|---|---|
| `GET /api/company/invoices` | tambahkan `requireAuth` + `requireRoleStrict('admin')` |
| `GET /api/employees`, `/:guid` | tambahkan `requireAuth` + `requireRoleStrict('admin')` |
| `POST /api/cart/checkout` | pastikan `address.userId === req.user.id` sebelum membuat order |
| `PATCH /api/orders/:id` | aktifkan `ownerOnly(resolveOrderOwner, { allowAdmin: true })` |
| `GET /api/invoices/:id`, `/:id/pdf` | aktifkan `ownerOnly(resolveInvoiceOwner, { allowAdmin: true })` |
| `GET /api/documents/:id`, `/:id/download` | aktifkan `ownerOnly(resolveDocumentOwner, { allowAdmin: true })` |
| `POST /api/documents` | pastikan `folder.ownerId === req.user.id` |
| `GET /api/seller/*`, `POST/PATCH/DELETE /api/products` | gunakan `requireRole('seller')` dari token |
| `GET /api/articles/:slug` | jangan sertakan `authorProfile` internal pada respons publik |

---

## 11. Cara memverifikasi perbaikan

1. Terapkan guard di `server/authz.js` (bukan hanya di route).
2. Ganti setiap pemakaian guard no-op dengan guard yang mengeksekusi cek.
3. Tambahkan tes regresi: request penyerang harus **403**, pemilik tetap **200**,
   dan admin tetap **200** pada endpoint yang mengizinkan admin.
4. Tunjukkan baris tes yang mengunci perilaku tersebut (`npm test`).

Contoh assert untuk IDOR order:

```js
test('customer tidak bisa membaca order customer lain', async () => {
  const lab = await startApp();
  try {
    const token = await loginSebagaiCustomer(lab);
    const order = await orderMilikCustomerLain(lab);
    const response = await api(lab.base, 'GET', `/api/orders/${order.id}`, { token });
    assert.equal(response.status, 403);
  } finally {
    await lab.close();
  }
});
```

Tes yang ada di repo saat ini mengunci **perilaku rentan** (status 200/204).
Saat memperbaiki lab, ubah ekspektasi tes ke 403 dan tambahkan tes pemilik agar
perbaikan tidak menutup akses yang sah.
