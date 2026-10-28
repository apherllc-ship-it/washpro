// Central place for environment configuration. Every secret comes from env vars.
const env = process.env;

const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set (32+ characters) in production');
}

export const config = {
  isProd,
  port: Number(env.PORT) || 4000,
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',

  google: {
    // Browser key (restricted by HTTP referrer) – sent to the client at runtime.
    browserKey: env.GOOGLE_MAPS_BROWSER_KEY || '',
    // Server key (restricted by IP / API) – used for Geocoding, Routes and Solar.
    serverKey: env.GOOGLE_MAPS_SERVER_KEY || '',
    mapId: env.GOOGLE_MAPS_MAP_ID || '',
  },

  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.EMAIL_FROM || 'WashPro <no-reply@example.com>',
  },

  twilio: {
    sid: env.TWILIO_ACCOUNT_SID || '',
    token: env.TWILIO_AUTH_TOKEN || '',
    from: env.TWILIO_FROM_NUMBER || '',
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    currency: (env.STRIPE_CURRENCY || 'usd').toLowerCase(),
  },
};
