// Public endpoints: runtime config, service catalog, measurement helpers, quote preview, availability.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, getSettings } from '../db.js';
import { config } from '../config.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { calculateQuote } from '../lib/pricing.js';
import { solarRoofArea, geocode } from '../lib/geo.js';
import { getDaySlots, getRangeAvailability } from '../lib/availability.js';
import { stripe } from '../lib/stripe.js';

const router = Router();
const googleLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20 });

router.get(
  '/config',
  ah(async (_req, res) => {
    const s = await getSettings();
    res.json({
      businessName: s.businessName,
      businessPhone: s.businessPhone,
      businessEmail: s.businessEmail,
      businessLocation: s.businessLat != null ? { lat: s.businessLat, lng: s.businessLng } : null,
      timezone: s.timezone,
      googleMapsKey: config.google.browserKey,
      googleMapId: config.google.mapId,
      solarEnabled: !!config.google.serverKey,
      depositEnabled: s.depositEnabled && !!stripe,
      depositPercent: s.depositPercent,
      cancelWindowHours: s.cancelWindowHours,
    });
  }),
);

router.get(
  '/services',
  ah(async (_req, res) => {
    const services = await prisma.service.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include: { materials: { orderBy: { multiplier: 'asc' } }, addOns: { where: { active: true } } },
    });
    res.json({ services });
  }),
);

export const quoteInputSchema = z.object({
  address: z.string().trim().min(5, 'Enter the property address').max(300),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  customerNotes: z.string().max(2000).optional().default(''),
  items: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        quantity: z.number().min(0).max(1_000_000),
        materialId: z.string().nullable().optional(),
        addOnIds: z.array(z.string()).max(20).optional().default([]),
        label: z.string().max(80).optional().default(''),
        geometry: z
          .array(z.object({ lat: z.number(), lng: z.number() }))
          .max(500)
          .nullable()
          .optional(),
      }),
    )
    .min(1, 'Add at least one area')
    .max(30),
});

router.post(
  '/quote/preview',
  validate(quoteInputSchema),
  ah(async (req, res) => {
    res.json({ quote: await calculateQuote(req.body) });
  }),
);

router.get(
  '/measure/solar',
  googleLimiter,
  ah(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'lat and lng are required');
    res.json(await solarRoofArea(lat, lng));
  }),
);

router.get(
  '/measure/geocode',
  googleLimiter,
  ah(async (req, res) => {
    const q = String(req.query.address || '').slice(0, 300);
    res.json({ result: await geocode(q) });
  }),
);

// Availability uses either a saved quote's duration or an explicit duration.
const availQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(62).optional().default(35),
  quoteId: z.string().optional(),
  bookingId: z.string().optional(),
  duration: z.coerce.number().int().min(15).max(24 * 60).optional(),
});

async function resolveDuration(q, user) {
  if (q.bookingId) {
    const b = await prisma.booking.findUnique({ where: { id: q.bookingId } });
    if (!b || (user?.role !== 'ADMIN' && b.customerId !== user?.id)) throw new HttpError(404, 'Booking not found');
    return Math.round((b.end - b.start) / 60000);
  }
  if (q.quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: q.quoteId } });
    if (!quote || (user?.role !== 'ADMIN' && quote.customerId !== user?.id)) throw new HttpError(404, 'Quote not found');
    return quote.durationMinutes;
  }
  return q.duration || 120;
}

router.get(
  '/availability/days',
  validate(availQuery, 'query'),
  ah(async (req, res) => {
    const q = req.validQuery;
    const duration = await resolveDuration(q, req.user);
    const from = q.from || new Date().toISOString().slice(0, 10);
    res.json({ duration, days: await getRangeAvailability(from, q.days, duration, q.bookingId) });
  }),
);

router.get(
  '/availability/slots',
  validate(availQuery, 'query'),
  ah(async (req, res) => {
    const q = req.validQuery;
    if (!q.date) throw new HttpError(400, 'date is required');
    const duration = await resolveDuration(q, req.user);
    res.json({ duration, slots: await getDaySlots(q.date, duration, q.bookingId) });
  }),
);

export default router;
