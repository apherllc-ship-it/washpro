// Admin API: dashboard stats, bookings calendar, CRM, users, services/pricing, settings.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma, getSettings } from '../db.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { requireRole, publicUser } from '../middleware/auth.js';
import { changeStatus, assignPro, loadBookingDetail } from '../lib/bookings.js';
import { withReservedSlot, proHasConflict } from '../lib/availability.js';
import { notifyBookingStatus, formatWhen } from '../lib/notify.js';
import { geocode } from '../lib/geo.js';
import { staffJobRouter } from './jobs.js';
import { passwordSchema } from './auth.js';

const router = Router();
router.use(requireRole('ADMIN'));

const STATUSES = ['REQUESTED', 'CONFIRMED', 'SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

// ---------- Dashboard ----------
router.get(
  '/stats',
  ah(async (_req, res) => {
    const settings = await getSettings();
    const now = DateTime.now().setZone(settings.timezone);
    const monthStart = now.startOf('month').toJSDate();
    const lastMonthStart = now.minus({ months: 1 }).startOf('month').toJSDate();
    const todayStart = now.startOf('day').toJSDate();
    const todayEnd = now.endOf('day').toJSDate();

    const [revenueAll, revenueMonth, revenueLastMonth, upcoming, pendingQuotes, pendingValue, byStatus, today, requested, customers] = await Promise.all([
      prisma.booking.aggregate({ _sum: { total: true }, where: { status: 'COMPLETED' } }),
      prisma.booking.aggregate({ _sum: { total: true }, _count: true, where: { status: 'COMPLETED', start: { gte: monthStart } } }),
      prisma.booking.aggregate({ _sum: { total: true }, where: { status: 'COMPLETED', start: { gte: lastMonthStart, lt: monthStart } } }),
      prisma.booking.aggregate({ _sum: { total: true }, _count: true, where: { status: { in: ['REQUESTED', 'CONFIRMED', 'SCHEDULED'] }, start: { gte: new Date() } } }),
      prisma.quote.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, validUntil: { gte: new Date() } } }),
      prisma.quote.aggregate({ _sum: { total: true }, where: { status: { in: ['PENDING', 'CONFIRMED'] }, validUntil: { gte: new Date() } } }),
      prisma.booking.groupBy({ by: ['status'], _count: true }),
      prisma.booking.findMany({
        where: { start: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } },
        orderBy: { start: 'asc' },
        include: { customer: { select: { name: true } }, pro: { select: { name: true } } },
      }),
      prisma.booking.findMany({
        where: { status: 'REQUESTED' },
        orderBy: { start: 'asc' },
        take: 10,
        include: { customer: { select: { name: true } } },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);

    // Revenue for the last 6 months (completed jobs)
    const sixMonthsAgo = now.minus({ months: 5 }).startOf('month');
    const completed = await prisma.booking.findMany({ where: { status: 'COMPLETED', start: { gte: sixMonthsAgo.toJSDate() } }, select: { start: true, total: true } });
    const months = [];
    for (let i = 0; i < 6; i++) {
      const m = sixMonthsAgo.plus({ months: i });
      const key = m.toFormat('yyyy-LL');
      months.push({
        key,
        label: m.toFormat('LLL'),
        revenue: completed.filter((b) => DateTime.fromJSDate(b.start).setZone(settings.timezone).toFormat('yyyy-LL') === key).reduce((s, b) => s + b.total, 0),
      });
    }

    res.json({
      revenue: { allTime: revenueAll._sum.total || 0, month: revenueMonth._sum.total || 0, lastMonth: revenueLastMonth._sum.total || 0, jobsThisMonth: revenueMonth._count },
      upcoming: { count: upcoming._count, value: upcoming._sum.total || 0 },
      pendingQuotes: { count: pendingQuotes, value: pendingValue._sum.total || 0 },
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      customers,
      months,
      today,
      requested,
    });
  }),
);

// ---------- Bookings / calendar ----------
router.get(
  '/bookings',
  ah(async (req, res) => {
    const where = {};
    if (req.query.from || req.query.to) {
      where.start = {};
      if (req.query.from) where.start.gte = new Date(String(req.query.from));
      if (req.query.to) where.start.lt = new Date(String(req.query.to));
    }
    if (req.query.status && STATUSES.includes(String(req.query.status))) where.status = String(req.query.status);
    if (req.query.proId) where.proId = req.query.proId === 'none' ? null : String(req.query.proId);
    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { start: 'asc' },
      take: 500,
      include: { customer: { select: { id: true, name: true, phone: true } }, pro: { select: { id: true, name: true } }, quote: { select: { items: { select: { serviceName: true } } } } },
    });
    res.json({ bookings });
  }),
);

