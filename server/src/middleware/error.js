import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { SplitError } from '../shared/split.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: details[0]?.message || 'Invalid input', details },
    });
  }
  if (err instanceof SplitError) {
    return res.status(400).json({
      error: { code: 'INVALID_SPLIT', message: err.message, details: [{ field: err.field, message: err.message }] },
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: details[0]?.message, details } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That already exists' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large' } });
  }
  if (err instanceof mongoose.Error.MongooseServerSelectionError || err?.name === 'MongoNetworkError') {
    console.error('[db]', err.message);
    return res.status(503).json({
      error: { code: 'DB_UNAVAILABLE', message: 'Database is temporarily unavailable, please try again' },
    });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } });
}
