import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import FlowButton from '../components/FlowButton.jsx';
import { BRAND } from '../lib/brand.js';
import { useAuth } from '../lib/auth.jsx';

const DEMO = [
  ['superadmin@canopy.dev', 'Nagasatish', 'Super Admin · everything, incl. roles'],
  ['admin@canopy.dev', 'Satish', 'Admin · operations & people'],
  ['sre@canopy.dev', 'Bala', 'SRE / On-call · monitors, incidents, data'],
  ['dev@canopy.dev', 'Veneela', 'Developer · investigate & run checks'],
  ['viewer@canopy.dev', 'Sudha', 'Viewer · read-only'],
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav('/app', { replace: true });
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      nav('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-sky" aria-hidden="true">
        <span className="auth-bowl" />
        <span className="auth-bloom" />
        <div className="grain" />
      </div>

      <div className="auth-side">
        <Link to="/" aria-label="Back to home" className="rise">
          <Logo />
        </Link>
        <h1>
          <span className="wipe" style={{ '--d': '150ms' }}>
            Every endpoint.
          </span>
          <span className="wipe" style={{ '--d': '330ms' }}>
            Every heartbeat.
          </span>
          <span className="wipe accent" style={{ '--d': '510ms' }}>
            One place to fix it.
          </span>
        </h1>
        <p className="auth-foot rise" style={{ '--d': '900ms' }}>
          <b>{BRAND.line}</b> · Access is granted per role by your super admin.
        </p>
      </div>

      <div className="auth-card-wrap">
        <form className="auth-card rise" style={{ '--d': '350ms' }} onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="muted">Use your workspace account.</p>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="input-wrap">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
              <button type="button" className="input-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {error && <div className="form-error">{error}</div>}
          <FlowButton type="submit" size="md" block disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </FlowButton>

          <div className="demo">
            <span className="eyebrow">Demo accounts · password canopy123</span>
            <ul>
              {DEMO.map(([e, r, d]) => (
                <li key={e}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(e);
                      setPassword('canopy123');
                      setError('');
                    }}
                    className={email === e ? 'on' : ''}
                  >
                    <b>{r}</b>
                    <span>{d}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
}