router.get(
  '/bookings/:id',
  ah(async (req, res) => {
    res.json({ booking: await loadBookingDetail(req.params.id, req.user) });
  }),
);

router.patch(
  '/bookings/:id',
  validate(
    z.object({
      proId: z.string().nullable().optional(),
      status: z.enum(STATUSES).optional(),
      note: z.string().max(1000).optional().default(''),
    }),
  ),
  ah(async (req, res) => {
    if (req.body.proId !== undefined) await assignPro(req.params.id, req.body.proId, req.user);
    if (req.body.status) {
      const current = await prisma.booking.findUnique({ where: { id: req.params.id } });
      if (current && current.status !== req.body.status) await changeStatus(req.params.id, req.body.status, req.user, req.body.note);
    }
    res.json({ booking: await loadBookingDetail(req.params.id, req.user) });
  }),
);

router.post(
  '/bookings/:id/reschedule',
  validate(z.object({ start: z.string().datetime({ offset: true }) })),
  ah(async (req, res) => {
    const settings = await getSettings();
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) throw new HttpError(400, 'This booking is closed');
    const duration = Math.round((booking.end - booking.start) / 60000);
    await withReservedSlot(req.body.start, duration, { excludeBookingId: booking.id }, async (tx, slot) => {
      let { proId, status } = booking;
      if (proId && (await proHasConflict(proId, slot.start, slot.end, booking.id))) {
        proId = null;
        status = 'CONFIRMED';
      }
      await tx.booking.update({ where: { id: booking.id }, data: { start: slot.start, end: slot.end, proId, status } });
      await tx.bookingEvent.create({ data: { bookingId: booking.id, status, note: `Rescheduled to ${formatWhen(slot.start, settings.timezone)}`, actorId: req.user.id } });
    });
    await notifyBookingStatus(booking.id, { headline: `Booking #${booking.number} rescheduled` }).catch(() => {});
    res.json({ booking: await loadBookingDetail(booking.id, req.user) });
  }),
);

router.use('/bookings', staffJobRouter);

// ---------- Quotes ----------
router.get(
  '/quotes',
  ah(async (req, res) => {
    const status = String(req.query.status || '');
    const quotes = await prisma.quote.findMany({
      where: ['PENDING', 'CONFIRMED', 'BOOKED', 'EXPIRED'].includes(status) ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { customer: { select: { id: true, name: true, email: true } }, items: { select: { serviceName: true } }, booking: { select: { id: true } } },
    });
    res.json({ quotes });
  }),
);

// ---------- Users ----------
router.get(
  '/users',
  ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const role = String(req.query.role || '');
    const users = await prisma.user.findMany({
      where: {
        ...(['CUSTOMER', 'PRO', 'ADMIN'].includes(role) ? { role } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ users: users.map((u) => ({ ...publicUser(u), active: u.active })) });
  }),
);

router.post(
  '/users',
  validate(
    z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional().default(''),
      role: z.enum(['CUSTOMER', 'PRO', 'ADMIN']),
      password: passwordSchema,
    }),
  ),
  ah(async (req, res) => {
    const { password, phone, ...rest } = req.body;
    const user = await prisma.user.create({ data: { ...rest, phone: phone || null, passwordHash: await bcrypt.hash(password, 12) } });
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.patch(
  '/users/:id',
  validate(
    z.object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(30).optional(),
      role: z.enum(['CUSTOMER', 'PRO', 'ADMIN']).optional(),
      active: z.boolean().optional(),
      password: passwordSchema.optional(),
    }),
  ),
  ah(async (req, res) => {
    if (req.params.id === req.user.id && (req.body.role && req.body.role !== 'ADMIN' || req.body.active === false)) {
      throw new HttpError(400, "You can't remove your own admin access");
    }
    const { password, ...data } = req.body;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user: { ...publicUser(user), active: user.active } });
  }),
);

router.get(
  '/pros',
  ah(async (_req, res) => {
    const pros = await prisma.user.findMany({ where: { role: { in: ['PRO', 'ADMIN'] }, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true, phone: true } });
    res.json({ pros });
  }),
);

