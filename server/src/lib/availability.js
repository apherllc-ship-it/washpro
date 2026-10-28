// Time-slot availability. A slot is open when fewer than `crews` active bookings
// overlap it. All times are computed in the business timezone.
import { DateTime } from 'luxon';
import { prisma, getSettings } from '../db.js';
import { HttpError } from '../middleware/error.js';

const ACTIVE = { notIn: ['CANCELLED'] };
const BOOKING_LOCK_KEY = 724001; // pg advisory lock id used to serialize bookings

function parseTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

function countOverlaps(bookings, start, end) {
  return bookings.filter((b) => b.start < end && b.end > start).length;
}

async function loadContext(fromDate, toDate, excludeBookingId) {
  const settings = await getSettings();
  const [hours, blocked, bookings] = await Promise.all([
    prisma.businessHours.findMany(),
    prisma.blockedDate.findMany(),
    prisma.booking.findMany({
      where: {
        status: ACTIVE,
        start: { lt: toDate },
        end: { gt: fromDate },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { id: true, start: true, end: true },
    }),
  ]);
  return {
    settings,
    hoursByDay: new Map(hours.map((h) => [h.dayOfWeek, h])),
    blocked: new Set(blocked.map((b) => b.date)),
    bookings,
  };
}

function slotsForDay(ctx, dateStr, durationMinutes) {
  const { settings } = ctx;
  const tz = settings.timezone;
  const day = DateTime.fromISO(dateStr, { zone: tz }).startOf('day');
  if (!day.isValid) return [];
  const now = DateTime.now().setZone(tz);
  const earliest = now.plus({ hours: settings.bookingLeadHours });
  const latestDay = now.startOf('day').plus({ days: settings.bookingHorizonDays });
  if (day > latestDay || ctx.blocked.has(day.toISODate())) return [];

  const hours = ctx.hoursByDay.get(day.weekday % 7); // luxon: Mon=1..Sun=7 → 0..6
  if (!hours || hours.closed) return [];

  const open = parseTime(day, hours.openTime);
  const close = parseTime(day, hours.closeTime);
  const step = settings.slotIntervalMinutes || 60;
  const slots = [];
  for (let s = open; s.plus({ minutes: durationMinutes }) <= close; s = s.plus({ minutes: step })) {
    if (s < earliest) continue;
    const start = s.toJSDate();
    const end = s.plus({ minutes: durationMinutes }).toJSDate();
    const used = countOverlaps(ctx.bookings, start, end);
    const remaining = Math.max(0, settings.crews - used);
    slots.push({ start: start.toISOString(), end: end.toISOString(), label: s.toFormat('h:mm a'), remaining, available: remaining > 0 });
  }
  return slots;
}

export async function getDaySlots(dateStr, durationMinutes, excludeBookingId) {
  const settings = await getSettings();
  const day = DateTime.fromISO(dateStr, { zone: settings.timezone }).startOf('day');
  if (!day.isValid) throw new HttpError(400, 'Invalid date');
  const ctx = await loadContext(day.toJSDate(), day.plus({ days: 1 }).toJSDate(), excludeBookingId);
  return slotsForDay(ctx, dateStr, durationMinutes);
}

// Returns { 'YYYY-MM-DD': number of open slots } for each day in [from, from+days).
export async function getRangeAvailability(fromStr, days, durationMinutes, excludeBookingId) {
  const settings = await getSettings();
  const start = DateTime.fromISO(fromStr, { zone: settings.timezone }).startOf('day');
  if (!start.isValid) throw new HttpError(400, 'Invalid date');
  const n = Math.min(Math.max(days, 1), 62);
  const ctx = await loadContext(start.toJSDate(), start.plus({ days: n }).toJSDate(), excludeBookingId);
  const out = {};
  for (let i = 0; i < n; i++) {
    const d = start.plus({ days: i }).toISODate();
    out[d] = slotsForDay(ctx, d, durationMinutes).filter((s) => s.available).length;
  }
  return out;
}

// Runs `create` inside a transaction that holds a global booking lock, after
// re-checking that the requested slot is valid and still has a free crew.
// This is what prevents double booking when two customers click at once.
export async function withReservedSlot(startIso, durationMinutes, { excludeBookingId } = {}, create) {
  const settings = await getSettings();
  const start = DateTime.fromISO(startIso, { zone: settings.timezone });
  if (!start.isValid) throw new HttpError(400, 'Invalid time slot');
  const dateStr = start.toISODate();

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;
      const dayStart = start.startOf('day').toJSDate();
      const dayEnd = start.startOf('day').plus({ days: 1 }).toJSDate();
      const [hours, blocked, bookings] = await Promise.all([
        tx.businessHours.findMany(),
        tx.blockedDate.findMany({ where: { date: dateStr } }),
        tx.booking.findMany({
          where: { status: ACTIVE, start: { lt: dayEnd }, end: { gt: dayStart }, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) },
          select: { id: true, start: true, end: true },
        }),
      ]);
      const ctx = { settings, hoursByDay: new Map(hours.map((h) => [h.dayOfWeek, h])), blocked: new Set(blocked.map((b) => b.date)), bookings };
      const slot = slotsForDay(ctx, dateStr, durationMinutes).find((s) => new Date(s.start).getTime() === start.toJSDate().getTime());
      if (!slot) throw new HttpError(400, 'That time is outside business hours or no longer bookable');
      if (!slot.available) throw new HttpError(409, 'Sorry, that time was just booked. Please choose another slot.');
      return create(tx, { start: new Date(slot.start), end: new Date(slot.end) });
    },
    { timeout: 15000 },
  );
}

// True if the pro already has an overlapping active job.
export async function proHasConflict(proId, start, end, excludeBookingId) {
  const n = await prisma.booking.count({
    where: { proId, status: ACTIVE, start: { lt: end }, end: { gt: start }, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) },
  });
  return n > 0;
}
