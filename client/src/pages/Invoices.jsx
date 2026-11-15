import { useEffect, useState } from 'react';
import { api, downloadFile, formatDate, formatRupiah } from '../api';
import { Link } from '../router';
import { EmptyState, ErrorNotice, LoadingRow, PageHeader } from '../components';

const STATUS_LABEL = {
  paid: 'Lunas',
  unpaid: 'Belum dibayar',
  refunded: 'Dikembalikan',
};

export default function Invoices() {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/invoices')
      .then((data) => {
        if (active) setInvoices(data.invoices);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  async function download(invoice) {
    setError(null);
    try {
      await downloadFile(`/api/invoices/${invoice.id}/pdf`, `invoice-${invoice.id}.pdf`);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <PageHeader title="Invoice" subtitle="Faktur pesanan yang pernah dibuat dari akun Anda." />
      {error && <ErrorNotice message={error.message} />}
      {!invoices ? (
        <LoadingRow label="Memuat invoice…" />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="Belum ada invoice"
          description="Invoice dibuat otomatis setelah Anda menyelesaikan checkout."
          actionLabel="Lihat katalog"
          actionTo="/katalog"
        />
      ) : (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nomor</th>
                <th>Tanggal</th>
                <th>Order</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="mono">{invoice.number}</td>
                  <td>{formatDate(invoice.issuedAt)}</td>
                  <td>
                    <Link to={`/orders/${invoice.orderId}`} className="link">
                      #{invoice.orderId}
                    </Link>
                  </td>
                  <td className="nowrap">{formatRupiah(invoice.total)}</td>
                  <td>{STATUS_LABEL[invoice.status] || invoice.status}</td>
                  <td className="right">
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => download(invoice)}>
                      Unduh PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
