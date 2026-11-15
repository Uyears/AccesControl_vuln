import { useEffect } from 'react';
import { Link, Navigate, matchRoute, navigate, useLocation } from './router';
import { useAuth } from './auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Addresses from './pages/Addresses';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Admin from './pages/Admin';
import Catalog from './pages/Catalog';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Invoices from './pages/Invoices';
import Documents from './pages/Documents';
import Journal from './pages/Journal';
import Seller from './pages/Seller';
import NotFound from './pages/NotFound';

const NAV_ITEMS = [
  { to: '/', label: 'Ringkasan' },
  { to: '/katalog', label: 'Katalog' },
  { to: '/orders', label: 'Pesanan' },
  { to: '/invoices', label: 'Invoice' },
  { to: '/tickets', label: 'Bantuan' },
];

const PUBLIC_NAV_ITEMS = [
  { to: '/katalog', label: 'Katalog' },
  { to: '/jurnal', label: 'Jurnal' },
];

function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isActive = (to) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link to="/katalog" className="brand" aria-label="Nusa Supply">
          <span className="brand-mark">NS</span>
          <span className="brand-name">Nusa Supply</span>
        </Link>

        <nav className="main-nav" aria-label="Navigasi utama">
          {(user ? PUBLIC_NAV_ITEMS.slice(0, 1) : PUBLIC_NAV_ITEMS).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={isActive(item.to) ? 'nav-link active' : 'nav-link'}
            >
              {item.label}
            </Link>
          ))}
          {user &&
            NAV_ITEMS.filter((item) => item.to !== '/katalog').map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isActive(item.to) ? 'nav-link active' : 'nav-link'}
              >
                {item.label}
              </Link>
            ))}
          {user && user.role === 'seller' && (
            <Link to="/seller" className={isActive('/seller') ? 'nav-link active' : 'nav-link'}>
              Penjual
            </Link>
          )}
          {user && user.role === 'admin' && (
            <Link to="/admin" className={isActive('/admin') ? 'nav-link active' : 'nav-link'}>
              Operasional
            </Link>
          )}
        </nav>

        <div className="header-actions">
          {user ? (
            <>
              <Link to="/keranjang" className="btn btn-ghost btn-small">
                Keranjang
              </Link>
              <Link to="/profile" className="user-chip" title="Profil akun">
                <span className="avatar">{user.name ? user.name.charAt(0) : '?'}</span>
                <span className="user-meta">
                  <strong>{user.name}</strong>
                  <small>{user.role === 'admin' ? 'Staf operasional' : 'Pelanggan'}</small>
                </span>
              </Link>
              <button type="button" className="btn btn-ghost btn-small" onClick={logout}>
                Keluar
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-small">
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
        <div>
          <p className="footer-brand">Nusa Supply</p>
          <p>Perlengkapan kerja untuk tim, kantor, dan ruang kerja.</p>
        </div>
        <div className="footer-meta">
          <p>Layanan pelanggan: 021-555-0100</p>
          <p>© 2026 Nusa Supply</p>
        </div>
      </div>
    </footer>
  );
}

function Layout({ children }) {
  return (
    <div className="app">
      <Header />
      <main className="shell page">{children}</main>
      <Footer />
    </div>
  );
}

function Loading() {
  return (
    <Layout>
      <p className="page-loading">Memuat…</p>
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
  { pattern: '/katalog', component: Catalog, public: true },
  { pattern: '/katalog/:id', component: ProductDetail, public: true },
  { pattern: '/jurnal', component: Journal, public: true },
  { pattern: '/jurnal/:slug', component: Journal, public: true },
  { pattern: '/', component: Dashboard },
  { pattern: '/profile', component: Profile },
  { pattern: '/orders', component: Orders },
  { pattern: '/orders/:id', component: OrderDetail },
  { pattern: '/addresses', component: Addresses },
  { pattern: '/tickets', component: Tickets },
  { pattern: '/tickets/:id', component: TicketDetail },
  { pattern: '/keranjang', component: Cart },
  { pattern: '/invoices', component: Invoices },
  { pattern: '/documents', component: Documents },
  { pattern: '/seller', component: Seller },
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

  if (location.pathname === '/register') {
    if (booting) return <Loading />;
    if (user) {
      navigate('/', { replace: true });
      return <Loading />;
    }
    return <Register />;
  }

  if (!route) {
    return (
      <Layout>
        <NotFound />
      </Layout>
    );
  }

  const Page = route.component;

  if (route.public) {
    return (
      <Layout>
        <Page key={location.pathname} params={route.params} />
      </Layout>
    );
  }

  return (
    <Protected>
      <Layout>
        <Page key={location.pathname} params={route.params} />
      </Layout>
    </Protected>
  );
}
