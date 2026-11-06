import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Siren, CheckCircle2, ChevronRight } from 'lucide-react';
import { useLiveQuery } from '../../lib/live.js';
import { useAuth } from '../../lib/auth.jsx';
import { StatusDot, EnvTag, UptimeStrip, SeverityTag, IncidentState } from '../../components/Status.jsx';
import LatencyChart from '../../components/LatencyChart.jsx';
import { ago, duration, ms, pct } from '../../lib/format.js';
import { useNow } from './hooks.js';

const ORDER = { down: 0, degraded: 1, pending: 2, up: 3, paused: 4 };

export default function Overview() {
  const { user } = useAuth();
  const { data, error } = useLiveQuery('/overview');
  const now = useNow(5000);

  if (error) return <div className="page"><div className="form-error">{error.message}</div></div>;
  if (!data) return <PageSkeleton />;

  const { kpis, monitors, latency, attention, incidents } = data;
  const failing = kpis.down;
  const active = monitors.filter((m) => m.enabled).length;
  const sorted = [...monitors].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">
            {greet}, {user.name.split(' ')[0]}
          </span>
          <h1>System health</h1>
          <p className="page-sub">
            {failing ? (
              <>
                <b className="t-down">
                  {failing} endpoint{failing > 1 ? 's are' : ' is'} failing
                </b>
                {kpis.degraded ? (
                  <>
                    {' '}
                    and <b className="t-degraded">{kpis.degraded} running slow</b>
                  </>
                ) : null}
                . Start with the items under “Needs attention”.
              </>
            ) : kpis.degraded ? (
              <>
                No outages. <b className="t-degraded">{kpis.degraded} running slow</b>.
              </>
            ) : (
              <>All {active} active endpoints are operational.</>
            )}
          </p>
        </div>
        <span className="updated">Updated {ago(data.generated_at, now)}</span>
      </header>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Operational</span>
          <div className="kpi-value">
            {kpis.up}
            <small>/ {active}</small>
          </div>
          <div className="stack" aria-hidden="true">
            {['up', 'degraded', 'down'].map((s) => (
              <span key={s} className={`stack-${s}`} style={{ flexGrow: kpis[s] || 0 }} />
            ))}
          </div>
          <div className="kpi-legend">
            <span>
              <StatusDot status="degraded" /> {kpis.degraded} slow
            </span>
            <span>
              <StatusDot status="down" /> {kpis.down} down
            </span>
            {kpis.paused ? (
              <span>
                <StatusDot status="paused" /> {kpis.paused} paused
              </span>
            ) : null}
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-label">Uptime · 24h</span>
          <div className="kpi-value">{pct(kpis.uptime24)}</div>
          <span className="kpi-foot">{kpis.checks24.toLocaleString()} checks</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">p95 latency · 1h</span>
          <div className="kpi-value">{ms(kpis.p95_1h)}</div>
          <span className="kpi-foot">median {ms(kpis.p50_1h)}</span>
        </div>
        <div className={`kpi ${kpis.open_incidents ? 'kpi-alert' : ''}`}>
          <span className="kpi-label">Active incidents</span>
          <div className="kpi-value">{kpis.open_incidents}</div>
          <span className="kpi-foot">
            {kpis.resolved24} resolved · 24h{kpis.mttr_ms ? ` · MTTR ${duration(kpis.mttr_ms)}` : ''}
          </span>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <header className="panel-head">
            <h2>Needs attention</h2>
            {attention.length > 0 && <span className="count">{attention.length}</span>}
          </header>
          {attention.length === 0 ? (
            <div className="all-clear">
              <CheckCircle2 size={22} />
              <div>
                <b>Nothing needs you right now</b>
                <span>Every active endpoint is healthy and within its latency budget.</span>
              </div>
            </div>
          ) : (
            <ul className="attn">
              {attention.map((a) => (
                <li key={a.monitor_id} className={`attn-item attn-${a.status}`}>
                  <div className="attn-top">
                    <StatusDot status={a.status} pulse />
                    <Link to={`/app/monitors/${a.monitor_id}`} className="attn-name">
                      {a.name}
                    </Link>
                    <EnvTag env={a.environment} />
                    {a.since && <span className="attn-since">{duration(now - a.since)}</span>}
                  </div>
                  <div className="attn-kind">{a.label}</div>
                  <div className="attn-where">
                    <MapPin size={14} />
                    <span>
                      <b>{a.hop}:</b> {a.where}
                    </span>
                  </div>
                  <p className="attn-step">{a.first_step.replace(/`/g, '')}</p>
                  <div className="attn-actions">
                    <Link to={`/app/monitors/${a.monitor_id}`} className="link">
                      Troubleshoot <ArrowUpRight size={14} />
                    </Link>
                    {a.incident && (
                      <Link to={`/app/incidents/${a.incident.id}`} className="link link-muted">
                        <Siren size={13} /> Incident #{a.incident.id}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <header className="panel-head">
            <h2>Average latency · 24h</h2>
            <span className="muted small">successful checks, all endpoints</span>
          </header>
          <LatencyChart series={latency} height={230} />
          <div className="mini-incidents">
            <header>
              <h3>Recent incidents</h3>
              <Link to="/app/incidents" className="link link-muted">
                View all <ChevronRight size={14} />
              </Link>
            </header>
            <ul>
              {incidents.slice(0, 4).map((i) => (
                <li key={i.id}>
                  <Link to={`/app/incidents/${i.id}`}>
                    <SeverityTag severity={i.severity} />
                    <span className="mi-title">{i.title}</span>
                    <IncidentState status={i.status} />
                    <time>{ago(i.started_at, now)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Service health</h2>
          <span className="muted small">last 24 hours · 30 min per bar</span>
          <Link to="/app/monitors" className="link link-muted push">
            Manage monitors <ChevronRight size={14} />
          </Link>
        </header>
        <div className="svc-list">
          {sorted.map((m) => (
            <Link key={m.id} to={`/app/monitors/${m.id}`} className={`svc ${m.enabled ? '' : 'svc-paused'}`}>
              <StatusDot status={m.status} pulse={m.status === 'down'} />
              <div className="svc-name">
                <b>{m.name}</b>
                <span>
                  <EnvTag env={m.environment} /> {m.owner_team}
                </span>
              </div>
              <UptimeStrip buckets={m.buckets} />
              <div className="svc-num">
                <b>{pct(m.uptime24)}</b>
                <span>uptime</span>
              </div>
              <div className="svc-num">
                <b>{m.enabled ? ms(m.last_latency_ms) : '—'}</b>
                <span>{m.enabled ? ago(m.last_checked_at, now) : 'paused'}</span>
              </div>
              <ChevronRight size={16} className="svc-chev" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page">
      <div className="skel skel-title" />
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi skel" style={{ height: 128 }} />
        ))}
      </div>
      <div className="skel" style={{ height: 320, borderRadius: 20 }} />
    </div>
  );
}
