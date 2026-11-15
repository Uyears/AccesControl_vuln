import { useState } from 'react';
import { useAuth } from '../auth';
import { Link, navigate } from '../router';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Tidak dapat masuk. Periksa kembali data Anda.');
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
          <h1>Masuk</h1>
          <p className="muted">Lanjutkan untuk melihat pesanan dan alamat pengiriman Anda.</p>

          <form onSubmit={onSubmit} className="form">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Masukkan username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Masukkan password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
          </form>

          <p className="login-help">
            Belum memiliki akun? <Link to="/register">Daftar sebagai pelanggan</Link>.
            <br />
            Lupa password? Hubungi layanan pelanggan di 021-555-0100.
          </p>
        </section>

        <p className="login-copyright">© 2026 Nusa Supply</p>
      </main>
    </div>
  );
}