// ---------- CRM ----------
router.get(
  '/customers',
  ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { addresses: { some: { formatted: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { bookings: { select: { total: true, status: true, start: true } }, addresses: { where: { isDefault: true }, select: { formatted: true } }, _count: { select: { quotes: true } } },
    });
    res.json({
      customers: customers.map((c) => {
        const done = c.bookings.filter((b) => b.status === 'COMPLETED');
        const last = c.bookings.filter((b) => b.status !== 'CANCELLED').sort((a, b) => b.start - a.start)[0];
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          active: c.active,
          address: c.addresses[0]?.formatted || null,
          jobs: done.length,
          bookings: c.bookings.length,
          quotes: c._count.quotes,
          totalSpent: done.reduce((s, b) => s + b.total, 0),
          lastJob: last?.start || null,
          createdAt: c.createdAt,
        };
      }),
    });
  }),
);

router.get(
  '/customers/:id',
  ah(async (req, res) => {
    const c = await prisma.user.findFirst({
      where: { id: req.params.id },
      include: {
        addresses: true,
        quotes: { orderBy: { createdAt: 'desc' }, include: { items: { select: { serviceName: true } } } },
        bookings: { orderBy: { start: 'desc' }, include: { pro: { select: { name: true } } } },
        crmNotes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
      },
    });
    if (!c) throw new HttpError(404, 'Customer not found');
    const totalSpent = c.bookings.filter((b) => b.status === 'COMPLETED').reduce((s, b) => s + b.total, 0);
    res.json({
      customer: { ...publicUser(c), active: c.active, addresses: c.addresses, quotes: c.quotes, bookings: c.bookings, notes: c.crmNotes, totalSpent },
    });
  }),
);

router.post(
  '/customers/:id/notes',
  validate(z.object({ body: z.string().trim().min(1).max(4000) })),
  ah(async (req, res) => {
    const note = await prisma.customerNote.create({ data: { customerId: req.params.id, authorId: req.user.id, body: req.body.body }, include: { author: { select: { name: true } } } });
    res.status(201).json({ note });
  }),
);

router.delete(
  '/customers/:id/notes/:noteId',
  ah(async (req, res) => {
    await prisma.customerNote.deleteMany({ where: { id: req.params.noteId, customerId: req.params.id } });
    res.json({ ok: true });
  }),
);

// ---------- Services & pricing ----------
const unit = z.enum(['SQFT', 'LINFT', 'FLAT']);
const serviceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes').max(60),
  category: z.enum(['POWER_WASH', 'SOFT_WASH']),
  description: z.string().max(1000).default(''),
  unit,
  pricePerUnit: z.number().min(0).max(10000),
  minimumCharge: z.number().min(0).max(100000),
  baseMinutes: z.number().int().min(0).max(1440),
  unitsPerHour: z.number().min(1).max(100000),
  surfaceType: z.string().max(30).default('other'),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  materials: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(60), multiplier: z.number().min(0).max(20) })).max(30).default([]),
  addOns: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(80),
        description: z.string().max(300).default(''),
        unit,
        price: z.number().min(0).max(100000),
        active: z.boolean().default(true),
      }),
    )
    .max(30)
    .default([]),
});

const serviceInclude = { materials: { orderBy: { multiplier: 'asc' } }, addOns: true };

router.get(
  '/services',
  ah(async (_req, res) => {
    res.json({ services: await prisma.service.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }], include: serviceInclude }) });
  }),
);

router.post(
  '/services',
  validate(serviceSchema),
  ah(async (req, res) => {
    const { materials, addOns, ...data } = req.body;
    const service = await prisma.service.create({
      data: {
        ...data,
        materials: { create: materials.map(({ id: _id, ...m }) => m) },
        addOns: { create: addOns.map(({ id: _id, ...a }) => a) },
      },
      include: serviceInclude,
    });
    res.status(201).json({ service });
  }),
);

