// Data console: permission-gated, allow-listed access to database tables with inline editing.
import express from 'express';
import { db, audit } from '../db.js';
import { requirePerm } from '../auth.js';
import { bus } from '../engine.js';

export const data = express.Router();

const TABLES = {
  monitors: {
    label: 'Monitors',
    description: 'Endpoints under watch and their configuration.',
    editable: ['name', 'url', 'method', 'expected_status', 'expect_text', 'timeout_ms', 'interval_s', 'degraded_ms', 'environment', 'service_group', 'owner_team', 'enabled'],
    deletable: true,
    search: ['name', 'url', 'environment', 'service_group', 'owner_team'],
    order: 'id ASC',
    hidden: [],
  },
  incidents: {
    label: 'Incidents',
    description: 'Every outage the engine has opened, with ownership.',
    editable: ['status', 'severity', 'title', 'notes'],
    deletable: true,
    search: ['title', 'status', 'severity', 'error_kind'],
    order: 'started_at DESC',
    hidden: [],
  },
  incident_events: {
    label: 'Incident timeline',
    description: 'Notes, acknowledgements and state changes.',
    editable: ['message'],
    deletable: true,
    search: ['kind', 'message'],
    order: 'ts DESC',
    hidden: [],
  },
  checks: {
    label: 'Check results',
    description: 'Raw results from every health check (kept 7 days).',
    editable: [],
    deletable: true,
    search: ['error_kind', 'message'],
    order: 'ts DESC',
    hidden: [],
  },
  audit_log: {
    label: 'Audit log',
    description: 'Immutable record of changes. Read-only.',
    editable: [],
    deletable: false,
    search: ['action', 'target', 'detail'],
    order: 'ts DESC',
    hidden: [],
  },
};

const ENUMS = {
  'monitors.method': ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  'monitors.environment': ['production', 'staging', 'development'],
  'monitors.enabled': [0, 1],
  'incidents.status': ['open', 'acknowledged', 'resolved'],
  'incidents.severity': ['critical', 'major', 'minor'],
};

function columns(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => ({ name: c.name, type: (c.type || 'TEXT').toUpperCase(), pk: !!c.pk, notnull: !!c.notnull }));
}

function tableOr404(req, res) {
  const cfg = TABLES[req.params.table];
  if (!cfg) {
    res.status(404).json({ error: 'Unknown table' });
    return null;
  }
  return cfg;
}

data.get('/tables', requirePerm('data.read'), (req, res) => {
  res.json({
    tables: Object.entries(TABLES).map(([name, t]) => ({
      name,
      label: t.label,
      description: t.description,
      rows: db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n,
      editable: t.editable.length > 0,
      deletable: t.deletable,
    })),
  });
});

data.get('/:table', requirePerm('data.read'), (req, res) => {
  const cfg = tableOr404(req, res);
  if (!cfg) return;
  const table = req.params.table;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const q = String(req.query.q || '').trim();
  const where = q ? `WHERE ${cfg.search.map((c) => `CAST(${c} AS TEXT) LIKE ?`).join(' OR ')}` : '';
  const params = q ? cfg.search.map(() => `%${q}%`) : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${cfg.order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const cols = columns(table).map((c) => ({
    ...c,
    editable: cfg.editable.includes(c.name),
    options: ENUMS[`${table}.${c.name}`] || null,
  }));
  res.json({ table, label: cfg.label, columns: cols, rows, total, limit, offset, deletable: cfg.deletable });
});

data.patch('/:table/:id', requirePerm('data.write'), (req, res) => {
  const cfg = tableOr404(req, res);
  if (!cfg) return;
  const table = req.params.table;
  const id = Number(req.params.id);
  const before = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
  if (!before) return res.status(404).json({ error: 'Row not found' });
  const cols = columns(table);
  const updates = {};
  for (const [k, raw] of Object.entries(req.body || {})) {
    if (!cfg.editable.includes(k)) return res.status(400).json({ error: `Column “${k}” is not editable.` });
    const col = cols.find((c) => c.name === k);
    let v = raw;
    if (col.type.includes('INT')) {
      if (raw === '' || raw === null) {
        if (col.notnull) return res.status(400).json({ error: `“${k}” cannot be empty.` });
        v = null;
      } else {
        v = Number(raw);
        if (!Number.isFinite(v) || !Number.isInteger(v)) return res.status(400).json({ error: `“${k}” must be a whole number.` });
      }
    } else {
      v = raw === null ? null : String(raw);
      if (col.notnull && v === null) return res.status(400).json({ error: `“${k}” cannot be empty.` });
    }
    const opts = ENUMS[`${table}.${k}`];
    if (opts && !opts.includes(v)) return res.status(400).json({ error: `“${k}” must be one of: ${opts.join(', ')}.` });
    if (table === 'monitors' && k === 'url') {
      try {
        if (!/^https?:$/.test(new URL(v).protocol)) throw 0;
      } catch {
        return res.status(400).json({ error: 'URL must be a valid http(s) address.' });
      }
    }
    updates[k] = v;
  }
  const keys = Object.keys(updates);
  if (!keys.length) return res.json({ row: before });
  const extra = table === 'monitors' ? ', updated_at = ' + Date.now() : '';
  if (table === 'monitors' && 'enabled' in updates) {
    updates.last_status = updates.enabled ? 'pending' : 'paused';
    keys.push('last_status');
  }
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(', ')}${extra} WHERE id=?`).run(...keys.map((k) => updates[k]), id);
  const changes = Object.fromEntries(keys.filter((k) => k !== 'last_status').map((k) => [k, { from: before[k], to: updates[k] }]));
  audit(req.user.id, 'data.updated', `${table}#${id}`, changes);
  bus.emit('event', { type: 'data', table, id });
  res.json({ row: db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) });
});

data.delete('/:table/:id', requirePerm('data.delete'), (req, res) => {
  const cfg = tableOr404(req, res);
  if (!cfg) return;
  if (!cfg.deletable) return res.status(400).json({ error: `${cfg.label} is read-only.` });
  const table = req.params.table;
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
  if (!row) return res.status(404).json({ error: 'Row not found' });
  db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  audit(req.user.id, 'data.deleted', `${table}#${id}`, row.name || row.title || row.message || '');
  bus.emit('event', { type: 'data', table, id });
  res.status(204).end();
});
