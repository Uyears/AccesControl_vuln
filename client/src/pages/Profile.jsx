import { useState } from 'react';
import { api, formatDate } from '../api';
import { useAuth } from '../auth';
import { ErrorNotice, Field, PageHeader } from '../components';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
  });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  function onChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const data = await api('/api/users/me', {
        method: 'PATCH',
        body: { name: form.name, email: form.email, phone: form.phone },
      });
      updateUser(data.user);
      setStatus({ type: 'ok', message: 'Profil berhasil diperbarui.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profil akun" subtitle="Perbarui data kontak yang dipakai untuk pengiriman." />

      <div className="two-col">
        <section className="card">
          <h2>Data akun</h2>
          <dl className="def-list">
            <div>
              <dt>Username</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>Nomor pelanggan</dt>
              <dd>#{user.id}</dd>
            </div>
            <div>
              <dt>Member sejak</dt>
              <dd>{formatDate(user.joinedAt)}</dd>
            </div>
            <div>
              <dt>Tingkat loyalitas</dt>
              <dd>{user.loyaltyTier || '-'}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h2>Kontak</h2>
          <form className="form" onSubmit={onSubmit}>
            <Field label="Nama lengkap">
              <input type="text" name="name" value={form.name} onChange={onChange} required />
            </Field>
            <Field label="Email">
              <input type="email" name="email" value={form.email} onChange={onChange} required />
            </Field>
            <Field label="Nomor telepon">
              <input type="tel" name="phone" value={form.phone} onChange={onChange} />
            </Field>

            {status && status.type === 'error' && <ErrorNotice message={status.message} />}
            {status && status.type === 'ok' && <div className="alert alert-ok">{status.message}</div>}

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan perubahan'}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
