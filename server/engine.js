// The check engine: runs HTTP health checks on schedule, records results,
// and opens / resolves incidents automatically.
import { EventEmitter } from 'node:events';
import { db, tx } from './db.js';
import { kindLabel } from './troubleshoot.js';

export const bus = new EventEmitter();
bus.setMaxListeners(500);

export const FAIL_THRESHOLD = 2; // consecutive failures before an incident opens
export const RECOVER_THRESHOLD = 2; // consecutive successes before it auto-resolves
const RETENTION_MS = 7 * 24 * 3600 * 1000;

function httpKind(status) {
  if (status >= 500) return 'http_5xx';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  return 'unexpected_status';
}

function networkKind(code = '', msg = '') {
  if (/ENOTFOUND|EAI_AGAIN|EAI_NONAME/.test(code)) return 'dns';
  if (/ECONNREFUSED/.test(code)) return 'refused';
  if (/ECONNRESET|UND_ERR_SOCKET|EPIPE/.test(code)) return 'reset';
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code + msg)) return 'tls';
  return 'network';
}

/** Perform one HTTP check. Never throws. */
export async function performCheck(m) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), m.timeout_ms);
  try {
    let url;
    try {
      url = new URL(m.url);
      if (!/^https?:$/.test(url.protocol)) throw new Error('bad scheme');
    } catch {
      return { ok: 0, status_code: null, latency_ms: 0, error_kind: 'invalid_url', message: `Cannot parse URL “${m.url}”` };
    }
    const res = await fetch(url, {
      method: m.method || 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Canopy-Monitor/1.0', accept: 'application/json, text/plain, */*' },
    });
    let body = '';
    if (m.expect_text && m.method !== 'HEAD') body = await res.text();
    else await res.body?.cancel().catch(() => {});
    const latency = Math.round(performance.now() - started);
    const expected = Number(m.expected_status) || 0;
    const statusOk = expected === 0 ? res.status >= 200 && res.status < 400 : res.status === expected;
    if (!statusOk) {
      return {
        ok: 0,
        status_code: res.status,
        latency_ms: latency,
        error_kind: httpKind(res.status),
        message: `HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''} (expected ${expected || '2xx/3xx'})`,
      };
    }
    if (m.expect_text && !body.includes(m.expect_text)) {
      return { ok: 0, status_code: res.status, latency_ms: latency, error_kind: 'body_mismatch', message: `Body did not contain “${m.expect_text}”` };
    }
    return { ok: 1, status_code: res.status, latency_ms: latency, error_kind: null, message: null };
  } catch (err) {
    if (ctrl.signal.aborted) {
      return { ok: 0, status_code: null, latency_ms: m.timeout_ms, error_kind: 'timeout', message: `No response within ${m.timeout_ms} ms` };
    }
    const code = err?.cause?.code || err?.code || '';
    const msg = err?.cause?.message || err?.message || 'Request failed';
    return {
      ok: 0,
      status_code: null,
      latency_ms: Math.round(performance.now() - started),
      error_kind: networkKind(code, msg),
      message: code ? `${code}: ${msg}` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

function severityFor(m, kind) {
  if (m.environment !== 'production') return 'minor';
  if (['dns', 'refused', 'timeout', 'http_5xx', 'tls', 'reset', 'network'].includes(kind)) return 'critical';
  return 'major';
}

export function statusFor(m, r) {
  if (!r.ok) return 'down';
  return r.latency_ms > m.degraded_ms ? 'degraded' : 'up';
}

/** Record a check result for monitor m (a fresh row) at time ts. */
export function applyResult(m, r, ts = Date.now(), { silent = false } = {}) {
  const events = [];
  const result = tx(() => {
    db.prepare('INSERT INTO checks (monitor_id, ts, ok, status_code, latency_ms, error_kind, message) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      m.id, ts, r.ok, r.status_code ?? null, r.latency_ms ?? null, r.error_kind ?? null, r.message ?? null,
    );
    const status = statusFor(m, r);
    const fails = r.ok ? 0 : m.consecutive_failures + 1;
    const succ = r.ok ? m.consecutive_successes + 1 : 0;
    db.prepare(
      `UPDATE monitors SET last_status=?, last_checked_at=?, last_latency_ms=?, last_status_code=?, last_error_kind=?, last_message=?,
       consecutive_failures=?, consecutive_successes=? WHERE id=?`,
    ).run(status, ts, r.latency_ms ?? null, r.status_code ?? null, r.error_kind ?? null, r.message ?? null, fails, succ, m.id);

    const active = db.prepare(`SELECT * FROM incidents WHERE monitor_id=? AND status != 'resolved' ORDER BY started_at DESC LIMIT 1`).get(m.id);

    if (!r.ok && fails >= FAIL_THRESHOLD && !active) {
      const sev = severityFor(m, r.error_kind);
      const startedAt = ts - (fails - 1) * m.interval_s * 1000;
      const info = db
        .prepare('INSERT INTO incidents (monitor_id, status, severity, title, error_kind, started_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(m.id, 'open', sev, `${m.name}: ${kindLabel(r.error_kind)}`, r.error_kind, startedAt);
      const id = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message) VALUES (?, ?, ?, ?)').run(
        id, ts, 'opened', `Opened after ${fails} consecutive failed checks. ${r.message || ''}`.trim(),
      );
      events.push({ type: 'incident', action: 'opened', id, monitor_id: m.id });
    } else if (!r.ok && active && active.error_kind !== r.error_kind) {
      db.prepare('UPDATE incidents SET error_kind=?, title=? WHERE id=?').run(r.error_kind, `${m.name}: ${kindLabel(r.error_kind)}`, active.id);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message) VALUES (?, ?, ?, ?)').run(
        active.id, ts, 'changed', `Failure changed to “${kindLabel(r.error_kind)}”. ${r.message || ''}`.trim(),
      );
      events.push({ type: 'incident', action: 'changed', id: active.id, monitor_id: m.id });
    } else if (r.ok && active && succ >= RECOVER_THRESHOLD) {
      db.prepare(`UPDATE incidents SET status='resolved', resolved_at=? WHERE id=?`).run(ts, active.id);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message) VALUES (?, ?, ?, ?)').run(
        active.id, ts, 'resolved', `Recovered automatically after ${succ} healthy checks (${r.latency_ms} ms).`,
      );
      events.push({ type: 'incident', action: 'resolved', id: active.id, monitor_id: m.id });
    }
    return { status, ...r };
  });
  if (!silent) {
    bus.emit('event', { type: 'check', monitor_id: m.id, status: result.status, latency_ms: r.latency_ms, ts });
    for (const e of events) bus.emit('event', e);
  }
  return result;
}

const inflight = new Set();

export async function runAndRecord(m) {
  if (inflight.has(m.id)) return null;
  inflight.add(m.id);
  try {
    const r = await performCheck(m);
    const fresh = db.prepare('SELECT * FROM monitors WHERE id=?').get(m.id);
    if (!fresh) return null;
    return applyResult(fresh, r, Date.now());
  } finally {
    inflight.delete(m.id);
  }
}

function tick() {
  const now = Date.now();
  const due = db
    .prepare('SELECT * FROM monitors WHERE enabled=1 AND (last_checked_at IS NULL OR last_checked_at + interval_s * 1000 <= ?) ORDER BY last_checked_at')
    .all(now);
  for (const m of due) {
    if (inflight.size >= 16) break;
    if (!inflight.has(m.id)) runAndRecord(m).catch((e) => console.error('check failed', m.id, e));
  }
}

function prune() {
  db.prepare('DELETE FROM checks WHERE ts < ?').run(Date.now() - RETENTION_MS);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

export function startEngine() {
  setInterval(tick, 2000);
  setInterval(prune, 10 * 60 * 1000);
  setTimeout(tick, 500);
}
