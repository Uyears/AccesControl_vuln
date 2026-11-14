import { useEffect, useState } from 'react';
import { api, formatDate, formatRupiah } from '../api';
import { useAuth } from '../auth';
import { Link } from '../router';
import { EmptyState, ErrorNotice, LoadingRow, PageHeader, StatusBadge } from '../components';

export default function Dashboard() {
  const { user } = useAuth();
  const [state, setState] = useState({ orders: null, addresses: null, tickets: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([api('/api/orders'), api('/api/addresses'), api('/api/tickets')])
      .then(([orders, addresses, tickets]) => {
        if (!active) return;
        setState({ orders: orders.orders, addresses: addresses.addresses, tickets: tickets.tickets });
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeOrders = (state.orders || []).filter(
    (order) => order.status !== 'Selesai' && order.status !== 'Dibatalkan'
  );
  const openTickets = (state.tickets || []).filter((ticket) => ticket.status === 'open');

  return (
    <>
      <PageHeader
        title={`Halo, ${user.name.split(' ')[0]}`}
        subtitle="Ringkasan akun Nusa Supply Anda."
      />

      {error && <ErrorNotice message={error.message} status={error.status} />}

      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-label">Pesanan aktif</span>
          <strong>{state.orders ? activeOrders.length : '—'}</strong>
          <span className="muted">Sedang diproses atau dikirim</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Total pesanan</span>
          <strong>{state.orders ? state.orders.length : '—'}</strong>
          <span className="muted">Sejak akun dibuat</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Alamat tersimpan</span>
          <strong>{state.addresses ? state.addresses.length : '—'}</strong>
          <span className="muted">Untuk pengiriman</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Tiket terbuka</span>
          <strong>{state.tickets ? openTickets.length : '—'}</strong>
          <span className="muted">Menunggu respons tim</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Pesanan terbaru</h2>
          <Link to="/orders" className="link">
            Lihat semua
          </Link>
        </div>

        {!state.orders && <LoadingRow />}
        {state.orders && state.orders.length === 0 && (
          <EmptyState title="Belum ada pesanan" description="Pesanan Anda akan muncul di sini." />
        )}

        {state.orders && state.orders.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Pesanan</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th className="align-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.orders.slice(0, 4).map((order) => (
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
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Bantuan terakhir</h2>
          <Link to="/tickets" className="link">
            Lihat semua
          </Link>
        </div>

        {!state.tickets && <LoadingRow />}
        {state.tickets && state.tickets.length === 0 && (
          <EmptyState title="Tidak ada tiket" description="Hubungi tim dukungan bila ada kendala." />
        )}

        {state.tickets && state.tickets.length > 0 && (
          <ul className="list">
            {state.tickets.slice(0, 3).map((ticket) => (
              <li key={ticket.id}>
                <div>
                  <Link to={`/tickets/${ticket.id}`} className="link">
                    {ticket.subject}
                  </Link>
                  <p className="muted small">{formatDate(ticket.createdAt)}</p>
                </div>
                <StatusBadge status={ticket.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
