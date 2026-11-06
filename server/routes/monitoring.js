import express from 'express';
import { db, audit } from '../db.js';
import { requirePerm } from '../auth.js';
import { bus, runAndRecord, FAIL_THRESHOLD, RECOVER_THRESHOLD } from '../engine.js';
import { diagnose, kindLabel } from '../troubleshoot.js';
import { DAY, HOUR, bucketize, emptyBuckets, latencyPercentiles, latencySeries, monitorSummaries, effectiveStatus } from '../stats.js';

export const monitoring = express.Router();

/* ---------------------------------- overview --------------------------------- */

monitoring.get('/overview', requirePerm('monitors.view'), (req, res) => {
  const now = Date.now();
  const monitors = monitorSummaries();
  const enabled = monitors.filter((m) => m.enabled);
  const count = (s) => monitors.filter((m) => m.status === s).length;
  const totals = enabled.reduce((a, m) => ({ n: a.n + m.checks24, ok: a.ok + Math.round((m.uptime24 ?? 1) * m.checks24) }), { n: 0, ok: 0 });
  const pct = latencyPercentiles({ from: now - HOUR });
  const openIncidents = db.prepare(`SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved'`).get().n;
  const resolved24 = db.prepare(`SELECT COUNT(*) AS n FROM incidents WHERE status = 'resolved' AND resolved_at >= ?`).get(now - DAY).n;
  const mttr = db
    .prepare(`SELECT AVG(resolved_at - started_at) AS v FROM incidents WHERE status='resolved' AND resolved_at >= ?`)
    .get(now - 7 * DAY).v;

  const attention = monitors
    .filter((m) => m.enabled && (m.status === 'down' || m.status === 'degraded'))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'down' ? -1 : 1))
    .map((m) => {
      const kind = m.status === 'degraded' ? 'slow' : m.last_error_kind;
      const d = diagnose(kind);
      const since =
        m.incident?.started_at ??
        db.prepare('SELECT MAX(ts) AS t FROM checks WHERE monitor_id=? AND ok=1 AND latency_ms <= ?').get(m.id, m.degraded_ms).t;
      return {
        monitor_id: m.id,
        name: m.name,
        environment: m.environment,
        status: m.status,
        kind,
        label: d.label,
        where: d.where,
        hop: d.hops[d.hop]?.name,
        first_step: d.steps[0],
        message: m.status === 'degraded' ? `Responding in ${m.last_latency_ms} ms (threshold ${m.degraded_ms} ms)` : m.last_message,
        since,
        incident: m.incident,
      };
    });

  const incidents = db
    .prepare(
      `SELECT i.*, m.name AS monitor_name, m.environment FROM incidents i JOIN monitors m ON m.id=i.monitor_id
       ORDER BY CASE WHEN i.status='resolved' THEN 1 ELSE 0 END, i.started_at DESC LIMIT 6`,
    )
    .all();

  res.json({
    generated_at: now,
    kpis: {
      total: monitors.length,
      up: count('up'),
      degraded: count('degraded'),
      down: count('down'),
      paused: count('paused'),
      pending: count('pending'),
      uptime24: totals.n ? totals.ok / totals.n : null,
      checks24: totals.n,
      p50_1h: pct.p50,
      p95_1h: pct.p95,
      open_incidents: openIncidents,
      resolved24,
      mttr_ms: mttr == null ? null : Math.round(mttr),
    },
    monitors: monitors.map(slim),
    latency: latencySeries({ from: now - DAY, to: now, count: 72 }),
    attention,
    incidents,
  });
});

const slim = (m) => ({
  id: m.id,
  name: m.name,
  url: m.url,
  method: m.method,
  environment: m.environment,
  service_group: m.service_group,
  owner_team: m.owner_team,
  enabled: m.enabled,
  status: m.status,
  interval_s: m.interval_s,
  degraded_ms: m.degraded_ms,
  last_latency_ms: m.last_latency_ms,
  last_checked_at: m.last_checked_at,
  last_status_code: m.last_status_code,
  last_error_kind: m.last_error_kind,
  uptime24: m.uptime24,
  avg24: m.avg24,
  buckets: m.buckets,
  incident: m.incident,
});

/* ---------------------------------- monitors --------------------------------- */

