import { useEffect, useState } from 'react';
import { api, formatDate, formatRupiah } from '../api';
import { EmptyState, ErrorNotice, LoadingRow, PageHeader, StatusBadge } from '../components';
import { Link } from '../router';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/orders')
      .then((data) => {
        if (active) setOrders(data.orders);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageHeader title="Pesanan" subtitle="Riwayat pesanan yang tercatat pada akun Anda." />

      {error && <ErrorNotice message={error.message} />}

      <section className="card">
        {!orders && !error && <LoadingRow />}

        {orders && orders.length === 0 && (
          <EmptyState title="Belum ada pesanan" description="Pesanan baru akan tampil di sini." />
        )}

        {orders && orders.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nomor pesanan</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th>Kurir</th>
                  <th className="align-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/orders/${order.id}`} className="link">
                        #{order.id}
                      </Link>
                    </td>
                    <td>{formatDate(order.placedAt)}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>{order.courier}</td>
                    <td className="align-right">{formatRupiah(order.total)}</td>
                    <td className="align-right">
                      <Link to={`/orders/${order.id}`} className="btn btn-small btn-secondary">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
