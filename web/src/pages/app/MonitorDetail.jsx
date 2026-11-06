import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Pencil, Trash2, Pause, PlayCircle, Siren, CheckCircle2 } from 'lucide-react';
import { useLiveQuery } from '../../lib/live.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { api } from '../../lib/api.js';
import { StatusBadge, EnvTag, UptimeStrip, SeverityTag, IncidentState } from '../../components/Status.jsx';
import LatencyChart from '../../components/LatencyChart.jsx';
import Diagnosis from '../../components/Diagnosis.jsx';
import { ago, dateTime, duration, ms, pct, time } from '../../lib/format.js';
import { MonitorForm, DeleteMonitor } from './Monitors.jsx';
import { PageSkeleton } from './Overview.jsx';
import { useNow } from './hooks.js';

export default function MonitorDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const now = useNow(5000);
  const { data, error, reload } = useLiveQuery(`/monitors/${id}`, {
    filter: (e) => Number(e.monitor_id ?? e.id) === Number(id) || e.type === 'data',
    throttle: 1500,
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);

  if (error) {
    return (
      <div className="page">
        <Link to="/app/monitors" className="back">
          <ArrowLeft size={16} /> Monitors
        </Link>
        <div className="form-error">{error.message}</div>
      </div>
    );
  }
  if (!data) return <PageSkeleton />;

  const { monitor: m, stats, buckets, latency, checks, incidents, diagnosis, breakdown, last_failure, thresholds } = data;

  const run = async () => {
    setRunning(true);
    try {
      const { result } = await api(`/monitors/${m.id}/run`, { method: 'POST' });
      toast(result.ok ? `Healthy · ${ms(result.latency_ms)}` : result.label, result.ok ? 'ok' : 'error');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  const togglePause = async () => {
    try {
      await api(`/monitors/${m.id}`, { method: 'PUT', body: { enabled: m.enabled ? 0 : 1 } });
      toast(m.enabled ? 'Monitor paused' : 'Monitor resumed');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <Link to="/app/monitors" className="back">
        <ArrowLeft size={16} /> Monitors
      </Link>

      <header className="page-head detail-head">
        <div>
          <div className="detail-tags">
            <StatusBadge status={m.status} />
            <EnvTag env={m.environment} />
            {m.service_group && <span className="tag">{m.service_group}</span>}
            {m.owner_team && <span className="tag">Owner · {m.owner_team}</span>}
          </div>
          <h1>{m.name}</h1>
          <p className="mono url-line">
            <em className="method">{m.method}</em> {m.url}
          </p>
        </div>
        <div className="head-actions">
          {can('monitors.run') && (
            <button className="btn btn-primary" onClick={run} disabled={running}>
              <Play size={16} className={running ? 'spin-soft' : ''} /> {running ? 'Checking…' : 'Run check'}
            </button>
          )}
          {can('monitors.edit') && (
            <>
              <button className="btn btn-ghost" onClick={togglePause}>
                {m.enabled ? <Pause size={16} /> : <PlayCircle size={16} />} {m.enabled ? 'Pause' : 'Resume'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit
              </button>
            </>
          )}
          {can('monitors.delete') && (
            <button className="icon-btn icon-danger" onClick={() => setDeleting(true)} title="Delete monitor">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      <section className="kpis kpis-5">
        <Stat label="Uptime · 24h" value={pct(stats.uptime24)} foot={`${stats.failures24} failed of ${stats.checks24}`} />
        <Stat label="Uptime · 7d" value={pct(stats.uptime7d)} />
        <Stat label="p50 · 24h" value={ms(stats.p50)} />
        <Stat label="p95 · 24h" value={ms(stats.p95)} foot={`budget ${ms(m.degraded_ms)}`} warn={stats.p95 > m.degraded_ms} />
        <Stat
          label="Last check"
          value={m.enabled ? ms(m.last_latency_ms) : 'Paused'}
          foot={m.last_checked_at ? `${ago(m.last_checked_at, now)} · HTTP ${m.last_status_code ?? '—'}` : 'pending'}
        />
      </section>

      {diagnosis ? (
        <Diagnosis
          diagnosis={diagnosis}
          message={m.status === 'degraded' ? `Last response ${ms(m.last_latency_ms)}, budget ${ms(m.degraded_ms)}` : m.last_message}
        />
      ) : (
        <div className="all-clear all-clear-panel">
          <CheckCircle2 size={22} />
          <div>
            <b>{m.enabled ? 'Healthy. Nothing to troubleshoot.' : 'This monitor is paused.'}</b>
            <span>
              {last_failure
                ? `Last failure ${ago(last_failure.ts, now)}: ${last_failure.label}.`
                : 'No failures recorded in the retention window.'}{' '}
              Incidents open after {thresholds.fail} consecutive failures and close after {thresholds.recover} healthy checks.
            </span>
          </div>
        </div>
      )}

      <section className="grid-2 grid-2-wide">
        <div className="panel">
          <header className="panel-head">
            <h2>Latency · 24h</h2>
            <span className="muted small">average of successful checks, 20 min buckets</span>
          </header>
          <LatencyChart series={latency} threshold={m.degraded_ms} height={220} />
          <div className="strip-block">
            <span className="muted small">Health · 24h</span>
            <UptimeStrip buckets={buckets} />
          </div>
        </div>
        <div className="panel">
          <header className="panel-head">
            <h2>Failures by type · 24h</h2>
          </header>
          {breakdown.length === 0 ? (
            <p className="muted">No failed checks in the last 24 hours.</p>
          ) : (
            <ul className="bars">
              {breakdown.map((b) => (
                <li key={b.kind}>
                  <span>{b.label}</span>
                  <i style={{ '--w': `${(b.n / breakdown[0].n) * 100}%` }} />
                  <b>{b.n}</b>
                </li>
              ))}
            </ul>
          )}
          <header className="panel-head" style={{ marginTop: 24 }}>
            <h2>Incidents</h2>
          </header>
          {incidents.length === 0 ? (
            <p className="muted">No incidents for this monitor.</p>
          ) : (
            <ul className="inc-mini">
              {incidents.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <Link to={`/app/incidents/${i.id}`}>
                    <Siren size={14} />
                    <span>
                      <b>#{i.id}</b> {dateTime(i.started_at)}
                    </span>
                    <SeverityTag severity={i.severity} />
                    <IncidentState status={i.status} />
                    <time>{duration((i.resolved_at || now) - i.started_at)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="panel panel-flush">
        <header className="panel-head pad">
          <h2>Recent checks</h2>
          <span className="muted small">newest first</span>
        </header>
        <div className="table-wrap checks-scroll">
          <table className="table table-dense">
            <thead>
              <tr>
                <th>Time</th>
                <th>Result</th>
                <th className="num">HTTP</th>
                <th className="num">Latency</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => {
                const s = c.ok ? (c.latency_ms > m.degraded_ms ? 'degraded' : 'up') : 'down';
                return (
                  <tr key={c.id}>
                    <td className="mono">{time(c.ts)}</td>
                    <td>
                      <StatusBadge status={s}>{c.ok ? (s === 'degraded' ? 'Slow' : 'OK') : 'Failed'}</StatusBadge>
                    </td>
                    <td className="num mono">{c.status_code ?? '—'}</td>
                    <td className="num mono">{ms(c.latency_ms)}</td>
                    <td className="mono muted cell-clip">{c.message || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <MonitorForm
          monitor={m}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
      {deleting && <DeleteMonitor monitor={m} onClose={() => setDeleting(false)} onDone={() => nav('/app/monitors')} />}
    </div>
  );
}

function Stat({ label, value, foot, warn }) {
  return (
    <div className={`kpi ${warn ? 'kpi-warn' : ''}`}>
      <span className="kpi-label">{label}</span>
      <div className="kpi-value kpi-value-sm">{value}</div>
      {foot && <span className="kpi-foot">{foot}</span>}
    </div>
  );
}
