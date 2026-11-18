# Remediation — Broken Access Control

Dokumen ini memetakan setiap perilaku rentan ke perbaikannya. Snippet diambil
dari source yang sama dengan lab (`server/`), jadi saat Demo 04 Anda bisa
menunjukkan file asli, bukan pseudo-code.

Prinsip yang dipakai:

1. **Autentikasi ≠ otorisasi.** `requireAuth` hanya menjawab “siapa Anda”.
   Setiap resource tetap butuh keputusan “boleh atau tidak”.
2. **Object-level authorization** dicek di server, memakai identitas pemilik
   dari store — bukan dari body, query, atau klaim token.
3. **Fungsi-level authorization** memakai role dari store, bukan dari UI.
4. **Mass assignment** dicegah dengan allowlist field, bukan blocklist.
5. **Default aman**: `SECURE_MODE=true` mengaktifkan semua guard.

Untuk setiap pasangan di bawah, jalankan ulang server dalam mode yang
dibandingkan. Data in-memory kembali ke seed saat restart.

---

## 0. Guard terpusat — `server/authz.js`

VULNERABLE (default `SECURE_MODE=false`):

```js
function shouldEnforce(req, options) {
  if (options.enforce === true) return true;
  if (options.enforce === false) return false;
  return isSecure(req);          // false -> guard no-op
}

function ownerOnly(resolveOwnerId, options = {}) {
  return function ownerGuard(req, res, next) {
    if (!shouldEnforce(req, options)) return next();   // VULN
    // ...
  };
}
```

SECURE (`SECURE_MODE=true`):

```js
if (String(ownerId) !== String(req.user.id)) {
  return forbidden(res, 'Anda bukan pemilik resource ini.');
}
return next();
```

Catatan penting: `requireAuth` **tidak** ikut di-no-op-kan. Tanpa token tetap
401 di kedua mode. Satu-satunya guard yang memaksa aktif di mode VULN adalah
`requireRole('admin', { enforce: true })` untuk kontrol negatif audit-log.

---

## 1. `GET /api/users/:id/profile` — IDOR baca (horizontal)

VULNERABLE — `server/routes/users.routes.js`:

```js
router.get(
  '/:id/profile',
  requireAuth,
  ownerOnly((req) => req.params.id, { allowAdmin: true }),
  (req, res) => {
    const user = req.app.locals.db.findUserById(req.params.id);
    if (!user) return notFound(res, 'User tidak ditemukan.');
    return res.json({ user: toPublicUser(user) });
  }
);
// ownerOnly no-op saat SECURE_MODE=false -> pelanggan A membaca profil pelanggan B
```

SECURE — guard yang sama, sekarang mengeksekusi pengecekan:

```js
router.get(
  '/:id/profile',
  requireAuth,
  ownerOnly((req) => req.params.id, { allowAdmin: true }),
  (req, res) => { /* hanya pemilik atau admin */ }
);
```

Hasil: `pelanggan A → GET /api/users/1002/profile` = **403**, bukan 200.

---

## 2. `GET /api/orders/:id` — IDOR baca order

VULNERABLE — `server/routes/orders.routes.js`:

```js
router.get('/:id', requireAuth, ownerOnly(resolveOrderOwner), (req, res) => {
  const db = req.app.locals.db;
  const order = db.findOrder(req.params.id);
  if (!order) return notFound(res, 'Order tidak ditemukan.');

  const address = db.findAddress(order.addressId);
  return res.json({ order, address });   // VULN: tanpa cek kepemilikan
});
```

SECURE:

```js
function resolveOrderOwner(req) {
  const order = req.app.locals.db.findOrder(req.params.id);
  return order ? order.userId : undefined;
}

router.get('/:id', requireAuth, ownerOnly(resolveOrderOwner), (req, res) => {
  // ownerOnly sudah menolak 403 bila order.userId !== req.user.id
  // ...
});
```

Perhatikan: owner diambil dari record order, bukan dari parameter request.
Mengubah `id` di URL menjadi milik orang lain justru memicu 403.

