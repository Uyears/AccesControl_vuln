import { useEffect, useState } from 'react';
import { api, downloadFile, formatDate, getToken } from '../api';
import { EmptyState, ErrorNotice, LoadingRow, PageHeader } from '../components';

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function Documents() {
  const [state, setState] = useState({ documents: null, folders: [] });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [folderId, setFolderId] = useState('');

  async function reload() {
    const data = await api('/api/documents');
    setState({ documents: data.documents, folders: data.folders });
    if (data.folders[0]) setFolderId((current) => current || String(data.folders[0].id));
  }

  useEffect(() => {
    let active = true;
    api('/api/documents')
      .then((data) => {
        if (!active) return;
        setState({ documents: data.documents, folders: data.folders });
        if (data.folders[0]) setFolderId(String(data.folders[0].id));
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  async function upload(event) {
    event.preventDefault();
    if (!file) {
      setError(new Error('Pilih file teks yang akan diunggah.'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folderId', folderId);
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload && payload.message) || 'Unggahan ditolak.');
      }
      setFile(null);
      setNotice('Dokumen berhasil diunggah.');
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function download(document) {
    setError(null);
    try {
      await downloadFile(`/api/documents/${document.id}/download`, document.filename);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <PageHeader title="Dokumen" subtitle="Berkas teks yang dibagikan melalui akun Anda." />
      {error && <ErrorNotice message={error.message} />}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <section className="card">
        <h2>Unggah dokumen</h2>
        <form className="inline-form" onSubmit={upload}>
          <label className="field">
            <span>Folder</span>
            <select value={folderId} onChange={(event) => setFolderId(event.target.value)} required>
              {state.folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>File teks (.txt, .md, .csv, .log)</span>
            <input
              type="file"
              accept=".txt,.md,.csv,.log"
              onChange={(event) => setFile(event.target.files && event.target.files[0])}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !folderId}>
            {busy ? 'Mengunggah…' : 'Unggah'}
          </button>
        </form>
      </section>

      {!state.documents ? (
        <LoadingRow label="Memuat dokumen…" />
      ) : state.documents.length === 0 ? (
        <EmptyState title="Belum ada dokumen" description="Unggah berkas teks untuk mulai berbagi." />
      ) : (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nama file</th>
                <th>Folder</th>
                <th>Ukuran</th>
                <th>Diunggah</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.documents.map((document) => (
                <tr key={document.id}>
                  <td>{document.filename}</td>
                  <td>
                    {(state.folders.find((folder) => folder.id === document.folderId) || {}).name || '-'}
                  </td>
                  <td>{formatSize(document.size)}</td>
                  <td>{formatDate(document.createdAt)}</td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => download(document)}
                    >
                      Unduh
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
