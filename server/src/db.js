import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDb(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // Make sure unique / partial indexes exist before we accept traffic:
  // idempotency and recurring-expense de-duplication depend on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
