import { useEffect, useState } from 'react';
import { Link } from '../router';
import { api, formatRupiah } from '../api';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

const EMPTY_PRODUCT = {
  name: '',
  sku: '',
  description: '',
  category: 'Periferal',
  price: 100000,
  stock: 10,
  tone: 'slate',
};

export default function Seller() {
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await api('/api/seller/summary');
    setSummary(data);
  }

  useEffect(() => {
    let active = true;
    api('/api/seller/summary')
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createProduct(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await api('/api/products', {
        method: 'POST',
        body: {
          ...form,
          name: form.name.trim(),
          sku: form.sku.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          stock: Number(form.stock),
        },
      });
      setForm(EMPTY_PRODUCT);
      setNotice('Produk baru ditambahkan ke katalog.');
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/products/${product.id}`, {
        method: 'PATCH',
        body: { active: !product.active },
      });
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(product) {
    if (!window.confirm(`Hapus produk ${product.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/products/${product.id}`, { method: 'DELETE' });
      setNotice(`Produk ${product.name} dihapus.`);
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!summary && error) {
    return (
      <>
        <PageHeader title="Panel penjual" subtitle="Kelola katalog produk yang Anda jual di Nusa Supply." />
        <section className="card empty-state">
          <h3>Panel penjual tidak dapat dibuka</h3>
          <p>{error.message}</p>
          <Link className="btn btn-secondary" to="/">
            Kembali ke ringkasan
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Panel penjual" subtitle="Kelola katalog produk yang Anda jual di Nusa Supply." />
      {error && <ErrorNotice message={error.message} />}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {!summary ? (
        <LoadingRow label="Memuat data penjual…" />
      ) : (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="muted small">Produk</span>
            <strong>{summary.products.length}</strong>
          </div>
          <div className="stat-card">
            <span className="muted small">Pesanan terkait</span>
            <strong>{summary.orders.length}</strong>
          </div>
          <div className="stat-card">
            <span className="muted small">Pendapatan lunas</span>
            <strong>{formatRupiah(summary.revenue)}</strong>
          </div>
        </div>
      )}

      <div className="two-col">
        <section className="card">
          <h2>Produk</h2>
          {!summary ? (
            <LoadingRow />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {summary.products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      <div className="muted small mono">{product.sku}</div>
                    </td>
                    <td className="nowrap">{formatRupiah(product.price)}</td>
                    <td>{product.stock}</td>
                    <td>{product.active === false ? 'Nonaktif' : 'Aktif'}</td>
                    <td className="right nowrap">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={busy}
                        onClick={() => toggleActive(product)}
                      >
                        {product.active === false ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={busy}
                        onClick={() => removeProduct(product)}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2>Tambah produk</h2>
          <form className="form" onSubmit={createProduct}>
            <label className="field">
              <span>Nama produk</span>
              <input value={form.name} onChange={(event) => update('name', event.target.value)} required />
            </label>
            <label className="field">
              <span>SKU</span>
              <input value={form.sku} onChange={(event) => update('sku', event.target.value)} required />
            </label>
            <label className="field">
              <span>Kategori</span>
              <input value={form.category} onChange={(event) => update('category', event.target.value)} />
            </label>
            <label className="field">
              <span>Deskripsi</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
              />
            </label>
            <div className="form-row">
              <label className="field">
                <span>Harga (Rp)</span>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(event) => update('price', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Stok</span>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(event) => update('stock', event.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan produk'}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
