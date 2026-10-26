// Vercel serverless entry: every /api/* request is routed here (see vercel.json).
// The same Express app runs locally via server/src/server.js.
import { createApp } from '../server/src/app.js';
import { assertConfig, config } from '../server/src/config.js';
import { ensureDb } from '../server/src/db.js';

let configError = null;
try {
  assertConfig();
} catch (err) {
  configError = err;
  console.error('[config]', err.message); // visible in Vercel function logs
}

const app = createApp({ connect: () => ensureDb(config.mongoUri) });

export default function handler(req, res) {
  if (configError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'MISCONFIGURED', message: 'The server is missing configuration. Check the environment variables.' } }));
    return;
  }
  return app(req, res);
}