monitoring.get('/monitors', requirePerm('monitors.view'), (req, res) => {
  res.json({ monitors: monitorSummaries().map(slim) });
});

monitoring.get('/monitors/:id', requirePerm('monitors.view'), (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT * FROM monitors WHERE id=?').get(id);
  if (!m) return res.status(404).json({ error: 'Monitor not found' });
  const now = Date.now();
  const from = now - DAY;
  const { map, size } = bucketize({ from, to: now, count: 72, monitorId: id });
  const rec = map.get(id);
  const week = db.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS f FROM checks WHERE monitor_id=? AND ts>=?').get(id, now - 7 * DAY);
  const checks = db.prepare('SELECT * FROM checks WHERE monitor_id=? ORDER BY ts DESC LIMIT 40').all(id);
  const incidents = db.prepare('SELECT * FROM incidents WHERE monitor_id=? ORDER BY started_at DESC LIMIT 15').all(id);
  const status = effectiveStatus(m);
  const kind = status === 'down' ? m.last_error_kind : status === 'degraded' ? 'slow' : null;
  const lastFailure = db.prepare('SELECT * FROM checks WHERE monitor_id=? AND ok=0 ORDER BY ts DESC LIMIT 1').get(id);
  const breakdown = db
    .prepare('SELECT error_kind AS kind, COUNT(*) AS n FROM checks WHERE monitor_id=? AND ok=0 AND ts>=? GROUP BY error_kind ORDER BY n DESC')
    .all(id, from)
    .map((r) => ({ ...r, label: kindLabel(r.kind) }));

  res.json({
    monitor: { ...m, status },
    stats: {
      uptime24: rec && rec.n ? (rec.n - rec.fails) / rec.n : null,
      uptime7d: week.n ? (week.n - week.f) / week.n : null,
      checks24: rec?.n || 0,
      failures24: rec?.fails || 0,
      ...latencyPercentiles({ from, monitorId: id }),
    },
    buckets: rec ? rec.buckets : emptyBuckets(from, size, 72),
    latency: latencySeries({ from, to: now, count: 72, monitorId: id }),
    checks,
    incidents,
    breakdown,
    diagnosis: kind ? diagnose(kind) : null,
    last_failure: lastFailure ? { ...lastFailure, label: kindLabel(lastFailure.error_kind) } : null,
    thresholds: { fail: FAIL_THRESHOLD, recover: RECOVER_THRESHOLD },
  });
});

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ENVIRONMENTS = ['production', 'staging', 'development'];

function validateMonitor(body, partial = false) {
  const out = {};
  const err = (msg) => {
    throw Object.assign(new Error(msg), { status: 400 });
  };
  const has = (k) => body[k] !== undefined;
  if (!partial || has('name')) {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 120) err('Name is required (max 120 characters).');
    out.name = name;
  }
  if (!partial || has('url')) {
    const url = String(body.url ?? '').trim();
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw 0;
    } catch {
      err('URL must be a valid http:// or https:// address.');
    }
    out.url = url;
  }
  if (has('method')) {
    const m = String(body.method).toUpperCase();
    if (!METHODS.includes(m)) err('Unsupported HTTP method.');
    out.method = m;
  }
  const int = (k, min, max, label) => {
    if (!has(k)) return;
    const v = Number(body[k]);
    if (!Number.isInteger(v) || v < min || v > max) err(`${label} must be a whole number between ${min} and ${max}.`);
    out[k] = v;
  };
  int('expected_status', 0, 599, 'Expected status');
  int('timeout_ms', 250, 60000, 'Timeout');
  int('interval_s', 10, 86400, 'Interval');
  int('degraded_ms', 50, 60000, 'Degraded threshold');
  if (has('environment')) {
    if (!ENVIRONMENTS.includes(body.environment)) err('Unknown environment.');
    out.environment = body.environment;
  }
  for (const k of ['service_group', 'owner_team', 'expect_text']) if (has(k)) out[k] = String(body[k]).trim().slice(0, 200);
  if (has('enabled')) out.enabled = body.enabled ? 1 : 0;
  return out;
}

