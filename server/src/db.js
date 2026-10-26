import mongoose from 'mongoose';
import { AppError } from './utils/errors.js';

mongoose.set('strictQuery', true);

/**
 * Make sure every index exists before we accept traffic: idempotency and
 * recurring-expense de-duplication depend on unique indexes.
 * Model.init() only creates missing indexes (never drops), and runs once per model.
 */
async function ensureIndexes() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function connectDb(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await ensureIndexes();
  return mongoose.connection;
}

let pending = null;

const DB_MESSAGES = {
  invalid_connection_string: 'The database connection string is invalid. Check MONGODB_URI.',
  authentication_failed: 'The database rejected the username or password in MONGODB_URI.',
  host_not_found: 'The database host in MONGODB_URI could not be found.',
  unreachable: 'The database could not be reached. Check that Atlas Network Access allows this server.',
  unknown: 'Database is temporarily unavailable, please try again.',
};

/** Turns a driver error into a safe, actionable reason code (no secrets). */
export function classifyDbError(err) {
  const text = `${err?.name} ${err?.message} ${err?.cause?.message ?? ''}`;
  if (err?.name === 'MongoParseError' || /Invalid scheme|URI must|Invalid connection string/i.test(text)) {
    return 'invalid_connection_string';
  }
  if (err?.code === 18 || err?.code === 8000 || /auth(entication)? failed|bad auth/i.test(text)) {
    return 'authentication_failed';
  }
  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(text)) return 'host_not_found';
  if (/ServerSelection|ECONNREFUSED|timed out|ETIMEDOUT/i.test(text)) return 'unreachable';
  return 'unknown';
}

/**
 * For serverless (Vercel): one shared connection per warm instance, created on the
 * first request. If connecting fails, the next request tries again.
 */
export function ensureDb(uri) {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!pending) {
    pending = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
      .then(ensureIndexes)
      .then(() => mongoose.connection)
      .catch((err) => {
        pending = null;
        const reason = classifyDbError(err);
        console.error(`[db] connection failed (${reason}):`, err.message); // full detail only in server logs
        throw new AppError(503, 'DB_UNAVAILABLE', DB_MESSAGES[reason], { reason });
      });
  }
  return pending;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
