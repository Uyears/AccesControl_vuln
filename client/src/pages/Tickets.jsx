import { useEffect, useState } from 'react';
import { api, formatDate } from '../api';
import { EmptyState, ErrorNotice, LoadingRow, PageHeader, StatusBadge } from '../components';
import { Link } from '../router';

export default function Tickets() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/tickets')
      .then((data) => {
        if (active) setTickets(data.tickets);
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
      <PageHeader
        title="Pusat bantuan"
        subtitle="Tiket dukungan yang terkait dengan akun Anda."
      />

      {error && <ErrorNotice message={error.message} />}

      <section className="card">
        {!tickets && !error && <LoadingRow />}

        {tickets && tickets.length === 0 && (
          <EmptyState
            title="Belum ada tiket"
            description="Tim dukungan akan membalas melalui halaman ini."
          />
        )}

        {tickets && tickets.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tiket</th>
                  <th>Dibuat</th>
                  <th>Status</th>
                  <th>Balasan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link to={`/tickets/${ticket.id}`} className="link">
                        {ticket.subject}
                      </Link>
                    </td>
                    <td>{formatDate(ticket.createdAt)}</td>
                    <td>
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td>
                      {ticket.replies.length === 0 ? '-' : `${ticket.replies.length} balasan`}
                    </td>
                    <td className="align-right">
                      <Link to={`/tickets/${ticket.id}`} className="btn btn-small btn-secondary">
                        Buka
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card note-card">
        <h3>Jam layanan</h3>
        <p className="muted">
          Senin–Jumat, 09.00–17.00 WIB. Tiket di luar jam layanan akan dibalas pada hari kerja
          berikutnya.
        </p>
      </section>
    </>
  );
}