monitoring.post('/monitors', requirePerm('monitors.create'), (req, res, next) => {
  try {
    const v = validateMonitor(req.body);
    const now = Date.now();
    const cols = Object.keys(v);
    const info = db
      .prepare(`INSERT INTO monitors (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`)
      .run(...cols.map((c) => v[c]), now, now);
    const id = Number(info.lastInsertRowid);
    audit(req.user.id, 'monitor.created', v.name, { url: v.url });
    bus.emit('event', { type: 'monitor', action: 'created', id });
    const m = db.prepare('SELECT * FROM monitors WHERE id=?').get(id);
    if (m.enabled) runAndRecord(m).catch(() => {});
    res.status(201).json({ monitor: m });
  } catch (e) {
    next(e);
  }
});

monitoring.put('/monitors/:id', requirePerm('monitors.edit'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = db.prepare('SELECT * FROM monitors WHERE id=?').get(id);
    if (!before) return res.status(404).json({ error: 'Monitor not found' });
    const v = validateMonitor(req.body, true);
    if (!Object.keys(v).length) return res.json({ monitor: before });
    if ('enabled' in v) v.last_status = v.enabled ? (before.enabled ? before.last_status : 'pending') : 'paused';
    const cols = Object.keys(v);
    db.prepare(`UPDATE monitors SET ${cols.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...cols.map((c) => v[c]), Date.now(), id);
    const changes = {};
    for (const c of cols) if (before[c] !== v[c] && c !== 'last_status') changes[c] = { from: before[c], to: v[c] };
    audit(req.user.id, 'enabled' in changes ? (v.enabled ? 'monitor.resumed' : 'monitor.paused') : 'monitor.updated', before.name, changes);
    bus.emit('event', { type: 'monitor', action: 'updated', id });
    const m = db.prepare('SELECT * FROM monitors WHERE id=?').get(id);
    if (m.enabled && (changes.url || changes.enabled)) runAndRecord(m).catch(() => {});
    res.json({ monitor: m });
  } catch (e) {
    next(e);
  }
});

monitoring.delete('/monitors/:id', requirePerm('monitors.delete'), (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT * FROM monitors WHERE id=?').get(id);
  if (!m) return res.status(404).json({ error: 'Monitor not found' });
  db.prepare('DELETE FROM monitors WHERE id=?').run(id);
  audit(req.user.id, 'monitor.deleted', m.name, { url: m.url });
  bus.emit('event', { type: 'monitor', action: 'deleted', id });
  res.status(204).end();
});

monitoring.post('/monitors/:id/run', requirePerm('monitors.run'), async (req, res) => {
  const m = db.prepare('SELECT * FROM monitors WHERE id=?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Monitor not found' });
  const result = await runAndRecord(m);
  if (!result) return res.status(409).json({ error: 'A check is already running for this monitor.' });
  res.json({ result: { ...result, label: result.error_kind ? kindLabel(result.error_kind) : null } });
});

/* --------------------------------- incidents --------------------------------- */

monitoring.get('/incidents', requirePerm('incidents.view'), (req, res) => {
  const status = req.query.status || 'active';
  const where = status === 'active' ? `WHERE i.status != 'resolved'` : status === 'resolved' ? `WHERE i.status = 'resolved'` : '';
  const rows = db
    .prepare(
      `SELECT i.*, m.name AS monitor_name, m.environment, m.service_group, m.owner_team,
         ua.name AS acknowledged_by_name, ur.name AS resolved_by_name
       FROM incidents i JOIN monitors m ON m.id = i.monitor_id
       LEFT JOIN users ua ON ua.id = i.acknowledged_by LEFT JOIN users ur ON ur.id = i.resolved_by
       ${where}
       ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, i.started_at DESC LIMIT 200`,
    )
    .all();
  const counts = db.prepare(`SELECT status, COUNT(*) AS n FROM incidents GROUP BY status`).all();
  res.json({ incidents: rows.map((r) => ({ ...r, label: kindLabel(r.error_kind) })), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

function incidentDetail(id) {
  const inc = db
    .prepare(
      `SELECT i.*, m.name AS monitor_name, m.url, m.environment, m.service_group, m.owner_team, m.last_status, m.enabled,
         ua.name AS acknowledged_by_name, ur.name AS resolved_by_name
       FROM incidents i JOIN monitors m ON m.id = i.monitor_id
       LEFT JOIN users ua ON ua.id = i.acknowledged_by LEFT JOIN users ur ON ur.id = i.resolved_by
       WHERE i.id = ?`,
    )
    .get(id);
  if (!inc) return null;
  const events = db
    .prepare('SELECT e.*, u.name AS user_name FROM incident_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.incident_id=? ORDER BY e.ts ASC')
    .all(id);
  const end = inc.resolved_at || Date.now();
  const all = db
    .prepare('SELECT ts, ok, status_code, latency_ms, error_kind FROM checks WHERE monitor_id=? AND ts BETWEEN ? AND ? ORDER BY ts')
    .all(inc.monitor_id, inc.started_at - 30 * 60 * 1000, end + 10 * 60 * 1000);
  // Downsample long windows to ~140 bars, keeping failures visible in each slice.
  const MAX = 140;
  let window = all;
  if (all.length > MAX) {
    const step = all.length / MAX;
    window = Array.from({ length: MAX }, (_, i) => {
      const slice = all.slice(Math.floor(i * step), Math.floor((i + 1) * step));
      return slice.find((c) => !c.ok) || slice[slice.length - 1];
    });
  }
  const failedChecks = db.prepare('SELECT COUNT(*) AS n FROM checks WHERE monitor_id=? AND ok=0 AND ts BETWEEN ? AND ?').get(inc.monitor_id, inc.started_at, end).n;
  return { incident: { ...inc, label: kindLabel(inc.error_kind), failed_checks: failedChecks }, events, window, diagnosis: diagnose(inc.error_kind) };
}

monitoring.get('/incidents/:id', requirePerm('incidents.view'), (req, res) => {
  const d = incidentDetail(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Incident not found' });
  res.json(d);
});

function incidentAction(action) {
  return (req, res) => {
    const id = Number(req.params.id);
    const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(id);
    if (!inc) return res.status(404).json({ error: 'Incident not found' });
    const now = Date.now();
    const note = String(req.body?.note || '').trim().slice(0, 2000);
    if (action === 'ack') {
      if (inc.status !== 'open') return res.status(409).json({ error: 'Only open incidents can be acknowledged.' });
      db.prepare(`UPDATE incidents SET status='acknowledged', acknowledged_at=?, acknowledged_by=? WHERE id=?`).run(now, req.user.id, id);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message, user_id) VALUES (?, ?, ?, ?, ?)').run(id, now, 'acknowledged', note || 'Acknowledged.', req.user.id);
    } else if (action === 'resolve') {
      if (inc.status === 'resolved') return res.status(409).json({ error: 'Incident is already resolved.' });
      db.prepare(`UPDATE incidents SET status='resolved', resolved_at=?, resolved_by=? WHERE id=?`).run(now, req.user.id, id);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message, user_id) VALUES (?, ?, ?, ?, ?)').run(id, now, 'resolved', note || 'Marked as resolved.', req.user.id);
    } else if (action === 'reopen') {
      if (inc.status !== 'resolved') return res.status(409).json({ error: 'Incident is not resolved.' });
      db.prepare(`UPDATE incidents SET status='open', resolved_at=NULL, resolved_by=NULL WHERE id=?`).run(id);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message, user_id) VALUES (?, ?, ?, ?, ?)').run(id, now, 'reopened', note || 'Reopened.', req.user.id);
    } else if (action === 'note') {
      if (!note) return res.status(400).json({ error: 'Write a note first.' });
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message, user_id) VALUES (?, ?, ?, ?, ?)').run(id, now, 'note', note, req.user.id);
    }
    audit(req.user.id, `incident.${action}`, `#${id} ${inc.title}`, note ? { note } : '');
    bus.emit('event', { type: 'incident', action, id, monitor_id: inc.monitor_id });
    res.json(incidentDetail(id));
  };
}

monitoring.post('/incidents/:id/ack', requirePerm('incidents.manage'), incidentAction('ack'));
monitoring.post('/incidents/:id/resolve', requirePerm('incidents.manage'), incidentAction('resolve'));
monitoring.post('/incidents/:id/reopen', requirePerm('incidents.manage'), incidentAction('reopen'));
monitoring.post('/incidents/:id/note', requirePerm('incidents.manage'), incidentAction('note'));
