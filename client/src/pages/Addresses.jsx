import { useEffect, useState } from 'react';
import { api } from '../api';
import { EmptyState, ErrorNotice, Field, LoadingRow, PageHeader } from '../components';

const EMPTY_FORM = {
  label: '',
  recipient: '',
  line1: '',
  city: '',
  postalCode: '',
  phone: '',
};

export default function Addresses() {
  const [addresses, setAddresses] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setError(null);
    return api('/api/addresses')
      .then((data) => setAddresses(data.addresses))
      .catch((err) => setError(err));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(address) {
    setEditingId(address.id);
    setNotice('');
    setError(null);
    setForm({
      label: address.label || '',
      recipient: address.recipient || '',
      line1: address.line1 || '',
      city: address.city || '',
      postalCode: address.postalCode || '',
      phone: address.phone || '',
    });
  }

  function onChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const data = await api(`/api/addresses/${editingId}`, {
        method: 'PATCH',
        body: { id: editingId, ...form },
      });
      setAddresses((current) =>
        current.map((address) => (address.id === data.address.id ? data.address : address))
      );
      setEditingId(null);
      setNotice('Alamat berhasil diperbarui.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Alamat" subtitle="Alamat pengiriman yang tersimpan pada akun Anda." />

      {notice && <div className="alert alert-ok">{notice}</div>}
      {error && <ErrorNotice message={error.message} status={error.status} />}

      {!addresses && !error && <LoadingRow />}

      {addresses && addresses.length === 0 && (
        <EmptyState title="Belum ada alamat" description="Alamat akan tampil setelah ditambahkan." />
      )}

      <div className="address-grid">
        {(addresses || []).map((address) => (
          <section className="card address-card" key={address.id}>
            {editingId === address.id ? (
              <form className="form" onSubmit={onSubmit}>
                <h2>Ubah alamat</h2>
                <Field label="Label">
                  <input type="text" name="label" value={form.label} onChange={onChange} required />
                </Field>
                <Field label="Penerima">
                  <input
                    type="text"
                    name="recipient"
                    value={form.recipient}
                    onChange={onChange}
                    required
                  />
                </Field>
                <Field label="Alamat">
                  <input type="text" name="line1" value={form.line1} onChange={onChange} required />
                </Field>
                <div className="field-row">
                  <Field label="Kota">
                    <input type="text" name="city" value={form.city} onChange={onChange} required />
                  </Field>
                  <Field label="Kode pos">
                    <input
                      type="text"
                      name="postalCode"
                      value={form.postalCode}
                      onChange={onChange}
                      required
                    />
                  </Field>
                </div>
                <Field label="Telepon">
                  <input type="tel" name="phone" value={form.phone} onChange={onChange} />
                </Field>
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? 'Menyimpan…' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="card-head">
                  <h2>{address.label}</h2>
                  <span className="badge badge-muted">#{address.id}</span>
                </div>
                <address className="address">
                  <strong>{address.recipient}</strong>
                  <span>{address.line1}</span>
                  <span>
                    {address.city} {address.postalCode}
                  </span>
                  <span>{address.phone}</span>
                </address>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => startEdit(address)}
                >
                  Ubah alamat
                </button>
              </>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
