import { ShieldOff } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

export default function NoAccess() {
  const { user } = useAuth();
  return (
    <div className="empty empty-page">
      <span className="empty-icon">
        <ShieldOff size={22} />
      </span>
      <h2>This area isn’t part of your role</h2>
      <p className="muted">
        You’re signed in as <b>{user?.role_name}</b>. Ask a super admin to grant the permission if you need it.
      </p>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={20} />
        </span>
      )}
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
