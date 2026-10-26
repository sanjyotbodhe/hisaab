import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { nearbyAttractions, searchPlaces } from '../services/places.js';

// Mounted at /api/places after requireAuth.
const router = Router();

// Third-party services are shared and free: keep each user well under their limits.
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: config.isTest ? 1000 : 30,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many map searches. Wait a minute and try again.' },
      }),
  }),
);

router.get(
  '/search',
  validate({ query: z.object({ q: z.string().trim().min(2, 'Type at least 2 letters').max(120) }) }),
  async (req, res) => {
    res.json({ results: await searchPlaces(req.valid.query.q) });
  },
);

router.get(
  '/attractions',
  validate({
    query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }),
  }),
  async (req, res) => {
    res.json({ results: await nearbyAttractions(req.valid.query.lat, req.valid.query.lng) });
  },
);

export default router;
