// Customer quotes: save, list, view, confirm.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, getSettings } from '../db.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { calculateQuote } from '../lib/pricing.js';
import { quoteInputSchema } from './public.js';
import { notifyAdmins } from '../lib/notify.js';

const router = Router();

export async function saveQuote(customerId, input) {
  const q = await calculateQuote(input);
  if (q.outOfArea) throw new HttpError(400, `Sorry, this address is ${q.distanceMiles} miles away – outside our service area.`);
  const settings = await getSettings();
  return prisma.quote.create({
    data: {
      customerId,
      address: q.address,
      lat: q.lat,
      lng: q.lng,
      distanceMiles: q.distanceMiles,
      subtotal: q.subtotal,
      travelFee: q.travelFee,
      tax: q.tax,
      total: q.total,
      deposit: q.deposit,
      durationMinutes: q.durationMinutes,
      customerNotes: input.customerNotes || '',
      validUntil: new Date(Date.now() + settings.quoteValidDays * 86400000),
      items: {
        create: q.items.map((i) => ({
          serviceId: i.serviceId,
          serviceName: i.serviceName,
          label: i.label,
          unit: i.unit,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          materialName: i.materialName,
          multiplier: i.multiplier,
          baseAmount: i.baseAmount,
          minimumApplied: i.minimumApplied,
          addOns: i.addOns,
          lineTotal: i.lineTotal,
          geometry: i.geometry || undefined,
        })),
      },
    },
    include: { items: true },
  });
}

// Expire stale unbooked quotes lazily when listing.
async function expireOld(where) {
  await prisma.quote.updateMany({ where: { ...where, status: { in: ['PENDING', 'CONFIRMED'] }, validUntil: { lt: new Date() } }, data: { status: 'EXPIRED' } });
}

router.post(
  '/',
  validate(quoteInputSchema),
  ah(async (req, res) => {
    const quote = await saveQuote(req.user.id, req.body);
    await notifyAdmins(`New quote #${quote.number}`, `${req.user.name} – $${quote.total.toFixed(2)} – ${quote.address}`, `/admin/quotes`).catch(() => {});
    res.status(201).json({ quote });
  }),
);

router.get(
  '/',
  ah(async (req, res) => {
    await expireOld({ customerId: req.user.id });
    const quotes = await prisma.quote.findMany({
      where: { customerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true, booking: { select: { id: true, status: true, start: true } } },
    });
    res.json({ quotes });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { items: true, booking: { select: { id: true, status: true, start: true } }, customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!quote || (quote.customerId !== req.user.id && req.user.role !== 'ADMIN')) throw new HttpError(404, 'Quote not found');
    res.json({ quote });
  }),
);

router.post(
  '/:id/confirm',
  validate(z.object({ accept: z.literal(true, { errorMap: () => ({ message: 'Please accept the quote' }) }) })),
  ah(async (req, res) => {
    const quote = await prisma.quote.findFirst({ where: { id: req.params.id, customerId: req.user.id } });
    if (!quote) throw new HttpError(404, 'Quote not found');
    if (quote.validUntil < new Date()) {
      await prisma.quote.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } });
      throw new HttpError(400, 'This quote has expired. Please request a new one.');
    }
    if (quote.status !== 'PENDING' && quote.status !== 'CONFIRMED') throw new HttpError(400, 'This quote can no longer be confirmed');
    const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status: 'CONFIRMED', confirmedAt: quote.confirmedAt || new Date() } });
    res.json({ quote: updated });
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const quote = await prisma.quote.findFirst({ where: { id: req.params.id, customerId: req.user.id } });
    if (!quote) throw new HttpError(404, 'Quote not found');
    if (quote.status === 'BOOKED') throw new HttpError(400, 'Booked quotes cannot be deleted');
    await prisma.quote.delete({ where: { id: quote.id } });
    res.json({ ok: true });
  }),
);

export default router;
