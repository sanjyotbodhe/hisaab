// Vercel entrypoint for the "server" service (auto-detected as index.js). Exports the Express
// app; Vercel runs it as a serverless function. Locally, src/server.js is used instead.
import { createApp } from './src/app.js';
import { assertConfig, config } from './src/config.js';
import { ensureDb } from './src/db.js';
import { AppError } from './src/utils/errors.js';

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
