import { useEffect } from 'react';
import { Link, Navigate, matchRoute, navigate, useLocation } from './router';
import { useAuth } from './auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Addresses from './pages/Addresses';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

const NAV_ITEMS = [
  { to: '/', label: 'Ringkasan' },
  { to: '/orders', label: 'Pesanan' },
  { to: '/addresses', label: 'Alamat' },
  { to: '/tickets', label: 'Bantuan' },
];

function LabBanner() {
  return (
    <div className="lab-banner" role="alert">
      Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.
    </div>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isActive = (to) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link to="/" className="brand" aria-label="Nusa Supply">
          <span className="brand-mark">NS</span>
          <span className="brand-text">
            Nusa Supply
            <small>Perlengkapan kerja</small>
          </span>
        </Link>

        {user && (
          <nav className="main-nav" aria-label="Navigasi utama">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isActive(item.to) ? 'nav-link active' : 'nav-link'}
              >
                {item.label}
              </Link>
            ))}
            {user.role === 'admin' && (
              <Link to="/admin" className={isActive('/admin') ? 'nav-link active' : 'nav-link'}>
                Operasional
              </Link>
            )}
          </nav>
        )}

        <div className="header-actions">
          {user ? (
            <>
              <Link to="/profile" className="user-chip" title="Profil akun">
                <span className="avatar">{user.name ? user.name.charAt(0) : '?'}</span>
                <span className="user-meta">
                  <strong>{user.name}</strong>
                  <small>{user.role === 'admin' ? 'Staf operasional' : 'Pelanggan'}</small>
                </span>
              </Link>
              <button type="button" className="btn btn-ghost" onClick={logout}>
                Keluar
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary">
              Masuk
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <p>Nusa Supply — contoh aplikasi untuk pelatihan keamanan. Semua data fiktif.</p>
        <p className="muted">Lab lokal. Tidak ada koneksi keluar, tidak ada telemetri.</p>
      </div>
    </footer>
  );
}

function Layout({ children }) {
  return (
    <div className="app">
      <LabBanner />
      <Header />
      <main className="shell page">{children}</main>
      <Footer />
    </div>
  );
}

function Loading() {
  return (
    <Layout>
      <div className="card centered">
        <p className="muted">Memuat sesi…</p>
      </div>
    </Layout>
  );
}

function Protected({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const ROUTES = [
  { pattern: '/', component: Dashboard },
  { pattern: '/profile', component: Profile },
  { pattern: '/orders', component: Orders },
  { pattern: '/orders/:id', component: OrderDetail },
  { pattern: '/addresses', component: Addresses },
  { pattern: '/tickets', component: Tickets },
  { pattern: '/tickets/:id', component: TicketDetail },
  { pattern: '/admin', component: Admin },
];

function resolveRoute(pathname) {
  for (const route of ROUTES) {
    const params = matchRoute(route.pattern, pathname);
    if (params) return { ...route, params };
  }
  return null;
}

export default function App() {
  const location = useLocation();
  const { user, booting } = useAuth();
  const route = resolveRoute(location.pathname);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (location.pathname === '/login') {
    if (booting) return <Loading />;
    if (user) {
      navigate('/', { replace: true });
      return <Loading />;
    }
    return <Login />;
  }

  if (!route) {
    return (
      <Layout>
        <NotFound />
      </Layout>
    );
  }

  const Page = route.component;

  return (
    <Protected>
      <Layout>
        <Page key={location.pathname} params={route.params} />
      </Layout>
    </Protected>
  );
}
