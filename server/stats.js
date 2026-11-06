import { db } from './db.js';

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function effectiveStatus(m) {
  return m.enabled ? m.last_status : 'paused';
}

function bucketState(n, fails, slow) {
  if (!n) return 'none';
  if (fails / n >= 0.5) return 'down';
  if (fails > 0) return 'partial';
  if (slow / n >= 0.5) return 'degraded';
  return 'up';
}

/** Per-monitor bucketed health over [from, to). Returns Map(monitorId -> { buckets, n, fails, avg }). */
export function bucketize({ from, to, count, monitorId = null }) {
  const size = Math.ceil((to - from) / count);
  const rows = db
    .prepare(
      `SELECT c.monitor_id AS mid, CAST((c.ts - ?) / ? AS INTEGER) AS b, COUNT(*) AS n,
         SUM(CASE WHEN c.ok = 0 THEN 1 ELSE 0 END) AS fails,
         SUM(CASE WHEN c.ok = 1 AND c.latency_ms > m.degraded_ms THEN 1 ELSE 0 END) AS slow,
         AVG(CASE WHEN c.ok = 1 THEN c.latency_ms END) AS avg,
         MAX(CASE WHEN c.ok = 1 THEN c.latency_ms END) AS max
       FROM checks c JOIN monitors m ON m.id = c.monitor_id
       WHERE c.ts >= ? AND c.ts < ? ${monitorId ? 'AND c.monitor_id = ?' : ''}
       GROUP BY mid, b`,
    )
    .all(...[from, size, from, to, ...(monitorId ? [monitorId] : [])]);

  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.mid)) {
      out.set(r.mid, {
        buckets: Array.from({ length: count }, (_, i) => ({ t: from + i * size, s: 'none', n: 0, fails: 0, avg: null, max: null })),
        n: 0,
        fails: 0,
        latSum: 0,
        latN: 0,
      });
    }
    const rec = out.get(r.mid);
    const b = rec.buckets[r.b];
    if (!b) continue;
    Object.assign(b, { s: bucketState(r.n, r.fails, r.slow), n: r.n, fails: r.fails, avg: r.avg == null ? null : Math.round(r.avg), max: r.max });
    rec.n += r.n;
    rec.fails += r.fails;
    if (r.avg != null) {
      rec.latSum += r.avg * (r.n - r.fails);
      rec.latN += r.n - r.fails;
    }
  }
  return { map: out, size };
}

export function emptyBuckets(from, size, count) {
  return Array.from({ length: count }, (_, i) => ({ t: from + i * size, s: 'none', n: 0, fails: 0, avg: null, max: null }));
}

export function monitorSummaries({ count = 48 } = {}) {
  const now = Date.now();
  const from = now - DAY;
  const monitors = db.prepare('SELECT * FROM monitors ORDER BY service_group, name').all();
  const { map, size } = bucketize({ from, to: now, count });
  const activeInc = new Map(
    db.prepare(`SELECT id, monitor_id, status, severity, started_at FROM incidents WHERE status != 'resolved'`).all().map((i) => [i.monitor_id, i]),
  );
  return monitors.map((m) => {
    const rec = map.get(m.id);
    return {
      ...m,
      status: effectiveStatus(m),
      uptime24: rec && rec.n ? (rec.n - rec.fails) / rec.n : null,
      avg24: rec && rec.latN ? Math.round(rec.latSum / rec.latN) : null,
      checks24: rec?.n || 0,
      buckets: rec ? rec.buckets.map((b) => b.s) : emptyBuckets(from, size, count).map((b) => b.s),
      incident: activeInc.get(m.id) || null,
    };
  });
}

export function latencySeries({ from, to, count, monitorId = null }) {
  const size = Math.ceil((to - from) / count);
  const rows = db
    .prepare(
      `SELECT CAST((ts - ?) / ? AS INTEGER) AS b, AVG(latency_ms) AS avg, MAX(latency_ms) AS max, COUNT(*) AS n
       FROM checks WHERE ok = 1 AND ts >= ? AND ts < ? ${monitorId ? 'AND monitor_id = ?' : ''} GROUP BY b`,
    )
    .all(...[from, size, from, to, ...(monitorId ? [monitorId] : [])]);
  const series = Array.from({ length: count }, (_, i) => ({ t: from + i * size, avg: null, max: null }));
  for (const r of rows) if (series[r.b]) Object.assign(series[r.b], { avg: Math.round(r.avg), max: r.max });
  return series;
}

export function latencyPercentiles({ from, monitorId = null }) {
  const rows = db
    .prepare(`SELECT latency_ms AS l FROM checks WHERE ok = 1 AND ts >= ? ${monitorId ? 'AND monitor_id = ?' : ''} ORDER BY latency_ms`)
    .all(...[from, ...(monitorId ? [monitorId] : [])]);
  const arr = rows.map((r) => r.l);
  return { p50: percentile(arr, 50), p95: percentile(arr, 95), p99: percentile(arr, 99), n: arr.length };
}