---

## 3. `GET /api/tickets/:id` — IDOR baca tiket + data internal

VULNERABLE — `server/routes/tickets.routes.js`:

```js
router.get('/:id', requireAuth, ownerOnly(resolveTicketOwner), (req, res) => {
  const ticket = req.app.locals.db.findTicket(req.params.id);
  if (!ticket) return notFound(res, 'Tiket tidak ditemukan.');
  return res.json({ ticket });   // termasuk internalNotes
});
```

SECURE: guard aktif; tiket 4003 hanya bisa dibaca pemiliknya (atau admin lewat
alur operasional yang memang berhak).

```js
router.get('/:id', requireAuth, ownerOnly(resolveTicketOwner), (req, res) => {
  // 403 bila ticket.userId !== req.user.id
});
```

Catatan: `internalNotes` adalah field data yang sensitif. Bahkan setelah
otorisasi diperbaiki, pertimbangkan memisahkan endpoint/representasi untuk
staf dan pelanggan (defense in depth). Lab ini fokus pada object-level
authorization, bukan redaksi field.

---

## 4. `PATCH /api/addresses/:id` — IDOR tulis (horizontal)

VULNERABLE — `server/routes/addresses.routes.js`:

```js
router.patch(
  '/:id',
  requireAuth,
  ownerOnly(resolveAddressOwner),
  (req, res) => {
    const address = db.findAddress(req.params.id);
    if (!address) return notFound(res, 'Alamat tidak ditemukan.');

    const patch = pickAllowedFields(ADDRESS_FIELDS)(req.body); // field-level aman
    const updated = db.updateAddress(address.id, patch);       // VULN: object-level
    return res.json({ address: updated });
  }
);
```

SECURE — `ownerOnly` aktif:

```js
function resolveAddressOwner(req) {
  const address = req.app.locals.db.findAddress(req.params.id);
  return address ? address.userId : undefined;
}

router.patch(
  '/:id',
  requireAuth,
  ownerOnly(resolveAddressOwner),   // -> 403 bila bukan pemilik
  (req, res) => { /* update */ }
);
```

Dua lapis yang harus dibedakan saat menjelaskan:

- **Field-level allowlist** (`id`, `userId` diabaikan) ada di kedua mode.
  Ini mencegah penyerang memindahkan alamat ke akun lain lewat body.
- **Object-level authorization** adalah materi lab: siapa yang boleh
  menyentuh alamat tersebut. Allowlist field tidak memperbaikinya.

---

## 5. `PATCH /api/users/me` — mass assignment → privilege escalation

VULNERABLE — `server/routes/users.routes.js`:

```js
function pickVulnerablePatch(body) {
  const patch = { ...body };                       // semua field disalin
  for (const field of IMMUTABLE_FIELDS) delete patch[field];
  delete patch.__proto__;
  return patch;                                    // termasuk `role`
}

router.patch('/me', requireAuth, (req, res) => {
  const patch = isSecure(req)
    ? pickAllowedFields(PROFILE_FIELDS)(req.body)
    : pickVulnerablePatch(req.body);               // VULN
  // ...
  const updated = req.app.locals.db.updateUser(req.user.id, patch);
  return res.json({ user: toPublicUser(updated) });
});
```

SECURE:

```js
const PROFILE_FIELDS = ['name', 'email', 'phone'];

const patch = isSecure(req)
  ? pickAllowedFields(PROFILE_FIELDS)(req.body)    // `role` dibuang
  : pickVulnerablePatch(req.body);
```

Saat SECURE, request `{"role":"admin"}` tetap dijawab **200** (idempoten), tetapi
tidak ada field yang berubah dan role tetap `customer`. Ini disengaja agar
klien tidak perlu menangani error khusus untuk field yang diabaikan.

Mengapa allowlist: blocklist (`delete body.role`) rapuh — field baru di masa
depan otomatis lolos. Allowlist membalik default menjadi “tolak kecuali
diizinkan”.

---

## 6. `GET /api/admin/users` — missing authorization (BFLA)

