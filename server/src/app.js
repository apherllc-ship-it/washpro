import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { loadUser, requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { stripeWebhook } from './lib/stripe.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import publicRoutes from './routes/public.js';
import quoteRoutes from './routes/quotes.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';
import { proRouter, photoRouter } from './routes/jobs.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind a proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Allowlist recommended by Google for the Maps JavaScript API.
          'script-src': ["'self'", "'unsafe-eval'", 'blob:', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.google.com', 'https://*.ggpht.com', 'https://*.googleusercontent.com'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.google.com', 'https://*.googleusercontent.com', 'https://*.ggpht.com'],
          'connect-src': ["'self'", 'data:', 'blob:', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.google.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'worker-src': ["'self'", 'blob:'],
          'frame-src': ["'self'", 'https://*.google.com', 'https://checkout.stripe.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  // Stripe needs the raw body for signature checks – register before express.json().
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', loadUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/me', requireAuth, meRoutes);
  app.use('/api/quotes', requireAuth, quoteRoutes);
  app.use('/api/bookings', requireAuth, bookingRoutes);
  app.use('/api/photos', requireAuth, photoRouter);
  app.use('/api/pro', proRouter);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app in production.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, file) => {
      if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (/sw\.js$|workbox-.*\.js$|manifest\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    } }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else if (!config.isProd) {
    app.get('/', (_req, res) => res.send('API running. Start the client with `npm run dev` in /client.'));
  }

  app.use(errorHandler);
  return app;
}
