import { useEffect, useState } from 'react';
import { api, formatRupiah } from '../api';
import { Link } from '../router';
import ProductArt from '../ProductArt';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

function ProductCard({ product }) {
  return (
    <Link to={`/katalog/${product.id}`} className="product-card">
      <ProductArt sku={product.sku} tone={product.tone} label={product.category} />
      <div className="product-body">
        <h3>{product.name}</h3>
        <p className="muted small">{product.description}</p>
        <div className="product-meta">
          <strong>{formatRupiah(product.price)}</strong>
          <span className="muted small">{product.sellerName}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Catalog() {
  const [state, setState] = useState({ products: null, categories: [] });
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/products', { auth: false })
      .then((data) => {
        if (active) setState({ products: data.products, categories: data.categories });
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  const products = (state.products || []).filter((product) => {
    if (category && product.category !== category) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [product.name, product.sku, product.description].join(' ').toLowerCase().includes(needle);
  });

  return (
    <>
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">Perlengkapan kerja</p>
          <h1>Meja kerja yang siap dipakai setiap hari.</h1>
          <p className="muted">
            Pilihan periferal, aksesori, dan perabot dari partner terverifikasi Nusa Supply.
          </p>
        </div>
        <div className="hero-note">
          <strong>Pengiriman ke seluruh Indonesia</strong>
          <span className="muted small">Gratis biaya kirim untuk pesanan di atas Rp 500.000.</span>
        </div>
      </section>

      {error && <ErrorNotice message={error.message} />}

      <div className="catalog-toolbar">
        <div className="filter-row">
          <button
            type="button"
            className={category === '' ? 'chip chip-active' : 'chip'}
            onClick={() => setCategory('')}
          >
            Semua
          </button>
          {state.categories.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? 'chip chip-active' : 'chip'}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <input
          className="catalog-search"
          type="search"
          placeholder="Cari produk atau SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {!state.products ? (
        <LoadingRow label="Memuat katalog…" />
      ) : products.length === 0 ? (
        <p className="muted">Tidak ada produk yang cocok dengan pencarian Anda.</p>
      ) : (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}
