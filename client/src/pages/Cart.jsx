import { useEffect, useState } from 'react';
import { api, formatRupiah } from '../api';
import { Link, navigate } from '../router';
import { EmptyState, ErrorNotice, LoadingRow, PageHeader } from '../components';
import ProductArt from '../ProductArt';

export default function Cart() {
  const [cart, setCart] = useState(null);
  const [addresses, setAddresses] = useState(null);
  const [addressId, setAddressId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api('/api/cart'), api('/api/addresses')])
      .then(([cartData, addressData]) => {
        if (!active) return;
        setCart(cartData.cart);
        setAddresses(addressData.addresses);
        if (addressData.addresses[0]) setAddressId(String(addressData.addresses[0].id));
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  async function reloadCart() {
    const data = await api('/api/cart');
    setCart(data.cart);
  }

  async function changeQty(item, nextQty) {
    setBusy(true);
    setError(null);
    try {
      if (nextQty < 1) {
        await api(`/api/cart/items/${item.productId}`, { method: 'DELETE' });
      } else {
        await api(`/api/cart/items/${item.productId}`, { method: 'PATCH', body: { qty: nextQty } });
      }
      await reloadCart();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!addressId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/cart/checkout', {
        method: 'POST',
        body: { addressId: Number(addressId) },
      });
      navigate(`/orders/${data.order.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (error && !cart) return <ErrorNotice message={error.message} />;
  if (!cart) return <LoadingRow label="Memuat keranjang…" />;

  return (
    <>
      <PageHeader title="Keranjang" subtitle="Periksa jumlah dan alamat pengiriman sebelum checkout." />
      {error && <ErrorNotice message={error.message} />}

      {cart.items.length === 0 ? (
        <EmptyState
          title="Keranjang masih kosong"
          description="Tambahkan produk dari katalog untuk mulai berbelanja."
          actionLabel="Lihat katalog"
          actionTo="/katalog"
        />
      ) : (
        <div className="two-col cart-layout">
          <section className="card">
            <div className="card-head">
              <h2>Produk</h2>
              <span className="muted small">{cart.count} item</span>
            </div>
            <ul className="cart-list">
              {cart.items.map((item) => (
                <li key={item.productId}>
                  <ProductArt sku={item.sku} tone={item.tone} compact />
                  <div className="cart-item-main">
                    <Link to={`/katalog/${item.productId}`} className="link">
                      {item.name}
                    </Link>
                    <span className="muted small mono">{item.sku}</span>
                    <span className="muted small">{formatRupiah(item.price)} / unit</span>
                  </div>
                  <div className="qty-control">
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={busy}
                      onClick={() => changeQty(item, item.qty - 1)}
                      aria-label={`Kurangi ${item.name}`}
                    >
                      −
                    </button>
                    <span>{item.qty}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={busy}
                      onClick={() => changeQty(item, item.qty + 1)}
                      aria-label={`Tambah ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <strong className="nowrap">{formatRupiah(item.lineTotal)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <aside className="card">
            <h2>Ringkasan</h2>
            <dl className="def-list">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatRupiah(cart.subtotal)}</dd>
              </div>
              <div>
                <dt>Pengiriman</dt>
                <dd>Dihitung saat pengiriman</dd>
              </div>
            </dl>

            {!addresses ? (
              <LoadingRow label="Memuat alamat…" />
            ) : addresses.length === 0 ? (
              <div className="empty-state compact">
                <p className="muted">Belum ada alamat pengiriman.</p>
                <Link to="/addresses" className="btn btn-secondary btn-small">
                  Tambah alamat
                </Link>
              </div>
            ) : (
              <label className="field">
                <span>Alamat pengiriman</span>
                <select value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                  {addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label} — {address.recipient}, {address.city}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={checkout}
              disabled={busy || !addressId || cart.items.length === 0}
            >
              {busy ? 'Memproses…' : 'Buat pesanan'}
            </button>
            <p className="muted small">
              Pesanan akan dibuat dengan status menunggu pembayaran dan invoice otomatis.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
