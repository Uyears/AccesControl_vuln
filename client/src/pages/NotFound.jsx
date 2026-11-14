import { Link } from '../router';

export default function NotFound() {
  return (
    <div className="card centered">
      <p className="eyebrow">404</p>
      <h1>Halaman tidak ditemukan</h1>
      <p className="muted">Tautan yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
      <Link to="/" className="btn btn-primary">
        Kembali ke ringkasan
      </Link>
    </div>
  );
}
