import mongoose from 'mongoose';

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
        throw err;
      });
  }
  return pending;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
