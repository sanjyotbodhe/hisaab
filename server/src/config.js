import 'dotenv/config';

// On Vercel, treat every deployment as production (secure cookies, no dev CORS).
const env = process.env.VERCEL ? 'production' : process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  isServerless: Boolean(process.env.VERCEL),
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '7d',
  cookieName: 'hisaab_token',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  recurringIntervalMinutes: Number(process.env.RECURRING_INTERVAL_MINUTES) || 10,
  // Optional: lets an external scheduler call /api/cron/recurring (Authorization: Bearer <CRON_SECRET>).
  cronSecret: process.env.CRON_SECRET,
  // Razorpay (optional). Payments are enabled only when both keys are set.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  // Only overridden in automated tests, to point at a local mock of the Razorpay API.
  razorpayApiBase: process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com',
};

export const paymentsEnabled = () => Boolean(config.razorpayKeyId && config.razorpayKeySecret);

/** Names of required settings that are missing or invalid (never their values). */
export function configProblems() {
  const problems = [];
  if (!config.mongoUri) problems.push('MONGODB_URI is not set');
  if (!config.jwtSecret) problems.push('JWT_SECRET is not set');
  else if (config.isProd && config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters in production');
  }
  return problems;
}

/** Fail fast on startup instead of failing on the first request. */
export function assertConfig() {
  const problems = configProblems();
  if (problems.length) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
}
