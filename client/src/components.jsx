import { Link } from './router';

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    Dikirim: 'info',
    Diproses: 'warn',
    Selesai: 'ok',
    Dibatalkan: 'muted',
    open: 'warn',
    closed: 'ok',
  };
  const tone = map[status] || 'muted';
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

export function ErrorNotice({ message, status }) {
  if (!message) return null;
  return (
    <div className="alert alert-error">
      <strong>Akses gagal{status ? ` (${status})` : ''}.</strong>
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, description, actionLabel, actionTo }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {actionTo && actionLabel && (
        <Link to={actionTo} className="btn btn-secondary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function LoadingRow({ label = 'Memuat data…' }) {
  return <p className="muted">{label}</p>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
