import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Siren, CheckCheck, Hand, RotateCcw, MessageSquarePlus, ArrowUpRight, Bot, ArrowLeft } from 'lucide-react';
import { useLiveQuery } from '../../lib/live.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { api } from '../../lib/api.js';
import { SeverityTag, IncidentState, EnvTag } from '../../components/Status.jsx';
import Diagnosis from '../../components/Diagnosis.jsx';
import { Empty } from '../../components/NoAccess.jsx';
import { ago, dateTime, duration, initials, ms, time } from '../../lib/format.js';
import { useNow } from './hooks.js';

const TABS = [
  ['active', 'Active'],
  ['resolved', 'Resolved'],
  ['all', 'All'],
];

export default function Incidents() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState('active');
  const now = useNow(10000);
  const { data } = useLiveQuery(`/incidents?status=${tab}`, { filter: (e) => e.type === 'incident' || e.type === 'data' });
  const list = data?.incidents || [];
  const counts = data?.counts || {};

  useEffect(() => {
    if (!id && list.length && window.innerWidth > 1100) nav(`/app/incidents/${list[0].id}`, { replace: true });
  }, [id, list, nav]);

  return (
    <div className={`page page-split ${id ? 'has-detail' : ''}`}>
      <div className="split-list">
        <header className="page-head">
          <div>
            <span className="eyebrow">Response</span>
            <h1>Incidents</h1>
            <p className="page-sub">Opened automatically after consecutive failures. Resolved by recovery or by your team.</p>
          </div>
        </header>
        <div className="seg seg-full" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
              <em>{k === 'active' ? (counts.open || 0) + (counts.acknowledged || 0) : k === 'resolved' ? counts.resolved || 0 : Object.values(counts).reduce((a, b) => a + b, 0)}</em>
            </button>
          ))}
        </div>
        {data && list.length === 0 ? (
          <Empty icon={Siren} title={tab === 'active' ? 'No active incidents' : 'Nothing here yet'}>
            {tab === 'active' ? 'Every monitored endpoint is behaving. New incidents appear here the moment checks start failing.' : null}
          </Empty>
        ) : (
          <ul className="inc-list">
            {list.map((i) => (
              <li key={i.id}>
                <Link to={`/app/incidents/${i.id}`} className={`inc-card ${Number(id) === i.id ? 'on' : ''} inc-${i.status}`}>
                  <div className="inc-card-top">
                    <SeverityTag severity={i.severity} />
                    <IncidentState status={i.status} />
                    <time>{ago(i.started_at, now)}</time>
                  </div>
                  <b>{i.monitor_name}</b>
                  <span className="inc-kind">{i.label}</span>
                  <div className="inc-card-foot">
                    <EnvTag env={i.environment} />
                    <span>{i.owner_team}</span>
                    <span className="push">
                      {i.status === 'resolved' ? `lasted ${duration(i.resolved_at - i.started_at)}` : `for ${duration(now - i.started_at)}`}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="split-detail">
        {id ? (
          <IncidentDetail id={id} key={id} />
        ) : (
          <Empty icon={Siren} title="Select an incident">
            Pick an incident to see where it failed and what to do next.
          </Empty>
        )}
      </div>
    </div>
  );
}

function IncidentDetail({ id }) {
  const { can } = useAuth();
  const toast = useToast();
  const now = useNow(5000);
  const { data, error, setData } = useLiveQuery(`/incidents/${id}`, {
    filter: (e) => (e.type === 'incident' && Number(e.id) === Number(id)) || e.type === 'check',
    throttle: 4000,
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (error) return <div className="form-error">{error.message}</div>;
  if (!data) return <div className="skel" style={{ height: 480, borderRadius: 20 }} />;
  const { incident: i, events, window: win, diagnosis } = data;

  const act = async (action) => {
    setBusy(true);
    try {
      const d = await api(`/incidents/${i.id}/${action}`, { method: 'POST', body: { note } });
      setData(d);
      setNote('');
      toast({ ack: 'Acknowledged. You own this incident.', resolve: 'Incident resolved', reopen: 'Incident reopened', note: 'Note added' }[action]);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const end = i.resolved_at || now;
  const maxLat = Math.max(1, ...win.map((c) => c.latency_ms || 0));

  return (
    <article className="inc-detail">
      <Link to="/app/incidents" className="back back-mobile">
        <ArrowLeft size={16} /> Incidents
      </Link>
      <header className="inc-head">
        <div className="detail-tags">
          <SeverityTag severity={i.severity} />
          <IncidentState status={i.status} />
          <EnvTag env={i.environment} />
          <span className="tag">#{i.id}</span>
        </div>
        <h2>{i.title}</h2>
        <Link to={`/app/monitors/${i.monitor_id}`} className="link">
          Open monitor <ArrowUpRight size={14} />
        </Link>
      </header>

      <dl className="facts">
        <div>
          <dt>Started</dt>
          <dd>{dateTime(i.started_at)}</dd>
        </div>
        <div>
          <dt>{i.resolved_at ? 'Lasted' : 'Ongoing for'}</dt>
          <dd>{duration(end - i.started_at)}</dd>
        </div>
        <div>
          <dt>Failed checks</dt>
          <dd>{i.failed_checks}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{i.acknowledged_by_name || <span className="muted">Unassigned</span>}</dd>
        </div>
      </dl>

      <div className="win">
        <div className="win-bars" role="img" aria-label="Checks around the incident">
          {win.map((c, k) => (
            <span
              key={k}
              className={`wb ${c.ok ? 'wb-ok' : 'wb-fail'} ${c.ts >= i.started_at && c.ts <= end ? 'wb-in' : ''}`}
              style={{ height: c.ok ? `${12 + (c.latency_ms / maxLat) * 88}%` : '100%' }}
              title={`${time(c.ts)} · ${c.ok ? ms(c.latency_ms) : c.error_kind}`}
            />
          ))}
        </div>
        <div className="win-axis">
          <span>{win[0] ? time(win[0].ts) : ''}</span>
          <span>checks around the incident window</span>
          <span>{win.length ? time(win[win.length - 1].ts) : ''}</span>
        </div>
      </div>

      {can('incidents.manage') && (
        <div className="inc-actions">
          <textarea
            placeholder={i.status === 'resolved' ? 'Add a postmortem note…' : 'What did you find? Notes go on the timeline.'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="inc-btns">
            <button className="btn btn-ghost" onClick={() => act('note')} disabled={busy || !note.trim()}>
              <MessageSquarePlus size={16} /> Add note
            </button>
            {i.status === 'open' && (
              <button className="btn btn-ghost" onClick={() => act('ack')} disabled={busy}>
                <Hand size={16} /> Acknowledge
              </button>
            )}
            {i.status !== 'resolved' ? (
              <button className="btn btn-primary" onClick={() => act('resolve')} disabled={busy}>
                <CheckCheck size={16} /> Resolve
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => act('reopen')} disabled={busy}>
                <RotateCcw size={16} /> Reopen
              </button>
            )}
          </div>
        </div>
      )}

      <Diagnosis diagnosis={diagnosis} compact />

      <section className="timeline">
        <h3>Timeline</h3>
        <ol>
          {[...events].reverse().map((e) => (
            <li key={e.id} className={`tl tl-${e.kind}`}>
              <span className="tl-who">{e.user_name ? initials(e.user_name) : <Bot size={14} />}</span>
              <div>
                <div className="tl-meta">
                  <b>{e.user_name || 'Canopy'}</b>
                  <span>{e.kind}</span>
                  <time>{dateTime(e.ts)}</time>
                </div>
                <p>{e.message}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
