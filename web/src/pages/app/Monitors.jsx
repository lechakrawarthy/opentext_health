import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Play, Pencil, Trash2, Activity } from 'lucide-react';
import { useLiveQuery } from '../../lib/live.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { api } from '../../lib/api.js';
import { StatusBadge, EnvTag, UptimeStrip } from '../../components/Status.jsx';
import Modal, { Confirm } from '../../components/Modal.jsx';
import { Empty } from '../../components/NoAccess.jsx';
import { ago, ms, pct } from '../../lib/format.js';
import { PageSkeleton } from './Overview.jsx';
import { useNow } from './hooks.js';

const FILTERS = [
  ['all', 'All'],
  ['down', 'Down'],
  ['degraded', 'Degraded'],
  ['up', 'Operational'],
  ['paused', 'Paused'],
];

export default function Monitors() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, reload } = useLiveQuery('/monitors', { filter: (e) => e.type === 'check' || e.type === 'monitor' || e.type === 'data' });
  const now = useNow(5000);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [env, setEnv] = useState('all');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [running, setRunning] = useState(new Set());

  const monitors = data?.monitors || [];
  const counts = useMemo(() => {
    const c = { all: monitors.length };
    for (const m of monitors) c[m.status] = (c[m.status] || 0) + 1;
    return c;
  }, [monitors]);

  const list = monitors.filter((m) => {
    if (status !== 'all' && m.status !== status) return false;
    if (env !== 'all' && m.environment !== env) return false;
    if (q) {
      const s = q.toLowerCase();
      return [m.name, m.url, m.owner_team, m.service_group].some((v) => v?.toLowerCase().includes(s));
    }
    return true;
  });

  const run = async (m) => {
    setRunning((s) => new Set(s).add(m.id));
    try {
      const { result } = await api(`/monitors/${m.id}/run`, { method: 'POST' });
      toast(
        result.ok ? `${m.name}: healthy in ${ms(result.latency_ms)}` : `${m.name}: ${result.label}`,
        result.ok ? 'ok' : 'error',
      );
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(m.id);
        return n;
      });
    }
  };

  if (!data) return <PageSkeleton />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Monitoring</span>
          <h1>Monitors</h1>
          <p className="page-sub">Endpoints under watch, their thresholds and who owns them.</p>
        </div>
        {can('monitors.create') && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={17} /> New monitor
          </button>
        )}
      </header>

      <div className="toolbar">
        <div className="seg" role="tablist">
          {FILTERS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
              {l}
              <em>{counts[k] || 0}</em>
            </button>
          ))}
        </div>
        <select className="select" value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Environment">
          <option value="all">All environments</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
        <label className="search">
          <Search size={16} />
          <input placeholder="Search name, URL, team…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="panel panel-flush">
        {list.length === 0 ? (
          <Empty icon={Activity} title="No monitors match">
            Try another filter, or create a monitor for the endpoint you want to watch.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th className="hide-md">Last 24h</th>
                  <th className="num">Uptime</th>
                  <th className="num">Latency</th>
                  <th className="hide-sm">Owner</th>
                  <th className="actions-col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/app/monitors/${m.id}`} className="cell-main">
                        <b>{m.name}</b>
                        <span className="mono">
                          <em className="method">{m.method}</em> {m.url}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={m.status} />
                      <div className="cell-sub">
                        <EnvTag env={m.environment} /> {m.enabled ? `every ${m.interval_s}s` : ''}
                      </div>
                    </td>
                    <td className="hide-md" style={{ minWidth: 200 }}>
                      <UptimeStrip buckets={m.buckets} compact />
                    </td>
                    <td className="num">{pct(m.uptime24)}</td>
                    <td className="num">
                      {m.enabled ? ms(m.last_latency_ms) : '—'}
                      <div className="cell-sub">{m.enabled ? ago(m.last_checked_at, now) : 'paused'}</div>
                    </td>
                    <td className="hide-sm">
                      {m.owner_team || '—'}
                      <div className="cell-sub">{m.service_group}</div>
                    </td>
                    <td className="actions-col">
                      <div className="row-actions">
                        {can('monitors.run') && (
                          <button className="icon-btn" title="Run check now" onClick={() => run(m)} disabled={running.has(m.id)}>
                            <Play size={15} className={running.has(m.id) ? 'spin-soft' : ''} />
                          </button>
                        )}
                        {can('monitors.edit') && (
                          <button className="icon-btn" title="Edit" onClick={() => setEditing(m)}>
                            <Pencil size={15} />
                          </button>
                        )}
                        {can('monitors.delete') && (
                          <button className="icon-btn icon-danger" title="Delete" onClick={() => setDeleting(m)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <MonitorForm
          monitor={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {deleting && (
        <DeleteMonitor
          monitor={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

export function DeleteMonitor({ monitor, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Confirm
      title={`Delete “${monitor.name}”?`}
      body="This removes the monitor, all of its check history and its incidents. This can’t be undone."
      confirmLabel="Delete monitor"
      danger
      busy={busy}
      onClose={onClose}
      onConfirm={async () => {
        setBusy(true);
        try {
          await api(`/monitors/${monitor.id}`, { method: 'DELETE' });
          toast('Monitor deleted');
          onDone();
        } catch (e) {
          toast(e.message, 'error');
          setBusy(false);
        }
      }}
    />
  );
}

const DEFAULTS = {
  name: '',
  url: 'https://',
  method: 'GET',
  expected_status: 200,
  expect_text: '',
  timeout_ms: 5000,
  interval_s: 60,
  degraded_ms: 1000,
  environment: 'production',
  service_group: '',
  owner_team: '',
  enabled: 1,
};

export function MonitorForm({ monitor, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ ...DEFAULTS, ...(monitor || {}) }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: f.name,
      url: f.url,
      method: f.method,
      expected_status: Number(f.expected_status),
      expect_text: f.expect_text,
      timeout_ms: Number(f.timeout_ms),
      interval_s: Number(f.interval_s),
      degraded_ms: Number(f.degraded_ms),
      environment: f.environment,
      service_group: f.service_group,
      owner_team: f.owner_team,
      enabled: f.enabled ? 1 : 0,
    };
    try {
      if (monitor) await api(`/monitors/${monitor.id}`, { method: 'PUT', body });
      else await api('/monitors', { method: 'POST', body });
      toast(monitor ? 'Monitor updated' : 'Monitor created. First check is running.');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={monitor ? 'Edit monitor' : 'New monitor'}
      subtitle={monitor ? monitor.name : 'Canopy starts checking as soon as you save.'}
      onClose={onClose}
      width={640}
    >
      <form className="form" onSubmit={save}>
        <div className="form-grid">
          <label className="field span-2">
            <span>Name</span>
            <input value={f.name} onChange={set('name')} required maxLength={120} placeholder="Payments · Charge API" />
          </label>
          <label className="field">
            <span>Method</span>
            <select value={f.method} onChange={set('method')}>
              {['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="field span-3">
            <span>URL</span>
            <input value={f.url} onChange={set('url')} required className="mono" placeholder="https://api.example.com/health" />
          </label>
          <label className="field">
            <span>Expected status</span>
            <input type="number" value={f.expected_status} onChange={set('expected_status')} min={0} max={599} />
            <small>0 accepts any 2xx/3xx</small>
          </label>
          <label className="field span-2">
            <span>Body must contain (optional)</span>
            <input value={f.expect_text} onChange={set('expect_text')} placeholder='"status":"ok"' className="mono" />
          </label>
          <label className="field">
            <span>Check every (s)</span>
            <input type="number" value={f.interval_s} onChange={set('interval_s')} min={10} max={86400} />
          </label>
          <label className="field">
            <span>Timeout (ms)</span>
            <input type="number" value={f.timeout_ms} onChange={set('timeout_ms')} min={250} max={60000} />
          </label>
          <label className="field">
            <span>Degraded above (ms)</span>
            <input type="number" value={f.degraded_ms} onChange={set('degraded_ms')} min={50} max={60000} />
          </label>
          <label className="field">
            <span>Environment</span>
            <select value={f.environment} onChange={set('environment')}>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </label>
          <label className="field">
            <span>Service group</span>
            <input value={f.service_group} onChange={set('service_group')} placeholder="Billing" />
          </label>
          <label className="field">
            <span>Owning team</span>
            <input value={f.owner_team} onChange={set('owner_team')} placeholder="Payments Platform" />
          </label>
          <label className="switch-row span-3">
            <input type="checkbox" className="switch" checked={!!f.enabled} onChange={set('enabled')} />
            <span>
              <b>Active</b>
              <small>Paused monitors keep their history but are not checked.</small>
            </span>
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : monitor ? 'Save changes' : 'Create monitor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
