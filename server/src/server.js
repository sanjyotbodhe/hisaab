import { assertConfig, config } from './config.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { startRecurringScheduler, stopRecurringScheduler } from './services/recurring.js';

async function main() {
  assertConfig();
  await connectDb(config.mongoUri);
  console.log('[db] connected');

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port} (${config.env})`);
  });
  startRecurringScheduler(config.recurringIntervalMinutes);

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    stopRecurringScheduler();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
