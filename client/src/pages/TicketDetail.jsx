import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api';
import { ErrorNotice, LoadingRow, PageHeader, StatusBadge } from '../components';
import { Link } from '../router';

export default function TicketDetail({ params }) {
  const ticketId = params.id;
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setTicket(null);
    setError(null);
    api(`/api/tickets/${encodeURIComponent(ticketId)}`)
      .then((data) => {
        if (active) setTicket(data.ticket);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, [ticketId]);

  const messages = ticket ? ticket.messages.filter((message) => !message.internal) : [];

  return (
    <>
      <PageHeader
        title={ticket ? ticket.subject : `Tiket #${ticketId}`}
        subtitle="Percakapan dengan tim dukungan."
        action={
          <Link to="/tickets" className="btn btn-secondary">
            Kembali
          </Link>
        }
      />

      {!ticket && !error && <LoadingRow />}
      {error && <ErrorNotice message={error.message} />}

      {ticket && (
        <div className="two-col">
          <section className="card">
            <div className="card-head">
              <h2>Percakapan</h2>
              <StatusBadge status={ticket.status} />
            </div>

            <div className="thread">
              {messages.map((message) => (
                <article
                  className={
                    message.authorRole === 'admin'
                      ? 'thread-item thread-support'
                      : 'thread-item thread-customer'
                  }
                  key={message.id}
                >
                  <header>
                    <strong>
                      {message.authorRole === 'admin' ? 'Tim Nusa Supply' : message.authorName}
                    </strong>
                    <span className="muted small">{formatDateTime(message.at)}</span>
                  </header>
                  <p>{message.body}</p>
                </article>
              ))}

              {messages.length === 0 && (
                <p className="muted">Belum ada pesan. Tim dukungan akan segera merespons.</p>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Informasi tiket</h2>
            <dl className="def-list compact">
              <div>
                <dt>Nomor tiket</dt>
                <dd className="mono">#{ticket.id}</dd>
              </div>
              <div>
                <dt>Dibuat</dt>
                <dd>{formatDateTime(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={ticket.status} />
                </dd>
              </div>
            </dl>
            <div className="divider" />
            <p className="muted small">
              Balasan dikirim ke email terdaftar. Jangan bagikan informasi sensitif melalui tiket.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
