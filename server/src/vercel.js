// Vercel entrypoint for the "server" service (see vercel.json). Exports the Express
// app; Vercel runs it as a serverless function. Locally, src/server.js is used instead.
import { createApp } from './app.js';
import { assertConfig, config } from './config.js';
import { ensureDb } from './db.js';
import { AppError } from './utils/errors.js';

let configError = null;
try {
  assertConfig();
} catch (err) {
  configError = err;
  console.error('[config]', err.message); // visible in Vercel function logs
}

const app = createApp({
  connect: () =>
    configError
      ? Promise.reject(
          new AppError(500, 'MISCONFIGURED', 'The server is missing configuration. Check the environment variables.'),
        )
      : ensureDb(config.mongoUri),
});

export default app;
