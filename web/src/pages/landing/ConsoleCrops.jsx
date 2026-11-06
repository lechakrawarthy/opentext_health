import { useEffect, useState } from 'react';
import { Activity, Globe, Lock, Router, Server, MapPin, Check, X, Crown, ShieldCheck } from 'lucide-react';

/*
  Cropped slices of the real console UI, used on the landing page.
  They reuse the app's visual vocabulary (status dots, env tags, uptime strips,
  the failure path) and bleed off the frame like a product screenshot.
*/

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function strip(seed, pattern) {
  const r = seeded(seed);
  return Array.from({ length: 30 }, (_, i) => {
    if (pattern === 'fail' && i >= 24) return 'down';
    if (pattern === 'flaky' && r() < 0.28) return 'partial';
    if (pattern === 'slow' && Math.sin(i / 3) > 0.55) return 'degraded';
    return 'up';
  });
}

const ROWS = [
  { name: 'Identity · Token issuance', env: 'prod', s: strip(3, 'ok'), up: '100%', ms: '46 ms', st: 'up' },
  { name: 'Payments · Webhook', env: 'prod', s: strip(7, 'flaky'), up: '98.12%', ms: '162 ms', st: 'up' },
  { name: 'Search · Query', env: 'prod', s: strip(11, 'slow'), up: '100%', ms: '1.08 s', st: 'degraded' },
  { name: 'Archive · Retrieve', env: 'staging', s: strip(5, 'fail'), up: '74.19%', ms: '—', st: 'down' },
];

function HealthCrop() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="crop">
      <div className="crop-head">
        <b>Service health</b>
        <span>last 24 hours</span>
        <span className="crop-live">
          <i /> Live
        </span>
      </div>
      {ROWS.map((r, ri) => (
        <div key={r.name} className="crop-row">
          <i className={`crop-dot crop-${r.st}`} />
          <div className="crop-name">
            <b>{r.name}</b>
            <em className={`crop-env crop-env-${r.env}`}>{r.env}</em>
          </div>
          <div className="crop-strip">
            {r.s.map((b, i) => (
              <span key={i} className={`cb cb-${b} ${i === r.s.length - 1 && (tick + ri) % 2 === 0 ? 'cb-blink' : ''}`} />
            ))}
          </div>
          <span className="crop-num">{r.up}</span>
        </div>
      ))}
    </div>
  );
}

function TriageCrop() {
  return (
    <div className="crop">
      <div className="crop-head">
        <b>Needs attention</b>
        <em className="crop-count">2</em>
      </div>
      <div className="crop-attn crop-attn-down">
        <div className="crop-attn-top">
          <i className="crop-dot crop-down crop-ping" />
          <b>Legacy gateway · SOAP bridge</b>
          <em className="crop-env crop-env-prod">prod</em>
          <time>3h 12m</time>
        </div>
        <span className="crop-kind">DNS resolution failed</span>
        <span className="crop-where">
          <MapPin size={12} /> <b>DNS:</b> record or resolver used by the monitor
        </span>
      </div>
      <div className="crop-attn crop-attn-warn">
        <div className="crop-attn-top">
          <i className="crop-dot crop-degraded" />
          <b>Search · Query</b>
          <em className="crop-env crop-env-prod">prod</em>
          <time>14m</time>
        </div>
        <span className="crop-kind">Elevated latency</span>
        <span className="crop-where">
          <MapPin size={12} /> <b>Service:</b> 1.08 s against an 800 ms budget
        </span>
      </div>
    </div>
  );
}

function PathCrop() {
  const hops = [
    [Activity, 'Monitor', 'ok'],
    [Globe, 'DNS', 'fail'],
    [Lock, 'Network · TLS', 'idle'],
    [Router, 'Gateway', 'idle'],
    [Server, 'Service', 'idle'],
  ];
  return (
    <div className="crop">
      <div className="crop-head">
        <span className="crop-eyebrow">Diagnosis</span>
      </div>
      <b className="crop-title">DNS resolution failed</b>
      <p className="crop-sub">The hostname could not be resolved, so no request was sent.</p>
      <ol className="crop-hops">
        {hops.map(([Icon, n, s], i) => (
          <li key={n} className={`ch ch-${s}`}>
            {i > 0 && <i className="ch-link" />}
            <span className="ch-node">
              <Icon size={14} />
              {s === 'ok' && (
                <em>
                  <Check size={8} strokeWidth={4} />
                </em>
              )}
              {s === 'fail' && (
                <em>
                  <X size={8} strokeWidth={4} />
                </em>
              )}
            </span>
            <small>{n}</small>
          </li>
        ))}
      </ol>
      <div className="crop-wherebox">
        <small>Where to look</small>
        <b>DNS record or the resolver used by the monitor</b>
        <code>ENOTFOUND legacy-gateway.corp.internal</code>
      </div>
    </div>
  );
}

function AccessCrop() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="crop crop-split">
      <div className="crop-roles">
        {[
          [Crown, 'Super Admin', '1 person'],
          [ShieldCheck, 'SRE / On-call', '4 people'],
          [ShieldCheck, 'Developer', '12 people'],
          [ShieldCheck, 'Viewer', '31 people'],
        ].map(([Icon, n, c], i) => (
          <div key={n} className={`crop-role ${i === 1 ? 'on' : ''}`}>
            <span>
              <Icon size={12} />
            </span>
            <div>
              <b>{n}</b>
              <small>{c}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="crop-perms">
        <span className="crop-eyebrow">SRE / On-call · Database</span>
        {[
          ['Browse records', 'Read tables in the data console', true],
          ['Edit records', 'Change values directly', on],
          ['Delete records', 'Permanently remove rows', false],
        ].map(([t, d, v]) => (
          <div key={t} className="crop-perm">
            <div>
              <b>{t}</b>
              <small>{d}</small>
            </div>
            <i className={`crop-sw ${v ? 'on' : ''}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ConsoleCrop({ kind }) {
  if (kind === 'map') return <HealthCrop />;
  if (kind === 'triage') return <TriageCrop />;
  if (kind === 'path') return <PathCrop />;
  return <AccessCrop />;
}
