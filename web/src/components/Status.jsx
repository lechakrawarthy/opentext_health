import { STATUS_LABEL } from '../lib/format.js';

export function StatusDot({ status, pulse = false }) {
  return <span className={`sdot sdot-${status} ${pulse && (status === 'down' || status === 'up') ? 'sdot-pulse' : ''}`} aria-hidden="true" />;
}

export function StatusBadge({ status, children }) {
  return (
    <span className={`sbadge sbadge-${status}`}>
      <StatusDot status={status} />
      {children || STATUS_LABEL[status] || status}
    </span>
  );
}

const SEV = { critical: 'Critical', major: 'Major', minor: 'Minor' };
export function SeverityTag({ severity }) {
  return <span className={`sev sev-${severity}`}>{SEV[severity] || severity}</span>;
}

const INC = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved' };
export function IncidentState({ status }) {
  return <span className={`istate istate-${status}`}>{INC[status] || status}</span>;
}

export function EnvTag({ env }) {
  return <span className={`env env-${env}`}>{env === 'production' ? 'prod' : env === 'staging' ? 'staging' : 'dev'}</span>;
}

const BUCKET_LABEL = { up: 'Healthy', degraded: 'Slow', partial: 'Some failures', down: 'Outage', none: 'No data' };

export function UptimeStrip({ buckets, compact = false }) {
  return (
    <div className={`ustrip ${compact ? 'ustrip-compact' : ''}`} role="img" aria-label="Health over the last 24 hours">
      {buckets.map((b, i) => {
        const s = typeof b === 'string' ? b : b.s;
        const title =
          typeof b === 'string'
            ? BUCKET_LABEL[s]
            : `${new Date(b.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${BUCKET_LABEL[s]}${b.n ? ` · ${b.n - b.fails}/${b.n} ok` : ''}`;
        return <span key={i} className={`ub ub-${s}`} title={title} />;
      })}
    </div>
  );
}