VULNERABLE — `server/routes/admin.routes.js`:

```js
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = req.app.locals.db.listUsers();
  res.json({ users, count: users.length });
});
// requireRole no-op saat SECURE_MODE=false
```

SECURE:

```js
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  // non-admin -> 403
});
```

Yang berubah bukan route-nya, melainkan apakah guard mengeksekusi pengecekan.
Karena itu komentar VULN/FIX diletakkan di guard, bukan disalin ke setiap route.

---

## 7. `DELETE /api/admin/users/:id` — BFLA destruktif

VULNERABLE:

```js
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const target = db.findUserById(req.params.id);
  if (!target) return notFound(res, 'User tidak ditemukan.');
  if (target.id === req.user.id) {
    return badRequest(res, 'Akun yang sedang dipakai tidak bisa dihapus.');
  }
  db.deleteUser(target.id);
  return res.status(204).end();
});
```

SECURE: guard `requireRole('admin')` aktif → non-admin **403**. Admin tetap
bisa menghapus, dan akun sendiri tetap tidak bisa dihapus.

Catatan: tombol “Hapus” di UI hanya disembunyikan untuk non-admin. UI bukan
kontrol akses; request langsung tetap harus ditolak server.

---

## 8. `GET /api/admin/audit-log` — kontrol negatif (tidak rentan)

Route ini **tidak** ikut di-no-op-kan:

```js
router.get(
  '/audit-log',
  requireAuth,
  requireRole('admin', { enforce: true }),
  (req, res) => {
    res.json({ entries: req.app.locals.db.listAuditLog() });
  }
);
```

Hasil: customer mendapat **403 di kedua mode**. Endpoint ini ditemukan lewat
`/openapi.json` dan bundle, tetapi bukan temuan. Inilah pembeda antara
“endpoint tersembunyi” dan “endpoint yang salah otorisasi”.

Jika suatu saat guard ini dilonggarkan, tes `VULN: /api/admin/audit-log tetap
403` dan `SECURE: ... audit-log menolak customer` harus gagal — itulah
regression test-nya.

---

## 9. Ringkasan perbaikan

| # | Endpoint | Akar masalah | Perbaikan | Verifikasi |
|---|---|---|---|---|
| 1 | `GET /users/:id/profile` | object-level check tidak dieksekusi | `ownerOnly(..., { allowAdmin: true })` aktif | pelanggan A → pelanggan B = 403 |
| 2 | `GET /orders/:id` | tidak ada cek kepemilikan | `ownerOnly(resolveOrderOwner)` aktif | pelanggan A → order 5002 = 403 |
| 3 | `GET /tickets/:id` | tidak ada cek kepemilikan | `ownerOnly(resolveTicketOwner)` aktif | pelanggan A → tiket 4003 = 403 |
| 4 | `PATCH /addresses/:id` | object-level check tidak dieksekusi | `ownerOnly(resolveAddressOwner)` aktif | pelanggan A → alamat 3002 = 403 |
| 5 | `PATCH /users/me` | semua field body disalin | allowlist `name/email/phone` | role tetap `customer` |
| 6 | `GET /admin/users` | role guard no-op | `requireRole('admin')` aktif | customer = 403 |
| 7 | `DELETE /admin/users/:id` | role guard no-op | `requireRole('admin')` aktif | customer = 403 |
| 8 | `GET /admin/audit-log` | — (sudah benar) | `enforce: true` | customer = 403 di kedua mode |

---

## 10. Cara membaca ulang source saat demo

```bash
grep -rn "VULN\[" server/
grep -rn "FIX:" server/
sed -n '1,140p' server/authz.js
```

Urutan yang disarankan untuk Demo 04:

1. Tunjukkan `server/authz.js` — satu tempat keputusan.
2. Tunjukkan route rentan dan komentar `VULN[...]` / `FIX:`.
3. Ulangi request yang sama di `SECURE_MODE=true`.
4. Tunjukkan baris tes yang mengunci perilaku tersebut (`npm test`).
