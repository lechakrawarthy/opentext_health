// Seeds roles, people and demo monitors with 24h of realistic history on first start.
import { db, tx, audit } from './db.js';
import { PERMISSIONS, DEFAULT_ROLES } from './permissions.js';
import { hashPassword } from './auth.js';
import { PROFILES } from './mock.js';
import { applyResult } from './engine.js';

export const DEMO_PASSWORD = 'canopy123';

function syncPermissions() {
  const up = db.prepare(
    `INSERT INTO permissions (key, label, category, description, sort) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET label=excluded.label, category=excluded.category, description=excluded.description, sort=excluded.sort`,
  );
  PERMISSIONS.forEach((p, i) => up.run(p.key, p.label, p.category, p.description, i));
}

const H = 3600 * 1000;

export function seedIfEmpty(port) {
  syncPermissions();
  if (db.prepare('SELECT COUNT(*) AS n FROM roles').get().n > 0) return false;

  const now = Date.now();
  const base = `http://127.0.0.1:${port}/mock`;
  console.log('Seeding demo workspace…');

  tx(() => {
    const roleIds = {};
    for (const r of DEFAULT_ROLES) {
      const info = db.prepare('INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?)').run(
        r.key, r.name, r.description, r.is_system || 0, now,
      );
      roleIds[r.key] = Number(info.lastInsertRowid);
      const rp = db.prepare('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      for (const k of r.permissions) rp.run(roleIds[r.key], k);
    }

    const hash = hashPassword(DEMO_PASSWORD);
    // The first account of each role is the one listed on the login page.
    const people = [
      ['superadmin@canopy.dev', 'Lokesh Kumar', 'super_admin'],
      ['admin@canopy.dev', 'Nagasatish Reddy', 'admin'],
      ['sre@canopy.dev', 'Bala Subramanian', 'sre'],
      ['lakshmi@canopy.dev', 'Lakshmi Narayanan', 'sre'],
      ['dev@canopy.dev', 'Vineela Rao', 'developer'],
      ['anudra@canopy.dev', 'Anudra Menon', 'developer'],
      ['viewer@canopy.dev', 'Sudha Iyer', 'viewer'],
      ['contractor@canopy.dev', 'Kiran Varma', 'viewer', 'disabled'],
    ];
    const userIds = {};
    for (const [email, name, role, status = 'active'] of people) {
      const info = db
        .prepare('INSERT INTO users (email, name, password_hash, role_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(email, name, hash, roleIds[role], status, now - 30 * 24 * H);
      userIds[role] ??= Number(info.lastInsertRowid);
    }

    const monitors = [
      { name: 'Identity · Token issuance', path: 'identity/token', profile: 'fast', env: 'production', group: 'Identity', team: 'Platform Identity', interval: 30, degraded: 500 },
      { name: 'Documents · Upload API', path: 'documents/upload', profile: 'healthy', env: 'production', group: 'Content', team: 'Content Services' },
      { name: 'Search · Query', path: 'search/query', profile: 'slow', env: 'production', group: 'Search', team: 'Search & Discovery', degraded: 800 },
      { name: 'Payments · Webhook receiver', path: 'payments/webhook', profile: 'flaky', env: 'production', group: 'Billing', team: 'Billing' },
      { name: 'Notifications · Send', path: 'notifications/send', profile: 'healthy', env: 'production', group: 'Messaging', team: 'Messaging' },
      { name: 'Reporting · Export', path: 'reporting/export', profile: 'cyclic_outage', env: 'production', group: 'Analytics', team: 'Data Platform', interval: 30 },
      { name: 'Archive · Retrieve', path: 'archive/retrieve', profile: 'expired_auth', env: 'staging', group: 'Content', team: 'Content Services', failingSince: 5 * H },
      { name: 'Workflow · Task queue', path: 'workflow/tasks', profile: 'timeouts', env: 'production', group: 'Workflow', team: 'Process Automation', timeout: 3000 },
      { name: 'Profile · Me', path: 'profile/me', profile: 'healthy', env: 'staging', group: 'Identity', team: 'Platform Identity' },
      { name: 'Audit · Event stream', path: 'audit/stream', profile: 'fast', env: 'production', group: 'Security', team: 'Security Engineering', degraded: 400 },
      { name: 'Legacy gateway · SOAP bridge', url: 'http://legacy-gateway.corp.invalid/health', profile: 'dns', env: 'production', group: 'Integration', team: 'Integration', failingSince: 3 * H, timeout: 4000 },
      { name: 'Billing · Sandbox', url: 'http://127.0.0.1:59999/health', profile: 'healthy', env: 'staging', group: 'Billing', team: 'Billing', enabled: 0 },
    ];

    const insert = db.prepare(
      `INSERT INTO monitors (name, url, method, expected_status, timeout_ms, interval_s, degraded_ms, environment, service_group, owner_team, enabled, created_at, updated_at, last_status)
       VALUES (?, ?, 'GET', 200, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const STEP = 2 * 60 * 1000;
    for (const m of monitors) {
      const enabled = m.enabled ?? 1;
      const info = insert.run(
        m.name, m.url || `${base}/${m.path}`, m.timeout || 5000, m.interval || 60, m.degraded || 1000,
        m.env, m.group, m.team, enabled, now - 14 * 24 * H, now - 2 * 24 * H, enabled ? 'pending' : 'paused',
      );
      const id = Number(info.lastInsertRowid);
      const span = enabled ? 24 * H : 6 * H;
      const end = enabled ? now : now - 18 * H;
      for (let t = end - span; t < end; t += STEP) {
        const row = db.prepare('SELECT * FROM monitors WHERE id=?').get(id);
        applyResult(row, synth(m, t, now), t, { silent: true });
      }
      if (!enabled) db.prepare(`UPDATE monitors SET last_status='paused' WHERE id=?`).run(id);
    }

    // Mark the ongoing DNS outage as acknowledged by on-call, with a note.
    const dns = db.prepare(`SELECT i.id FROM incidents i JOIN monitors m ON m.id=i.monitor_id WHERE m.name LIKE 'Legacy gateway%' AND i.status='open'`).get();
    if (dns) {
      const ackAt = now - 2.6 * H;
      db.prepare(`UPDATE incidents SET status='acknowledged', acknowledged_at=?, acknowledged_by=?, notes=? WHERE id=?`).run(
        ackAt, userIds.sre, 'DNS record for legacy-gateway was removed during the zone migration. Infra ticket raised to restore it.', dns.id,
      );
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message, user_id) VALUES (?, ?, ?, ?, ?)').run(dns.id, ackAt, 'acknowledged', 'Acknowledged. Looking into it.', userIds.sre);
      db.prepare('INSERT INTO incident_events (incident_id, ts, kind, message, user_id) VALUES (?, ?, ?, ?, ?)').run(
        dns.id, ackAt + 0.3 * H, 'note', 'Record missing from the new internal zone. Infra ticket raised to restore it.', userIds.sre,
      );
    }

    audit(userIds.super_admin, 'workspace.created', 'Canopy', 'Demo workspace seeded');
    audit(userIds.super_admin, 'role.updated', 'SRE / On-call', { added: ['data.write'] });
    audit(userIds.admin, 'user.role_changed', 'dev@canopy.dev', { from: 'Viewer', to: 'Developer' });
    audit(userIds.admin, 'user.disabled', 'contractor@canopy.dev', 'Contract ended');
  });

  console.log('Seed complete. Demo password for all accounts:', DEMO_PASSWORD);
  return true;
}

function synth(m, t, now) {
  const failing = m.failingSince && t >= now - m.failingSince;
  if (failing && m.profile === 'dns') {
    return { ok: 0, status_code: null, latency_ms: 12, error_kind: 'dns', message: 'ENOTFOUND: getaddrinfo ENOTFOUND legacy-gateway.corp.invalid' };
  }
  const profile = m.profile === 'dns' || (m.profile === 'expired_auth' && !failing) ? PROFILES.healthy : PROFILES[m.profile];
  const r = profile(t);
  const timeout = m.timeout || 5000;
  if (r.hang) return { ok: 0, status_code: null, latency_ms: timeout, error_kind: 'timeout', message: `No response within ${timeout} ms` };
  if (r.status === 200) return { ok: 1, status_code: 200, latency_ms: r.latency };
  const kind = r.status >= 500 ? 'http_5xx' : r.status === 401 ? 'auth' : 'unexpected_status';
  return { ok: 0, status_code: r.status, latency_ms: r.latency, error_kind: kind, message: `HTTP ${r.status} (expected 200)` };
}
