import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Activity, Siren, Database, ShieldCheck, LogOut, KeyRound, Menu, X, ChevronsUpDown } from 'lucide-react';
import Logo from '../../components/Logo.jsx';
import { BRAND } from '../../lib/brand.js';
import Modal from '../../components/Modal.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useLiveQuery, useLiveStatus, closeLive, isPolling } from '../../lib/live.js';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { initials } from '../../lib/format.js';

export default function Shell() {
  const { user, can, logout } = useAuth();
  const live = useLiveStatus();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const { data: inc } = useLiveQuery(can('incidents.view') ? '/incidents?status=active' : null, {
    filter: (e) => e.type === 'incident',
    enabled: can('incidents.view'),
  });
  const activeCount = inc?.incidents?.length || 0;

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [loc.pathname]);

  const items = [
    { to: '/app', end: true, icon: LayoutDashboard, label: 'Overview', show: can('monitors.view') },
    { to: '/app/monitors', icon: Activity, label: 'Monitors', show: can('monitors.view') },
    { to: '/app/incidents', icon: Siren, label: 'Incidents', show: can('incidents.view'), badge: activeCount },
    { to: '/app/data', icon: Database, label: 'Data console', show: can('data.read') },
    { to: '/app/access', icon: ShieldCheck, label: 'Access control', show: can('users.view') || can('roles.manage') || can('audit.view') },
  ];

  const signOut = async () => {
    closeLive();
    await logout();
    nav('/login', { replace: true });
  };

  return (
    <div className="shell">
      <div className="shell-wash" aria-hidden="true">
        <span className="wash-bowl" />
        <span className="wash-bloom" />
      </div>

      <header className="mbar">
        <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <Logo size={24} />
        <span className={`live ${live ? 'on' : ''}`}>
          <i />
          {live ? 'Live' : 'Offline'}
        </span>
      </header>

      <aside className={`side ${drawer ? 'open' : ''}`}>
        <div className="side-top">
          <NavLink to="/" className="side-brand" aria-label="Canopy home">
            <Logo dark size={26} />
            <span className="side-org">{BRAND.line}</span>
          </NavLink>
          <button className="icon-btn side-close" onClick={() => setDrawer(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <div className={`live side-live ${live ? 'on' : ''}`}>
          <i />
          {live ? (isPolling() ? 'Live · auto-refresh' : 'Live · streaming checks') : 'Reconnecting…'}
        </div>
        <nav className="side-nav" aria-label="App">
          {items
            .filter((i) => i.show)
            .map(({ to, end, icon: Icon, label, badge }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`}>
                <Icon size={18} />
                <span>{label}</span>
                {badge ? <em className="side-badge">{badge}</em> : null}
              </NavLink>
            ))}
        </nav>

        <div className="side-user-wrap">
          {menu && (
            <div className="user-menu" role="menu">
              <button role="menuitem" onClick={() => (setPwOpen(true), setMenu(false))}>
                <KeyRound size={16} /> Change password
              </button>
              <button role="menuitem" onClick={signOut}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
          <button className="side-user" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <span className="avatar">{initials(user.name)}</span>
            <span className="side-user-text">
              <b>{user.name}</b>
              <span>{user.role_name}</span>
            </span>
            <ChevronsUpDown size={15} />
          </button>
        </div>
      </aside>
      {drawer && <div className="side-scrim" onClick={() => setDrawer(false)} />}

      <main className="main">
        <Outlet />
      </main>

      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/password', { method: 'POST', body: { current, next } });
      toast('Password updated');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Change password" onClose={onClose} width={420}>
      <form onSubmit={save} className="form">
        <label className="field">
          <span>Current password</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
          <small>At least 8 characters.</small>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
