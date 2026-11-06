import { useEffect, useMemo, useRef } from 'react';
import { clamp } from '../../lib/motion.js';

/*
  Scroll-drawn latency chart for the deep section.
  Four services draw across the last 60 minutes as the section scrolls. Search climbs
  through its budget, Reporting drops out (an incident) and comes back. Each line's
  live value and head dot follow the drawing edge.
  `progress` (0 → 1) is written by the parent on every scroll frame through `api.set()`.
*/

const VW = 640;
const VH = 420;
const PAD = { l: 44, r: 20, t: 20, b: 34 };
const N = 61;
const MAX = 1400;
const BUDGET = 800;
const OUT_FROM = 36;
const OUT_TO = 43;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function buildSeries() {
  const r1 = rng(11);
  const r2 = rng(23);
  const r3 = rng(37);
  const r4 = rng(51);
  return [
    { key: 'id', name: 'Identity', color: '#b9e769', values: Array.from({ length: N }, () => 44 + r1() * 22) },
    { key: 'doc', name: 'Documents', color: '#9fdcc5', values: Array.from({ length: N }, (_, i) => 140 + Math.sin(i / 5) * 40 + r2() * 30) },
    {
      key: 'srch',
      name: 'Search',
      color: '#f3cf72',
      values: Array.from({ length: N }, (_, i) => 420 + Math.max(0, Math.sin((i - 14) / 9)) * 620 + r3() * 70),
    },
    {
      key: 'rep',
      name: 'Reporting',
      color: '#e9f2ec',
      values: Array.from({ length: N }, (_, i) => (i >= OUT_FROM && i <= OUT_TO ? null : 230 + r4() * 60 + (i > OUT_TO && i < OUT_TO + 4 ? 180 : 0))),
    },
  ];
}

const x = (i) => PAD.l + (i / (N - 1)) * (VW - PAD.l - PAD.r);
const y = (v) => PAD.t + (VH - PAD.t - PAD.b) * (1 - Math.min(v, MAX) / MAX);

function pathFor(values) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export default function LatencyStory({ api }) {
  const series = useMemo(buildSeries, []);
  const clipRect = useRef(null);
  const heads = useRef([]);
  const vals = useRef([]);
  const incident = useRef(null);
  const recovered = useRef(null);
  const cursor = useRef(null);
  const clock = useRef(null);

  useEffect(() => {
    api.current = {
      set(p) {
        const t = clamp((p - 0.04) / 0.82);
        const fx = PAD.l + t * (VW - PAD.l - PAD.r);
        const idx = Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))));
        clipRect.current?.setAttribute('width', String(Math.max(0, fx - PAD.l + 1)));
        cursor.current?.setAttribute('transform', `translate(${fx} 0)`);
        if (cursor.current) cursor.current.style.opacity = t > 0.005 && t < 0.995 ? '1' : '0';
        series.forEach((s, si) => {
          const v = s.values[idx];
          const h = heads.current[si];
          const label = vals.current[si];
          if (h) {
            if (v == null || t <= 0.005) h.style.opacity = '0';
            else {
              h.style.opacity = '1';
              h.setAttribute('cx', x(idx));
              h.setAttribute('cy', y(v));
            }
          }
          if (label) {
            label.textContent = v == null ? (t > 0 ? 'HTTP 500' : '—') : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
            label.dataset.state = v == null ? 'fail' : s.key === 'srch' && v > BUDGET ? 'warn' : 'ok';
          }
        });
        const inOut = t >= OUT_FROM / (N - 1);
        incident.current?.classList.toggle('on', inOut);
        recovered.current?.classList.toggle('on', t >= (OUT_TO + 2) / (N - 1));
        if (clock.current) {
          const mins = Math.round(60 - t * 60);
          clock.current.textContent = mins <= 0 ? 'now' : `−${mins} min`;
        }
      },
    };
  }, [api, series]);

  const ticks = [0, 400, 800, 1200];

  return (
    <div className="ls">
      <div className="ls-head">
        <div>
          <span className="ls-eyebrow">Latency · last 60 minutes</span>
          <span className="ls-clock" ref={clock}>
            −60 min
          </span>
        </div>
        <ul className="ls-legend">
          {series.map((s, i) => (
            <li key={s.key}>
              <i style={{ background: s.color }} />
              <span>{s.name}</span>
              <b ref={(el) => (vals.current[i] = el)} data-state="ok">
                —
              </b>
            </li>
          ))}
        </ul>
      </div>

      <svg className="ls-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <clipPath id="ls-clip">
            <rect ref={clipRect} x={PAD.l} y="0" width="0" height={VH} />
          </clipPath>
          <linearGradient id="ls-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,138,126,0.22)" />
            <stop offset="100%" stopColor="rgba(255,138,126,0.02)" />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={VW - PAD.r} y1={y(v)} y2={y(v)} className="ls-grid" />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" className="ls-axis">
              {v === 0 ? '0' : v >= 1000 ? `${v / 1000}s` : v}
            </text>
          </g>
        ))}
        {[0, 15, 30, 45, 60].map((m) => (
          <text key={m} x={x((m / 60) * (N - 1))} y={VH - 10} textAnchor="middle" className="ls-axis">
            {m === 60 ? 'now' : `−${60 - m}m`}
          </text>
        ))}

        <line x1={PAD.l} x2={VW - PAD.r} y1={y(BUDGET)} y2={y(BUDGET)} className="ls-budget" />
        <text x={VW - PAD.r} y={y(BUDGET) - 8} textAnchor="end" className="ls-budget-label">
          latency budget · 800 ms
        </text>

        <g clipPath="url(#ls-clip)">
          <rect x={x(OUT_FROM)} y={PAD.t} width={x(OUT_TO) - x(OUT_FROM)} height={VH - PAD.t - PAD.b} fill="url(#ls-out)" />
          <line x1={x(OUT_FROM)} x2={x(OUT_FROM)} y1={PAD.t} y2={VH - PAD.b} className="ls-out-edge" />
          {series.map((s) => (
            <path key={s.key} d={pathFor(s.values)} stroke={s.color} className={`ls-line ls-${s.key}`} />
          ))}
        </g>

        <g ref={cursor} className="ls-cursor">
          <line x1="0" x2="0" y1={PAD.t} y2={VH - PAD.b} />
        </g>
        {series.map((s, i) => (
          <circle key={s.key} ref={(el) => (heads.current[i] = el)} r="4.5" className="ls-head" style={{ stroke: s.color }} />
        ))}
      </svg>

      <div className="ls-events">
        <div className="ls-event ls-event-fail" ref={incident}>
          <i />
          <div>
            <b>Incident opened · Reporting</b>
            <span>HTTP 500 on two consecutive checks. Where to look: Service hop.</span>
          </div>
        </div>
        <div className="ls-event ls-event-ok" ref={recovered}>
          <i />
          <div>
            <b>Recovered · 7 min</b>
            <span>Two healthy checks in a row, so the incident closed itself.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
