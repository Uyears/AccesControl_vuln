import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api';
import { useAuth } from '../auth';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

const SECTIONS = {
  users: {
    title: 'Akun pengguna',
    subtitle: 'Kelola data pelanggan dan staf yang memiliki akses.',
  },
  audit: {
    title: 'Audit log',
    subtitle: 'Riwayat aktivitas operasional pada akun dan pesanan.',
  },
};

export default function Admin() {
  const { user } = useAuth();
  const [section, setSection] = useState('users');
  const [users, setUsers] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [auditError, setAuditError] = useState(null);

  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const auditEntries = (audit || []).filter((entry) => entry.action !== 'seed.load');

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
    if (section === 'audit' && !audit) loadAudit();
  }, [section]);

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
      if (section === 'audit') await loadAudit();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Menu operasional">
        <p className="admin-sidebar-title">Operasional</p>
        <button
          type="button"
          className={section === 'users' ? 'admin-nav-link active' : 'admin-nav-link'}
          onClick={() => setSection('users')}
        >
          Akun pengguna
        </button>
        <button
          type="button"
          className={section === 'audit' ? 'admin-nav-link active' : 'admin-nav-link'}
          onClick={() => setSection('audit')}
        >
          Audit log
        </button>
      </aside>

      <div className="admin-content">
        <PageHeader title={SECTIONS[section].title} subtitle={SECTIONS[section].subtitle} />

        {notice && <div className="alert alert-ok">{notice}</div>}

        {section === 'users' && (
          <section className="card">
            <div className="card-head">
              <h2>Daftar akun</h2>
              <span className="muted small">{users ? `${users.length} akun` : ''}</span>
            </div>

            {error && <ErrorNotice message={error.message} />}
            {!users && !error && <LoadingRow />}

            {users && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Nama</th>
                      <th>Email</th>
                      <th>Peran</th>
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
                            className={
                              item.role === 'admin' ? 'badge badge-info' : 'badge badge-muted'
                            }
                          >
                            {item.role === 'admin' ? 'Staf' : 'Pelanggan'}
                          </span>
                        </td>
                        <td className="align-right">
                          {user.role === 'admin' && (
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              disabled={busyId === item.id || item.id === user.id}
                              onClick={() => removeUser(item)}
                              title={item.id === user.id ? 'Tidak bisa menghapus akun sendiri' : ''}
                            >
                              {busyId === item.id ? 'Menghapus…' : 'Hapus'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {section === 'audit' && (
          <section className="card">
            <div className="card-head">
              <h2>Audit log</h2>
              <button type="button" className="btn btn-small btn-secondary" onClick={loadAudit}>
                Muat ulang
              </button>
            </div>

            {auditError && <ErrorNotice message={auditError.message} />}
            {!audit && !auditError && <LoadingRow />}

            {audit && (
              <div className="table-wrap">
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
                    {auditEntries.map((entry, index) => (
                      <tr key={`${entry.at}-${index}`}>
                        <td className="nowrap">{formatDateTime(entry.at)}</td>
                        <td>{entry.actor}</td>
                        <td className="mono">{entry.action}</td>
                        <td>{entry.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
