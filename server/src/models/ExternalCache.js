import mongoose from 'mongoose';

/**
 * Cache for third-party lookups (place search, attractions). Shared by every server
 * instance, which matters on serverless where memory is per instance. MongoDB's TTL
 * index deletes entries after `expiresAt`.
 */
const cacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});

cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExternalCache = mongoose.model('ExternalCache', cacheSchema);
