import { useEffect, useState } from 'react';
import { api, formatDate, formatRupiah } from '../api';
import { ErrorNotice, LoadingRow, PageHeader, StatusBadge } from '../components';
import { Link } from '../router';

export default function OrderDetail({ params }) {
  const orderId = params.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    api(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <>
      <PageHeader
        title={`Pesanan #${orderId}`}
        subtitle="Rincian item, pengiriman, dan status pesanan."
        action={
          <Link to="/orders" className="btn btn-secondary">
            Kembali
          </Link>
        }
      />

      {!data && !error && <LoadingRow />}
      {error && <ErrorNotice message={error.message} />}

      {data && (
        <div className="two-col">
          <section className="card">
            <div className="card-head">
              <h2>Item pesanan</h2>
              <StatusBadge status={data.order.status} />
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>SKU</th>
                    <th className="align-right">Qty</th>
                    <th className="align-right">Harga</th>
                    <th className="align-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.order.items.map((item) => (
                    <tr key={item.sku}>
                      <td>{item.name}</td>
                      <td className="mono muted">{item.sku}</td>
                      <td className="align-right">{item.qty}</td>
                      <td className="align-right">{formatRupiah(item.price)}</td>
                      <td className="align-right">{formatRupiah(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={4} className="align-right">
                      Total
                    </th>
                    <th className="align-right">{formatRupiah(data.order.total)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>

            <dl className="def-list compact">
              <div>
                <dt>Tanggal pesanan</dt>
                <dd>{formatDate(data.order.placedAt)}</dd>
              </div>
              <div>
                <dt>Kurir</dt>
                <dd>{data.order.courier}</dd>
              </div>
              <div>
                <dt>Nomor resi</dt>
                <dd className="mono">{data.order.trackingNumber}</dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <h2>Alamat pengiriman</h2>
            {data.address ? (
              <address className="address">
                <strong>{data.address.recipient}</strong>
                <span>{data.address.label}</span>
                <span>{data.address.line1}</span>
                <span>
                  {data.address.city} {data.address.postalCode}
                </span>
                <span>{data.address.phone}</span>
              </address>
            ) : (
              <p className="muted">Alamat tidak tersedia.</p>
            )}

            <div className="divider" />
            <h3>Butuh bantuan?</h3>
            <p className="muted">
              Sertakan nomor pesanan <span className="mono">#{data.order.id}</span> saat menghubungi
              tim dukungan.
            </p>
            <Link to="/tickets" className="btn btn-secondary">
              Buka pusat bantuan
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
