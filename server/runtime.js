// Serverless (Vercel) vs long-running server. Serverless instances have no background
// process, a read-only filesystem apart from /tmp, and short-lived requests.
export const SERVERLESS = !!process.env.VERCEL;
export const PORT = Number(process.env.PORT || 4000);
