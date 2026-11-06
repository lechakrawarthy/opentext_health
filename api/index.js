// Vercel serverless entry. Every /api/* request is rewritten here (see vercel.json).
// The first request on a fresh instance seeds the demo workspace into /tmp.
import app from '../server/app.js';

export default app;
