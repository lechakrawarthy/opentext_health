import express from 'express';
import { db, tx, audit } from '../db.js';
import { requirePerm, hashPassword, generatePassword, isSuperAdmin, publicUser } from '../auth.js';
import { PERMISSIONS, ALL_KEYS, SUPER_ADMIN } from '../permissions.js';

export const access = express.Router();

const fail = (status, msg) => Object.assign(new Error(msg), { status });

const USER_SELECT = `SELECT u.*, r.key AS role_key, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id`;
const getUser = (id) => db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id);
const getRole = (id) => db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
const activeSuperAdmins = () =>
  db.prepare(`SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.key=? AND u.status='active'`).get(SUPER_ADMIN).n;

const requireAny = (...keys) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (!keys.some((k) => req.perms.has(k))) return res.status(403).json({ error: 'You don’t have permission to view this.' });
  next();
};

/* ----------------------------------- people ---------------------------------- */

access.get('/users', requirePerm('users.view'), (req, res) => {
  const users = db.prepare(`${USER_SELECT} ORDER BY CASE r.key WHEN '${SUPER_ADMIN}' THEN 0 ELSE 1 END, u.name`).all();
  res.json({ users: users.map(publicUser) });
});

function assertCanAssign(req, role) {
  if (!role) throw fail(400, 'Choose a valid role.');
  if (role.key === SUPER_ADMIN && !isSuperAdmin(req)) throw fail(403, 'Only a super admin can grant the Super Admin role.');
}

access.post('/users', requirePerm('users.manage'), (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!name) throw fail(400, 'Name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw fail(409, 'Someone with this email already has access.');
    const role = getRole(Number(req.body.role_id));
    assertCanAssign(req, role);
    const password = req.body.password ? String(req.body.password) : generatePassword();
    if (password.length < 8) throw fail(400, 'Password must be at least 8 characters.');
    const info = db
      .prepare('INSERT INTO users (email, name, password_hash, role_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(email, name, hashPassword(password), role.id, 'active', Date.now());
    audit(req.user.id, 'user.created', email, { role: role.name });
    res.status(201).json({ user: publicUser(getUser(Number(info.lastInsertRowid))), temporary_password: password });
  } catch (e) {
    next(e);
  }
});

function assertCanTouch(req, target) {
  if (!target) throw fail(404, 'Person not found.');
  if (target.role_key === SUPER_ADMIN && !isSuperAdmin(req)) throw fail(403, 'Only a super admin can change another super admin.');
}

access.patch('/users/:id', requirePerm('users.manage'), (req, res, next) => {
  try {
    const target = getUser(Number(req.params.id));
    assertCanTouch(req, target);
    const self = target.id === req.user.id;
    const updates = {};
    const detail = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw fail(400, 'Name cannot be empty.');
      updates.name = name;
    }
    if (req.body.role_id !== undefined && Number(req.body.role_id) !== target.role_id) {
      if (self) throw fail(400, 'You can’t change your own role.');
      const role = getRole(Number(req.body.role_id));
      assertCanAssign(req, role);
      if (target.role_key === SUPER_ADMIN && target.status === 'active' && activeSuperAdmins() <= 1) throw fail(400, 'The workspace needs at least one active super admin.');
      updates.role_id = role.id;
      detail.role = { from: target.role_name, to: role.name };
    }
    if (req.body.status !== undefined && req.body.status !== target.status) {
      if (!['active', 'disabled'].includes(req.body.status)) throw fail(400, 'Unknown status.');
      if (self) throw fail(400, 'You can’t disable your own account.');
      if (req.body.status === 'disabled' && target.role_key === SUPER_ADMIN && activeSuperAdmins() <= 1) throw fail(400, 'The workspace needs at least one active super admin.');
      updates.status = req.body.status;
      detail.status = { from: target.status, to: req.body.status };
    }
    const cols = Object.keys(updates);
    if (cols.length) {
      tx(() => {
        db.prepare(`UPDATE users SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`).run(...cols.map((c) => updates[c]), target.id);
        if (updates.status === 'disabled') db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      });
      const action = detail.role ? 'user.role_changed' : updates.status === 'disabled' ? 'user.disabled' : updates.status === 'active' ? 'user.enabled' : 'user.updated';
      audit(req.user.id, action, target.email, detail);
    }
    res.json({ user: publicUser(getUser(target.id)) });
  } catch (e) {
    next(e);
  }
});

access.post('/users/:id/reset-password', requirePerm('users.manage'), (req, res, next) => {
  try {
    const target = getUser(Number(req.params.id));
    assertCanTouch(req, target);
    const password = generatePassword();
    tx(() => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), target.id);
      if (target.id !== req.user.id) db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
    });
    audit(req.user.id, 'user.password_reset', target.email);
    res.json({ temporary_password: password });
  } catch (e) {
    next(e);
  }
});

