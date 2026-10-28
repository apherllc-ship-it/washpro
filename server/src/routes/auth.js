import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { signToken, setAuthCookie, clearAuthCookie, publicUser, requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/notify.js';

const router = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(200);
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+0-9()\-.\s]*$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal(''));

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100),
  email,
  phone,
  password: passwordSchema,
  smsOptIn: z.boolean().optional(),
});

router.post(
  '/signup',
  limiter,
  validate(signupSchema),
  ah(async (req, res) => {
    const { name, email, phone, password, smsOptIn } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, 'An account with this email already exists');
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, smsOptIn: !!smsOptIn, passwordHash: await bcrypt.hash(password, 12), role: 'CUSTOMER' },
    });
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  '/login',
  limiter,
  validate(z.object({ email, password: z.string().min(1).max(128) })),
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Incorrect email or password');
    if (!user.active) throw new HttpError(403, 'This account is disabled. Please contact us.');
    setAuthCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  }),
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

router.post(
  '/forgot-password',
  limiter,
  validate(z.object({ email })),
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (user && user.active) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: hashToken(token), resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const url = `${config.appUrl}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        title: 'Reset your password',
        text: `Use this link within 1 hour to reset your password: ${url}`,
        html: '<p>We received a request to reset your password. The link expires in 1 hour. If you did not request this, ignore this email.</p>',
        cta: { label: 'Reset password', url },
      });
    }
    // Same response either way so emails can't be enumerated.
    res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
  }),
);

router.post(
  '/reset-password',
  limiter,
  validate(z.object({ token: z.string().length(64), password: passwordSchema })),
  ah(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { resetTokenHash: hashToken(req.body.token), resetTokenExpiry: { gt: new Date() } },
    });
    if (!user) throw new HttpError(400, 'This reset link is invalid or has expired');
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(req.body.password, 12), resetTokenHash: null, resetTokenExpiry: null },
    });
    setAuthCookie(res, signToken(updated));
    res.json({ user: publicUser(updated) });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema })),
  ah(async (req, res) => {
    const ok = await bcrypt.compare(req.body.currentPassword, req.user.passwordHash);
    if (!ok) throw new HttpError(400, 'Current password is incorrect');
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12) } });
    res.json({ ok: true });
  }),
);

export default router;
