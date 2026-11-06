import crypto from 'node:crypto';
import { db } from './db.js';
import { ALL_KEYS, SUPER_ADMIN } from './permissions.js';
import { SERVERLESS } from './runtime.js';

export const COOKIE = 'canopy_sid';
const SESSION_TTL = 7 * 24 * 3600 * 1000;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(pw), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === calc.length && crypto.timingSafeEqual(known, calc);
}

export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/*
  Two session modes:
  · Long-running server: random token stored in the sessions table (revocable).
  · Serverless: a signed, stateless token "<userId>.<expiry>.<hmac>", because each
    instance has its own database and a request may land on any instance.
*/
const SECRET = process.env.SESSION_SECRET || 'canopy-demo-session-secret';
const cookieFlags = () => `HttpOnly; SameSite=Lax; Path=/${SERVERLESS ? '; Secure' : ''}`;
const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function readSignedToken(token) {
  const [uid, exp, sig] = String(token).split('.');
  if (!uid || !exp || !sig) return null;
  const expected = sign(`${uid}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(uid);
}

export function createSession(res, userId) {
  const now = Date.now();
  let token;
  if (SERVERLESS) {
    const exp = now + SESSION_TTL;
    token = `${userId}.${exp}.${sign(`${userId}.${exp}`)}`;
  } else {
    token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now, now + SESSION_TTL);
  }
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieFlags()}; Max-Age=${SESSION_TTL / 1000}`);
  return token;
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token && !SERVERLESS) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieFlags()}; Max-Age=0`);
}

export function permissionsForRole(role) {
  if (!role) return [];
  if (role.key === SUPER_ADMIN) return [...ALL_KEYS];
  return db.prepare('SELECT permission_key FROM role_permissions WHERE role_id = ?').all(role.id).map((r) => r.permission_key);
}

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    role_id: u.role_id,
    role_key: u.role_key,
    role_name: u.role_name,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

/** Attaches req.user and req.perms when a valid session cookie is present. */
export function authenticate(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = null;
  req.perms = new Set();
  if (token && SERVERLESS) {
    const uid = readSignedToken(token);
    const row = uid
      ? db.prepare(`SELECT u.*, r.key AS role_key, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(uid)
      : null;
    if (row && row.status === 'active') {
      req.user = row;
      req.perms = new Set(permissionsForRole({ id: row.role_id, key: row.role_key }));
    }
  } else if (token) {
    const row = db
      .prepare(
        `SELECT s.expires_at, u.*, r.key AS role_key, r.name AS role_name
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
         WHERE s.token = ?`,
      )
      .get(token);
    if (row && row.expires_at > Date.now() && row.status === 'active') {
      req.user = row;
      req.perms = new Set(permissionsForRole({ id: row.role_id, key: row.role_key }));
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

/** Requires every listed permission. */
export function requirePerm(...keys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    const missing = keys.filter((k) => !req.perms.has(k));
    if (missing.length) return res.status(403).json({ error: `You don’t have permission to do this (${missing.join(', ')}).` });
    next();
  };
}

export const isSuperAdmin = (req) => req.user?.role_key === SUPER_ADMIN;

// Simple in-memory login throttle: 8 failed attempts per 10 minutes per IP+email.
const attempts = new Map();
export function loginThrottle(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 10 * 60 * 1000) return { blocked: false };
  return { blocked: rec.count >= 8 };
}
export function recordLoginFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 10 * 60 * 1000) attempts.set(key, { first: now, count: 1 });
  else rec.count++;
}
export function clearLoginFailures(key) {
  attempts.delete(key);
}
