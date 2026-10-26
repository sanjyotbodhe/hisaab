import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { config } from './config.js';
import { requireAuth, requireCsrfHeader } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { loadGroupMember } from './middleware/group.js';
import authRoutes from './routes/auth.js';
import cronRoutes from './routes/cron.js';
import expenseRoutes from './routes/expenses.js';
import meRoutes from './routes/me.js';
import groupRoutes from './routes/groups.js';
import inviteRoutes from './routes/invites.js';
import recurringRoutes from './routes/recurring.js';
import planRoutes from './routes/plan.js';
import paymentRoutes from './routes/payments.js';
import paymentWebhookRoutes from './routes/paymentWebhook.js';
import bookingRoutes from './routes/bookings.js';
import placesRoutes from './routes/places.js';
import settlementRoutes from './routes/settlements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

/**
 * @param {object} [options]
 * @param {() => Promise<unknown>} [options.connect] called before every API request;
 *   used on serverless platforms to open (or reuse) the database connection lazily.
 */
export function createApp({ connect } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the hosting proxy: needed for secure cookies and rate limiting by IP

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          frameSrc: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: [
            "'self'",
            'data:',
            'https://tile.openstreetmap.org',
            'https://upload.wikimedia.org',
            'https://*.razorpay.com',
          ],
          connectSrc: ["'self'", 'https://*.razorpay.com'],
        },
      },
    }),
  );
  app.use(compression());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // In production the API and the React app share one origin, so CORS is only for local dev.
  if (!config.isProd) app.use('/api', cors({ origin: config.clientOrigin, credentials: true }));

  app.use(
    express.json({
      limit: '100kb',
      // Keep the exact bytes for webhook signature checks (re-serialised JSON would not match).
      verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/payments/webhook')) req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());

  app.get('/api/health', async (req, res) => {
    let problem = null;
    if (connect) {
      // Report the reason instead of throwing, so deployments are easy to diagnose.
      await connect().catch((err) => {
        problem = err.code === 'MISCONFIGURED' ? err.message : (err.details?.reason ?? 'unknown');
      });
    }
    const ok = !problem && mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      db: ok ? 'up' : 'down',
      ...(problem ? { problem } : {}),
    });
  });

  if (connect) {
    app.use('/api', async (req, res, next) => {
      await connect(); // a failure here becomes a clean 503 in the error handler
      next();
    });
  }
  // Server-to-server webhook: authenticated by signature, so it sits before the CSRF check.
  app.use('/api/payments', paymentWebhookRoutes);
  app.use('/api', requireCsrfHeader);
  app.use('/api/cron', cronRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/invites', requireAuth, inviteRoutes);
  app.use('/api/groups/:groupId/expenses', requireAuth, loadGroupMember, expenseRoutes);
  app.use('/api/groups/:groupId/settlements', requireAuth, loadGroupMember, settlementRoutes);
  app.use('/api/groups/:groupId/recurring', requireAuth, loadGroupMember, recurringRoutes);
  app.use('/api/groups/:groupId/plan', requireAuth, loadGroupMember, planRoutes);
  app.use('/api/groups/:groupId/bookings', requireAuth, loadGroupMember, bookingRoutes);
  app.use('/api/places', requireAuth, placesRoutes);
  app.use('/api/groups/:groupId/payments', requireAuth, loadGroupMember, paymentRoutes);
  app.use('/api/me', requireAuth, meRoutes);
  app.use('/api/groups', requireAuth, groupRoutes);
  app.use('/api', notFoundHandler);

  // Serve the built React app; any non-API path returns index.html (client-side routing).
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
