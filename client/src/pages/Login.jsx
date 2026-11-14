import { useState } from 'react';
import { useAuth } from '../auth';
import { navigate } from '../router';

export default function Login({ params }) {
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
      setError(err.message || 'Gagal masuk.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="lab-banner" role="alert">
        Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.
      </div>

      <div className="login-grid">
        <section className="login-brand">
          <div className="brand brand-large">
            <span className="brand-mark">NS</span>
            <span className="brand-text">
              Nusa Supply
              <small>Perlengkapan kerja</small>
            </span>
          </div>
          <h1>Kelola pesanan dan alamat pengiriman Anda.</h1>
          <p>
            Satu akun untuk melacak pesanan, menyimpan alamat, dan menghubungi tim dukungan Nusa
            Supply.
          </p>
          <ul className="brand-list">
            <li>Riwayat pesanan dan status pengiriman</li>
            <li>Buku alamat untuk checkout lebih cepat</li>
            <li>Tiket bantuan dengan tim operasional</li>
          </ul>
        </section>

        <section className="card login-card">
          <h2>Masuk ke akun</h2>
          <p className="muted">Gunakan kredensial yang diberikan fasilitator.</p>

          <form onSubmit={onSubmit} className="form">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
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
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
          </form>

          <p className="login-note muted">
            Sesi disimpan di browser ini. Tutup browser untuk keluar sepenuhnya.
          </p>
        </section>
      </div>
    </div>
  );
}
