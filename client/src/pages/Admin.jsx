import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api';
import { useAuth } from '../auth';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [auditError, setAuditError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  function loadUsers() {
    setError(null);
    return api('/api/admin/users')
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err));
  }

  function loadAudit() {
    setAuditError(null);
    return api('/api/admin/audit-log')
      .then((data) => setAudit(data.entries))
      .catch((err) => setAuditError(err));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (tab === 'audit' && !audit) loadAudit();
  }, [tab]);

  async function removeUser(target) {
    if (!window.confirm(`Hapus akun ${target.username} (${target.id})? Tindakan ini permanen.`)) {
      return;
    }
    setBusyId(target.id);
    setNotice('');
    setError(null);
    try {
      await api(`/api/admin/users/${target.id}`, { method: 'DELETE' });
      setNotice(`Akun ${target.username} dihapus.`);
      await loadUsers();
      if (tab === 'audit') await loadAudit();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Operasional"
        subtitle={`Alat internal untuk staf. Masuk sebagai ${user.username}.`}
      />

      <div className="tabs">
        <button
          type="button"
          className={tab === 'users' ? 'tab active' : 'tab'}
          onClick={() => setTab('users')}
        >
          Akun pengguna
        </button>
        <button
          type="button"
          className={tab === 'audit' ? 'tab active' : 'tab'}
          onClick={() => setTab('audit')}
        >
          Audit log
        </button>
      </div>

      {notice && <div className="alert alert-ok">{notice}</div>}

      {tab === 'users' && (
        <section className="card">
          <div className="card-head">
            <h2>Daftar akun</h2>
            <span className="muted small">{users ? `${users.length} akun` : ''}</span>
          </div>

          {error && <ErrorNotice message={error.message} status={error.status} />}
          {!users && !error && <LoadingRow />}

          {users && (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.id}</td>
                    <td>{item.username}</td>
                    <td>{item.name}</td>
                    <td>{item.email}</td>
                    <td>
                      <span
                        className={item.role === 'admin' ? 'badge badge-info' : 'badge badge-muted'}
                      >
                        {item.role}
                      </span>
                    </td>
                    <td className="align-right">
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        disabled={busyId === item.id || item.id === user.id}
                        onClick={() => removeUser(item)}
                        title={item.id === user.id ? 'Tidak bisa menghapus akun sendiri' : ''}
                      >
                        {busyId === item.id ? 'Menghapus…' : 'Hapus'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'audit' && (
        <section className="card">
          <div className="card-head">
            <h2>Audit log</h2>
            <button type="button" className="btn btn-small btn-secondary" onClick={loadAudit}>
              Muat ulang
            </button>
          </div>

          {auditError && <ErrorNotice message={auditError.message} status={auditError.status} />}
          {!audit && !auditError && <LoadingRow />}

          {audit && (
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktor</th>
                  <th>Aksi</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry, index) => (
                  <tr key={`${entry.at}-${index}`}>
                    <td className="nowrap">{formatDateTime(entry.at)}</td>
                    <td>{entry.actor}</td>
                    <td className="mono">{entry.action}</td>
                    <td>{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
