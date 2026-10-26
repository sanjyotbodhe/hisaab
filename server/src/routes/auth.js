import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { clearSession, issueSession, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { AppError, conflict } from '../utils/errors.js';

const router = Router();

// Slow down password guessing: 20 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' },
    }),
});

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt only uses 72 bytes

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name is too long'),
  email,
  password,
});

const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(200) });

// Used to keep login timing the same whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
  const { name, email: mail, password: pw } = req.valid.body;
  if (await User.exists({ email: mail })) {
    throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  const passwordHash = await bcrypt.hash(pw, 12);
  let user;
  try {
    user = await User.create({ name, email: mail, passwordHash });
  } catch (err) {
    if (err?.code === 11000) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }
  issueSession(res, user);
  res.status(201).json({ user: user.toPublic() });
});

router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email: mail, password: pw } = req.valid.body;
  const user = await User.findOne({ email: mail }).select('+passwordHash');
  const ok = await bcrypt.compare(pw, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    // Same message for both cases so emails can't be enumerated.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  issueSession(res, user);
  res.json({ user: user.toPublic() });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

export default router;
