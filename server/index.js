// Vercel entrypoint for the "server" service (auto-detected as index.js). Exports the Express
// app; Vercel runs it as a serverless function. Locally, src/server.js is used instead.
import { createApp } from './src/app.js';
import { config, configProblems } from './src/config.js';
import { ensureDb } from './src/db.js';
import { AppError } from './src/utils/errors.js';

const problems = configProblems();
if (problems.length) console.error('[config]', problems.join('; ')); // visible in Vercel function logs

const app = createApp({
  connect: () =>
    problems.length
      ? Promise.reject(
          new AppError(500, 'MISCONFIGURED', `Server configuration problem: ${problems.join('; ')}`, { problems }),
        )
      : ensureDb(config.mongoUri),
});

export default app;
