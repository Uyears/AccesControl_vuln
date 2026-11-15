import { useState } from 'react';
import { useAuth } from '../auth';
import { Link, navigate } from '../router';
import { ErrorNotice } from '../components';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Pendaftaran tidak dapat diproses.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login-panel">
        <Link to="/katalog" className="brand login-brand" aria-label="Nusa Supply">
          <span className="brand-mark">NS</span>
          <span className="brand-name">Nusa Supply</span>
        </Link>

        <section className="card login-card">
          <h1>Buat akun</h1>
          <p className="muted">Akun pelanggan untuk berbelanja di Nusa Supply.</p>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span>Nama lengkap</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={form.username}
                onChange={(event) => update('username', event.target.value)}
                required
                pattern="[A-Za-z0-9._-]{3,24}"
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Nomor telepon (opsional)</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                autoComplete="tel"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Minimal 8 karakter"
              />
            </label>

            {error && <ErrorNotice message={error} />}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Memproses…' : 'Daftar'}
            </button>
          </form>

          <p className="login-help">
            Sudah punya akun? <Link to="/login">Masuk di sini</Link>
          </p>
        </section>

        <p className="login-copyright">© 2026 Nusa Supply</p>
      </main>
    </div>
  );
}
