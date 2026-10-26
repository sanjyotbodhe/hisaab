import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '7d',
  cookieName: 'hisaab_token',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  recurringIntervalMinutes: Number(process.env.RECURRING_INTERVAL_MINUTES) || 10,
};

/** Fail fast on startup instead of failing on the first request. */
export function assertConfig() {
  const problems = [];
  if (!config.mongoUri) problems.push('MONGODB_URI is not set');
  if (!config.jwtSecret) problems.push('JWT_SECRET is not set');
  else if (config.isProd && config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters in production');
  }
  if (problems.length) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
}
