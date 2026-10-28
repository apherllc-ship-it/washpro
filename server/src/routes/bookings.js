// Customer bookings: book a confirmed quote, track, reschedule, cancel, pay deposit.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, getSettings } from '../db.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { withReservedSlot, proHasConflict } from '../lib/availability.js';
import { loadBookingDetail, changeStatus } from '../lib/bookings.js';
import { notifyBookingStatus, notifyAdmins, notifyPro, formatWhen } from '../lib/notify.js';
import { createDepositCheckout, stripe } from '../lib/stripe.js';

const router = Router();

router.post(
  '/',
  validate(z.object({ quoteId: z.string().min(1), start: z.string().datetime({ offset: true }), customerNotes: z.string().max(2000).optional().default('') })),
  ah(async (req, res) => {
    const settings = await getSettings();
    const quote = await prisma.quote.findFirst({ where: { id: req.body.quoteId, customerId: req.user.id } });
    if (!quote) throw new HttpError(404, 'Quote not found');
    if (quote.status !== 'CONFIRMED') throw new HttpError(400, 'Please confirm the quote before booking');
    if (quote.validUntil < new Date()) throw new HttpError(400, 'This quote has expired');

    const wantsDeposit = settings.depositEnabled && !!stripe && quote.deposit > 0;
    const status = settings.autoConfirm && !wantsDeposit ? 'CONFIRMED' : 'REQUESTED';

    const booking = await withReservedSlot(req.body.start, quote.durationMinutes, {}, async (tx, slot) => {
      // Re-check inside the lock so a quote can't be booked twice.
      const fresh = await tx.quote.findUnique({ where: { id: quote.id } });
      if (fresh.status !== 'CONFIRMED') throw new HttpError(409, 'This quote was already booked');
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'BOOKED' } });
      const b = await tx.booking.create({
        data: {
          quoteId: quote.id,
          customerId: req.user.id,
          start: slot.start,
          end: slot.end,
          status,
          address: quote.address,
          lat: quote.lat,
          lng: quote.lng,
          total: quote.total,
          depositAmount: wantsDeposit ? quote.deposit : 0,
          depositStatus: wantsDeposit ? 'PENDING' : 'NONE',
          customerNotes: req.body.customerNotes || quote.customerNotes,
        },
      });
      await tx.bookingEvent.create({ data: { bookingId: b.id, status: 'REQUESTED', note: 'Booked online', actorId: req.user.id } });
      if (status === 'CONFIRMED') await tx.bookingEvent.create({ data: { bookingId: b.id, status: 'CONFIRMED', note: 'Automatically confirmed' } });
      return b;
    });

    let checkoutUrl = null;
    if (wantsDeposit) {
      try {
        checkoutUrl = await createDepositCheckout(booking, req.user.email);
      } catch (e) {
        console.error('Stripe checkout failed:', e.message);
      }
    }

    await notifyBookingStatus(booking.id, { headline: `Booking #${booking.number} received` }).catch((e) => console.error(e));
    await notifyAdmins(
      `New booking #${booking.number}`,
      `${req.user.name} – ${formatWhen(booking.start, settings.timezone)} – ${booking.address}`,
      `/admin/bookings/${booking.id}`,
    ).catch(() => {});

    res.status(201).json({ booking, checkoutUrl });
  }),
);

router.get(
  '/',
  ah(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { customerId: req.user.id },
      orderBy: { start: 'desc' },
      include: { pro: { select: { name: true } }, quote: { select: { number: true, items: { select: { serviceName: true } } } }, photos: { select: { id: true, kind: true } } },
    });
    res.json({ bookings });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const settings = await getSettings();
    const booking = await loadBookingDetail(req.params.id, req.user);
    const hoursUntil = (booking.start - Date.now()) / 3600000;
    const changeable = ['REQUESTED', 'CONFIRMED', 'SCHEDULED'].includes(booking.status) && hoursUntil >= settings.cancelWindowHours;
    res.json({ booking, canChange: changeable, cancelWindowHours: settings.cancelWindowHours });
  }),
);

async function ownChangeable(req) {
  const settings = await getSettings();
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, customerId: req.user.id } });
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (!['REQUESTED', 'CONFIRMED', 'SCHEDULED'].includes(booking.status)) throw new HttpError(400, 'This booking can no longer be changed');
  if ((booking.start - Date.now()) / 3600000 < settings.cancelWindowHours) {
    throw new HttpError(400, `Changes must be made at least ${settings.cancelWindowHours} hours before the appointment. Please call us.`);
  }
  return { booking, settings };
}

router.post(
  '/:id/cancel',
  validate(z.object({ reason: z.string().max(500).optional().default('') })),
  ah(async (req, res) => {
    const { booking } = await ownChangeable(req);
    await changeStatus(booking.id, 'CANCELLED', req.user, req.body.reason ? `Cancelled by customer: ${req.body.reason}` : 'Cancelled by customer', { override: true });
    await prisma.quote.update({ where: { id: booking.quoteId }, data: { status: 'CONFIRMED' } }).catch(() => {});
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/reschedule',
  validate(z.object({ start: z.string().datetime({ offset: true }) })),
  ah(async (req, res) => {
    const { booking, settings } = await ownChangeable(req);
    const duration = Math.round((booking.end - booking.start) / 60000);
    const updated = await withReservedSlot(req.body.start, duration, { excludeBookingId: booking.id }, async (tx, slot) => {
      let proId = booking.proId;
      let status = booking.status;
      let note = `Rescheduled to ${formatWhen(slot.start, settings.timezone)}`;
      if (proId && (await proHasConflict(proId, slot.start, slot.end, booking.id))) {
        proId = null;
        status = 'CONFIRMED';
        note += ' (technician will be reassigned)';
      }
      const b = await tx.booking.update({ where: { id: booking.id }, data: { start: slot.start, end: slot.end, proId, status } });
      await tx.bookingEvent.create({ data: { bookingId: booking.id, status, note, actorId: req.user.id } });
      return { b, note, previousPro: booking.proId, proChanged: proId !== booking.proId };
    });
    await notifyBookingStatus(booking.id, { headline: `Booking #${booking.number} rescheduled` }).catch(() => {});
    await notifyAdmins(`Booking #${booking.number} rescheduled`, updated.note, `/admin/bookings/${booking.id}`).catch(() => {});
    if (updated.previousPro) await notifyPro(updated.previousPro, `Job #${booking.number} rescheduled`, updated.note, `/pro/jobs/${booking.id}`).catch(() => {});
    res.json({ booking: updated.b });
  }),
);

router.post(
  '/:id/deposit',
  ah(async (req, res) => {
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, customerId: req.user.id } });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.depositStatus !== 'PENDING' || booking.status === 'CANCELLED') throw new HttpError(400, 'No deposit is due');
    const url = await createDepositCheckout(booking, req.user.email);
    if (!url) throw new HttpError(400, 'Online payments are not available');
    res.json({ checkoutUrl: url });
  }),
);

export default router;
