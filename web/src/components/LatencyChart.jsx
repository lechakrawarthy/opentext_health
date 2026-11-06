import { useEffect, useMemo, useRef, useState } from 'react';
import { ms } from '../lib/format.js';

function niceMax(v) {
  if (!v || v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Area chart of average latency with a faint max line and an optional threshold. */
export default function LatencyChart({ series, threshold, height = 200, label = 'Latency' }) {
  const wrap = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 46, r: 12, t: 14, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  const geo = useMemo(() => {
    const maxVal = Math.max(...series.map((p) => p.avg ?? 0), threshold ? threshold * 1.15 : 0);
    const top = niceMax(maxVal * 1.1);
    const x = (i) => pad.l + (series.length <= 1 ? 0 : (i / (series.length - 1)) * iw);
    const y = (v) => pad.t + ih - (Math.min(v, top) / top) * ih;
    // Build path segments that break over gaps.
    const segs = [];
    let cur = [];
    series.forEach((p, i) => {
      if (p.avg == null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push([x(i), y(p.avg)]);
    });
    if (cur.length) segs.push(cur);
    const line = segs.map((s) => 'M' + s.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L')).join('');
    const area = segs
      .map((s) => `M${s[0][0].toFixed(1)},${pad.t + ih}L` + s.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L') + `L${s[s.length - 1][0].toFixed(1)},${pad.t + ih}Z`)
      .join('');
    const ticks = [0, top / 2, top].map((v) => ({ v, y: y(v) }));
    const xt = [];
    const step = Math.max(1, Math.round(series.length / 4));
    for (let i = 0; i < series.length; i += step) xt.push({ i, x: x(i), t: series[i].t });
    return { line, area, ticks, xt, x, y, top };
  }, [series, threshold, iw, ih, pad.l, pad.t]);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - pad.l) / iw) * (series.length - 1));
    if (i >= 0 && i < series.length) setHover(i);
  };

  const hp = hover != null ? series[hover] : null;

  return (
    <div className="lchart" ref={wrap}>
      <svg width={w} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${label} over time`}>
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.ticks.map((t) => (
          <g key={t.v}>
            <line x1={pad.l} x2={w - pad.r} y1={t.y} y2={t.y} className="lc-grid" />
            <text x={pad.l - 8} y={t.y + 4} className="lc-axis" textAnchor="end">
              {t.v >= 1000 ? `${(t.v / 1000).toFixed(1)}s` : `${Math.round(t.v)}`}
            </text>
          </g>
        ))}
        {geo.xt.map((t) => (
          <text key={t.i} x={t.x} y={height - 6} className="lc-axis" textAnchor={t.i === 0 ? 'start' : 'middle'}>
            {new Date(t.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}
        {threshold && threshold < geo.top && (
          <g>
            <line x1={pad.l} x2={w - pad.r} y1={geo.y(threshold)} y2={geo.y(threshold)} className="lc-threshold" />
            <text x={w - pad.r} y={geo.y(threshold) - 6} className="lc-threshold-label" textAnchor="end">
              degraded · {ms(threshold)}
            </text>
          </g>
        )}
        <path d={geo.area} fill="url(#lc-fill)" />
        <path d={geo.line} className="lc-line" pathLength={1} />
        {hp && hp.avg != null && (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={pad.t} y2={pad.t + ih} className="lc-cursor" />
            <circle cx={geo.x(hover)} cy={geo.y(hp.avg)} r="4.5" className="lc-dot" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="lc-tip" style={{ left: Math.min(Math.max(geo.x(hover), 80), w - 80) }}>
          <b>{new Date(hp.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
          {hp.avg != null ? (
            <span>
              avg {ms(hp.avg)} · max {ms(hp.max)}
            </span>
          ) : (
            <span>no successful checks</span>
          )}
        </div>
      )}
    </div>
  );
}