router.put(
  '/services/:id',
  validate(serviceSchema),
  ah(async (req, res) => {
    const { materials, addOns, ...data } = req.body;
    const id = req.params.id;
    await prisma.$transaction(async (tx) => {
      await tx.service.update({ where: { id }, data });
      await tx.materialMultiplier.deleteMany({ where: { serviceId: id, id: { notIn: materials.filter((m) => m.id).map((m) => m.id) } } });
      for (const { id: mid, ...m } of materials) {
        if (mid) await tx.materialMultiplier.updateMany({ where: { id: mid, serviceId: id }, data: m });
        else await tx.materialMultiplier.create({ data: { ...m, serviceId: id } });
      }
      await tx.addOn.deleteMany({ where: { serviceId: id, id: { notIn: addOns.filter((a) => a.id).map((a) => a.id) } } });
      for (const { id: aid, ...a } of addOns) {
        if (aid) await tx.addOn.updateMany({ where: { id: aid, serviceId: id }, data: a });
        else await tx.addOn.create({ data: { ...a, serviceId: id } });
      }
    });
    res.json({ service: await prisma.service.findUnique({ where: { id }, include: serviceInclude }) });
  }),
);

router.delete(
  '/services/:id',
  ah(async (req, res) => {
    // Quotes keep a copy of the service name/prices, so deleting is safe.
    await prisma.service.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// ---------- Settings, hours, blocked days ----------
const settingsSchema = z
  .object({
    businessName: z.string().trim().min(1).max(100),
    businessEmail: z.string().trim().max(200),
    businessPhone: z.string().trim().max(30),
    businessAddress: z.string().trim().max(300),
    businessLat: z.number().min(-90).max(90).nullable(),
    businessLng: z.number().min(-180).max(180).nullable(),
    timezone: z.string().refine((tz) => DateTime.local().setZone(tz).isValid, 'Unknown timezone'),
    travelFreeMiles: z.number().min(0).max(500),
    travelFeePerMile: z.number().min(0).max(100),
    travelFeeMax: z.number().min(0).max(10000),
    maxServiceMiles: z.number().min(0).max(1000),
    taxRate: z.number().min(0).max(30),
    depositEnabled: z.boolean(),
    depositPercent: z.number().min(0).max(100),
    crews: z.number().int().min(1).max(50),
    slotIntervalMinutes: z.number().int().min(15).max(240),
    bookingLeadHours: z.number().int().min(0).max(24 * 30),
    bookingHorizonDays: z.number().int().min(1).max(365),
    cancelWindowHours: z.number().int().min(0).max(24 * 14),
    quoteValidDays: z.number().int().min(1).max(365),
    autoConfirm: z.boolean(),
  })
  .partial();

router.get(
  '/settings',
  ah(async (_req, res) => {
    const [settings, hours, blocked] = await Promise.all([
      getSettings(),
      prisma.businessHours.findMany({ orderBy: { dayOfWeek: 'asc' } }),
      prisma.blockedDate.findMany({ where: { date: { gte: new Date().toISOString().slice(0, 10) } }, orderBy: { date: 'asc' } }),
    ]);
    res.json({ settings, hours, blocked });
  }),
);

router.put(
  '/settings',
  validate(settingsSchema),
  ah(async (req, res) => {
    const data = { ...req.body };
    const current = await getSettings();
    // Geocode the business address if it changed and no coordinates were given.
    if (data.businessAddress && data.businessAddress !== current.businessAddress && data.businessLat == null) {
      const g = await geocode(data.businessAddress);
      if (g) Object.assign(data, { businessLat: g.lat, businessLng: g.lng });
    }
    res.json({ settings: await prisma.settings.update({ where: { id: 1 }, data }) });
  }),
);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
router.put(
  '/hours',
  validate(z.object({ hours: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: hhmm, closeTime: hhmm, closed: z.boolean() })).length(7) })),
  ah(async (req, res) => {
    for (const h of req.body.hours) {
      if (!h.closed && h.openTime >= h.closeTime) throw new HttpError(400, 'Closing time must be after opening time');
    }
    await prisma.$transaction(req.body.hours.map((h) => prisma.businessHours.upsert({ where: { dayOfWeek: h.dayOfWeek }, update: h, create: h })));
    res.json({ hours: await prisma.businessHours.findMany({ orderBy: { dayOfWeek: 'asc' } }) });
  }),
);

router.post(
  '/blocked-dates',
  validate(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().max(200).default('') })),
  ah(async (req, res) => {
    const blocked = await prisma.blockedDate.upsert({ where: { date: req.body.date }, update: { reason: req.body.reason }, create: req.body });
    res.status(201).json({ blocked });
  }),
);

router.delete(
  '/blocked-dates/:id',
  ah(async (req, res) => {
    await prisma.blockedDate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

export default router;