access.delete('/users/:id', requirePerm('users.manage'), (req, res, next) => {
  try {
    const target = getUser(Number(req.params.id));
    assertCanTouch(req, target);
    if (target.id === req.user.id) throw fail(400, 'You can’t remove yourself.');
    if (target.role_key === SUPER_ADMIN && activeSuperAdmins() <= 1 && target.status === 'active') throw fail(400, 'The workspace needs at least one active super admin.');
    db.prepare('DELETE FROM users WHERE id=?').run(target.id);
    audit(req.user.id, 'user.removed', target.email, { role: target.role_name });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/* ---------------------------- roles & permissions ---------------------------- */

access.get('/permissions', (req, res) => {
  res.json({ permissions: PERMISSIONS });
});

function listRoles() {
  const roles = db
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
       FROM roles r ORDER BY r.is_system DESC, r.id`,
    )
    .all();
  const rp = db.prepare('SELECT role_id, permission_key FROM role_permissions').all();
  return roles.map((r) => ({
    ...r,
    permissions: r.key === SUPER_ADMIN ? ALL_KEYS : rp.filter((x) => x.role_id === r.id).map((x) => x.permission_key),
  }));
}

access.get('/roles', requireAny('users.view', 'roles.manage'), (req, res) => {
  res.json({ roles: listRoles() });
});

function cleanPerms(list) {
  if (!Array.isArray(list)) throw fail(400, 'Permissions must be a list.');
  const set = new Set(list.filter((k) => ALL_KEYS.includes(k)));
  // Implied permissions keep roles coherent: managing implies viewing.
  const implied = {
    'monitors.run': 'monitors.view', 'monitors.create': 'monitors.view', 'monitors.edit': 'monitors.view', 'monitors.delete': 'monitors.view',
    'incidents.manage': 'incidents.view', 'data.write': 'data.read', 'data.delete': 'data.read', 'users.manage': 'users.view',
  };
  for (const [k, v] of Object.entries(implied)) if (set.has(k)) set.add(v);
  return [...set];
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'role';
}

access.post('/roles', requirePerm('roles.manage'), (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 60) throw fail(400, 'Role name is required (max 60 characters).');
    if (db.prepare('SELECT 1 FROM roles WHERE name = ? COLLATE NOCASE').get(name)) throw fail(409, 'A role with this name already exists.');
    const perms = cleanPerms(req.body.permissions || []);
    let key = slugify(name);
    for (let i = 2; db.prepare('SELECT 1 FROM roles WHERE key=?').get(key); i++) key = `${slugify(name)}_${i}`;
    const id = tx(() => {
      const info = db.prepare('INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
        key, name, String(req.body.description || '').trim().slice(0, 240), Date.now(),
      );
      const rid = Number(info.lastInsertRowid);
      const ins = db.prepare('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      for (const k of perms) ins.run(rid, k);
      return rid;
    });
    audit(req.user.id, 'role.created', name, { permissions: perms });
    res.status(201).json({ role: listRoles().find((r) => r.id === id) });
  } catch (e) {
    next(e);
  }
});

access.put('/roles/:id', requirePerm('roles.manage'), (req, res, next) => {
  try {
    const role = getRole(Number(req.params.id));
    if (!role) throw fail(404, 'Role not found.');
    if (role.is_system) throw fail(400, 'The Super Admin role always has every permission and can’t be edited.');
    const name = req.body.name !== undefined ? String(req.body.name).trim() : role.name;
    if (!name) throw fail(400, 'Role name is required.');
    if (db.prepare('SELECT 1 FROM roles WHERE name = ? COLLATE NOCASE AND id != ?').get(name, role.id)) throw fail(409, 'A role with this name already exists.');
    const description = req.body.description !== undefined ? String(req.body.description).trim().slice(0, 240) : role.description;
    const before = db.prepare('SELECT permission_key FROM role_permissions WHERE role_id=?').all(role.id).map((r) => r.permission_key);
    const perms = req.body.permissions !== undefined ? cleanPerms(req.body.permissions) : before;
    tx(() => {
      db.prepare('UPDATE roles SET name=?, description=? WHERE id=?').run(name, description, role.id);
      db.prepare('DELETE FROM role_permissions WHERE role_id=?').run(role.id);
      const ins = db.prepare('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      for (const k of perms) ins.run(role.id, k);
    });
    const added = perms.filter((k) => !before.includes(k));
    const removed = before.filter((k) => !perms.includes(k));
    audit(req.user.id, 'role.updated', name, {
      ...(name !== role.name ? { renamed: { from: role.name, to: name } } : {}),
      ...(added.length ? { added } : {}),
      ...(removed.length ? { removed } : {}),
    });
    res.json({ role: listRoles().find((r) => r.id === role.id) });
  } catch (e) {
    next(e);
  }
});

access.delete('/roles/:id', requirePerm('roles.manage'), (req, res, next) => {
  try {
    const role = getRole(Number(req.params.id));
    if (!role) throw fail(404, 'Role not found.');
    if (role.is_system) throw fail(400, 'The Super Admin role can’t be deleted.');
    const n = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role_id=?').get(role.id).n;
    if (n) throw fail(409, `Move the ${n} ${n === 1 ? 'person' : 'people'} in this role to another role first.`);
    db.prepare('DELETE FROM roles WHERE id=?').run(role.id);
    audit(req.user.id, 'role.deleted', role.name);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------- audit log -------------------------------- */

access.get('/audit', requirePerm('audit.view'), (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ${q ? 'WHERE a.action LIKE ? OR a.target LIKE ? OR a.detail LIKE ? OR u.name LIKE ?' : ''}
       ORDER BY a.ts DESC LIMIT ?`,
    )
    .all(...(q ? [like, like, like, like] : []), limit);
  res.json({ entries: rows });
});
