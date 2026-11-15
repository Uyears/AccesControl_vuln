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

const STATUS = {
  Dikirim: { label: 'Dikirim', tone: 'info' },
  Diproses: { label: 'Diproses', tone: 'warn' },
  Selesai: { label: 'Selesai', tone: 'ok' },
  Dibatalkan: { label: 'Dibatalkan', tone: 'muted' },
  open: { label: 'Terbuka', tone: 'warn' },
  closed: { label: 'Selesai', tone: 'ok' },
};

export function StatusBadge({ status }) {
  const item = STATUS[status] || { label: status, tone: 'muted' };
  return <span className={`badge badge-${item.tone}`}>{item.label}</span>;
}

export function ErrorNotice({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      {message}
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
  return <p className="loading-row muted">{label}</p>;
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
