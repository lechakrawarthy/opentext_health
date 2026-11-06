import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from './db.js';
import { seedIfEmpty } from './seed.js';
import {
  authenticate, requireAuth, createSession, destroySession, verifyPassword, hashPassword,
  publicUser, loginThrottle, recordLoginFailure, clearLoginFailures,
} from './auth.js';
import { mockRouter } from './mock.js';
import { startEngine, bus } from './engine.js';
import { monitoring } from './routes/monitoring.js';
import { access } from './routes/access.js';
import { data } from './routes/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

seedIfEmpty(PORT);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

// Demo upstream APIs that the seeded monitors watch.
app.use('/mock', mockRouter);

const api = express.Router();
api.use(authenticate);

/* ------------------------------------ auth ----------------------------------- */

api.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${email}`;
  if (loginThrottle(key).blocked) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(key);
    return res.status(401).json({ error: 'That email and password don’t match.' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: 'This account has been disabled. Ask your super admin to restore access.' });
  clearLoginFailures(key);
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(Date.now(), user.id);
  createSession(res, user.id);
  audit(user.id, 'auth.login', user.email);
  res.json({ ok: true });
});

api.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), permissions: [...req.perms] });
});

api.post('/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(next)), req.user.id);
  audit(req.user.id, 'auth.password_changed', req.user.email);
  res.json({ ok: true });
});

/* ------------------------------- live event stream --------------------------- */

api.get('/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  const userId = req.user.id;
  const send = (e) => {
    // Drop the stream if the user has since been disabled or lost access.
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  bus.on('event', send);
  const ping = setInterval(() => {
    const u = db.prepare('SELECT status FROM users WHERE id=?').get(userId);
    if (!u || u.status !== 'active') return res.end();
    res.write(`: ping\n\n`);
  }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('event', send);
  });
});

api.use(requireAuth, monitoring);
api.use('/access', requireAuth, access);
api.use('/data', requireAuth, data);

api.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on our side.' });
});

app.use('/api', api);

/* ------------------------------ production static ---------------------------- */

const dist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Canopy API listening on http://localhost:${PORT}`);
  startEngine();
});
