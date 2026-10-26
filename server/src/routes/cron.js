import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { processDueRecurring } from '../services/recurring.js';
import { unauthorized } from '../utils/errors.js';

const router = Router();

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Called once a day by Vercel Cron (see vercel.json). On a long-running server the
 * in-process scheduler does the same job; either way the job is idempotent.
 */
router.get('/recurring', async (req, res) => {
  const header = req.get('Authorization') || '';
  if (!config.cronSecret || !safeEqual(header, `Bearer ${config.cronSecret}`)) throw unauthorized('Invalid cron secret');
  const created = await processDueRecurring();
  res.json({ ok: true, created });
});

export default router;
