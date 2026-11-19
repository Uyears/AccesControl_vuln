import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api';
import { ErrorNotice, LoadingRow, PageHeader, StatusBadge } from '../components';
import { Link } from '../router';

export default function TicketDetail({ params }) {
  const ticketId = params.id;
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

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


  async function sendReply(event) {
    event.preventDefault();
    const body = reply.trim();
    if (!body || sending) return;

    setSending(true);
    setReplyError(null);
    setNotice('');
    try {
      const data = await api(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, {
        method: 'POST',
        body: { body },
      });
      setTicket(data.ticket);
      setReply('');
      setNotice('Balasan terkirim.');
    } catch (err) {
      setReplyError(err);
    } finally {
      setSending(false);
    }
  }
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

            <form className="form" onSubmit={sendReply}>
              <label className="field">
                <span>Balas tiket</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Tulis balasan untuk tim dukungan…"
                  disabled={sending}
                />
              </label>
              {replyError && <ErrorNotice message={replyError.message} />}
              {notice && <p className="alert alert-ok">{notice}</p>}
              <div className="btn-row">
                <button type="submit" className="btn btn-small" disabled={sending || !reply.trim()}>
                  {sending ? 'Mengirim…' : 'Kirim balasan'}
                </button>
              </div>
            </form>
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
