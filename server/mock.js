// Built-in demo APIs with realistic behaviour (healthy, flaky, slow, periodic outage, expired auth, timeouts),
// so the dashboard has live signal without any external services.
import express from 'express';

const rand = (a, b) => a + Math.random() * (b - a);
const jitter = (base, spread) => Math.round(base + rand(-spread, spread));

export const PROFILES = {
  healthy: () => ({ status: 200, latency: jitter(85, 45) + (Math.random() < 0.02 ? rand(150, 400) : 0) }),
  fast: () => ({ status: 200, latency: jitter(38, 18) }),
  // Waves of slowness: periodically crosses the 800 ms degraded threshold.
  slow: (t) => {
    const wave = Math.max(0, Math.sin(t / (38 * 60 * 1000)));
    return { status: 200, latency: Math.round(320 + wave * 760 + rand(-60, 140)) };
  },
  flaky: () => (Math.random() < 0.12 ? { status: 503, latency: jitter(60, 30) } : { status: 200, latency: jitter(140, 60) }),
  // Down for 4 minutes in every 90.
  cyclic_outage: (t) =>
    Math.floor(t / 60000) % 90 < 4 ? { status: 500, latency: jitter(40, 15) } : { status: 200, latency: jitter(210, 70) },
  expired_auth: () => ({ status: 401, latency: jitter(45, 15) }),
  timeouts: () => (Math.random() < 0.07 ? { hang: true } : { status: 200, latency: jitter(260, 120) }),
};

export const mockRouter = express.Router();

const SERVICES = {
  'identity/token': 'fast',
  'documents/upload': 'healthy',
  'search/query': 'slow',
  'payments/webhook': 'flaky',
  'notifications/send': 'healthy',
  'reporting/export': 'cyclic_outage',
  'archive/retrieve': 'expired_auth',
  'workflow/tasks': 'timeouts',
  'profile/me': 'healthy',
  'audit/stream': 'fast',
};

mockRouter.all('/:a/:b', async (req, res) => {
  const slug = `${req.params.a}/${req.params.b}`;
  const profile = PROFILES[SERVICES[slug]];
  if (!profile) return res.status(404).json({ error: 'Unknown mock service' });
  const r = profile(Date.now());
  if (r.hang) {
    await new Promise((ok) => setTimeout(ok, 30000));
    if (!res.headersSent && !res.writableEnded) res.status(504).json({ error: 'Gateway timeout' });
    return;
  }
  await new Promise((ok) => setTimeout(ok, Math.max(0, r.latency)));
  if (res.writableEnded) return;
  const bodies = {
    200: { status: 'ok', service: slug },
    401: { error: 'invalid_token', error_description: 'The access token expired' },
    500: { error: 'internal_error', message: 'Export worker pool unavailable' },
    503: { error: 'service_unavailable', message: 'Upstream processor busy, retry later' },
  };
  res.status(r.status).json(bodies[r.status] || {});
});

export { SERVICES };

/**
 * Serverless only: answer a demo-API URL in-process instead of over HTTP
 * (a function can't call itself on 127.0.0.1). Returns null for non-mock URLs.
 */
export function simulateMock(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) return null;
  const m = u.pathname.match(/^\/mock\/([^/]+\/[^/]+)/);
  if (!m) return null;
  const profile = PROFILES[SERVICES[m[1]]];
  return profile ? profile(Date.now()) : { status: 404, latency: 5 };
}
