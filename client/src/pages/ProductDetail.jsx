import { useEffect, useState } from 'react';
import { api, formatRupiah } from '../api';
import { useAuth } from '../auth';
import { Link, navigate } from '../router';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

export default function ProductDetail({ params }) {
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api(`/api/products/${params.id}`, { auth: false })
      .then((data) => {
        if (active) setProduct(data.product);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  async function addToCart() {
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/cart/items', { method: 'POST', body: { productId: product.id, qty } });
      navigate('/keranjang');
    } catch (err) {
      setError(err);
      setNotice('');
    } finally {
      setBusy(false);
    }
  }

  if (error && !product) {
    return (
      <>
        <PageHeader title="Produk tidak ditemukan" />
        <ErrorNotice message={error.message} />
        <Link to="/katalog" className="btn btn-secondary">
          Kembali ke katalog
        </Link>
      </>
    );
  }

  if (!product) return <LoadingRow label="Memuat produk…" />;

  return (
    <>
      <p className="breadcrumb">
        <Link to="/katalog">Katalog</Link> / {product.category}
      </p>
      <div className="product-detail">
        <div className={`product-art product-art-large tone-${product.tone || 'slate'}`}>
          <span>{product.sku}</span>
        </div>
        <div className="product-info">
          <p className="eyebrow">{product.sellerName}</p>
          <h1>{product.name}</h1>
          <p className="product-price">{formatRupiah(product.price)}</p>
          <p>{product.description}</p>
          <dl className="def-list compact">
            <div>
              <dt>Stok</dt>
              <dd>{product.stock > 0 ? `${product.stock} tersedia` : 'Habis'}</dd>
            </div>
            <div>
              <dt>Kategori</dt>
              <dd>{product.category}</dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd className="mono">{product.sku}</dd>
            </div>
          </dl>

          {error && <ErrorNotice message={error.message} />}
          {notice && <div className="alert alert-ok">{notice}</div>}

          <div className="add-row">
            <label className="qty-field">
              <span>Jumlah</span>
              <input
                type="number"
                min="1"
                max={Math.max(1, product.stock)}
                value={qty}
                onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addToCart}
              disabled={busy || product.stock === 0}
            >
              {busy ? 'Menambahkan…' : 'Tambah ke keranjang'}
            </button>
          </div>
          {!user && <p className="muted small">Anda perlu masuk sebelum menambahkan produk.</p>}
        </div>
      </div>
    </>
  );
}
