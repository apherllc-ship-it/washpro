// Booking workflow: status rules, timeline events, detail loading and notifications.
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { notifyBookingStatus, notifyAdmins, notifyPro, STATUS_LABEL } from './notify.js';

export const STATUS_ORDER = ['REQUESTED', 'CONFIRMED', 'SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];

// Normal forward transitions. Admins may also override to any status.
const NEXT = {
  REQUESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ON_THE_WAY', 'IN_PROGRESS', 'CONFIRMED', 'CANCELLED'],
  ON_THE_WAY: ['IN_PROGRESS', 'SCHEDULED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

// What a technician may set from the field.
const PRO_ALLOWED = ['ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];

export function canTransition(from, to, role) {
  if (from === to) return false;
  if (role === 'ADMIN') return true;
  if (role === 'PRO') return PRO_ALLOWED.includes(to) && NEXT[from].includes(to);
  return false;
}

export async function changeStatus(bookingId, status, actor, note = '', { override = false } = {}) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (!override && !canTransition(booking.status, status, actor.role)) {
    throw new HttpError(400, `Can't change status from ${STATUS_LABEL[booking.status]} to ${STATUS_LABEL[status]}`);
  }
  if (['SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'].includes(status) && !booking.proId) {
    throw new HttpError(400, 'Assign a technician first');
  }
  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status } }),
    prisma.bookingEvent.create({ data: { bookingId, status, note, actorId: actor.id } }),
  ]);
  await notifyBookingStatus(bookingId).catch((e) => console.error(e));
  if (status === 'CANCELLED' || status === 'COMPLETED') {
    await notifyAdmins(`Booking #${booking.number} ${STATUS_LABEL[status].toLowerCase()}`, note || `Updated by ${actor.name}`, `/admin/bookings/${bookingId}`).catch(() => {});
  }
  return prisma.booking.findUnique({ where: { id: bookingId } });
}

// Assign (or unassign with null) a technician. Assigning confirms + schedules the job.
export async function assignPro(bookingId, proId, actor) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (['COMPLETED', 'CANCELLED'].includes(booking.status)) throw new HttpError(400, 'This booking is closed');

  if (!proId) {
    const status = ['SCHEDULED'].includes(booking.status) ? 'CONFIRMED' : booking.status;
    await prisma.$transaction([
      prisma.booking.update({ where: { id: bookingId }, data: { proId: null, status } }),
      prisma.bookingEvent.create({ data: { bookingId, status, note: 'Technician unassigned', actorId: actor.id } }),
    ]);
    return;
  }

  const pro = await prisma.user.findFirst({ where: { id: proId, role: { in: ['PRO', 'ADMIN'] }, active: true } });
  if (!pro) throw new HttpError(400, 'Technician not found');
  const { proHasConflict } = await import('./availability.js');
  if (await proHasConflict(proId, booking.start, booking.end, bookingId)) {
    throw new HttpError(409, `${pro.name} already has a job at that time`);
  }
  const status = ['REQUESTED', 'CONFIRMED'].includes(booking.status) ? 'SCHEDULED' : booking.status;
  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { proId, status } }),
    prisma.bookingEvent.create({ data: { bookingId, status, note: `Assigned to ${pro.name}`, actorId: actor.id } }),
  ]);
  await notifyBookingStatus(bookingId).catch((e) => console.error(e));
  await notifyPro(proId, `New job #${booking.number}`, `${booking.address}`, `/pro/jobs/${bookingId}`).catch(() => {});
}

const userBrief = { select: { id: true, name: true, email: true, phone: true } };

export async function loadBookingDetail(id, viewer) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: userBrief,
      pro: userBrief,
      quote: { include: { items: true } },
      events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true, role: true } } } },
      notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true, role: true } } } },
      photos: { orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, caption: true, createdAt: true, uploaderId: true } },
    },
  });
  if (!booking) throw new HttpError(404, 'Booking not found');

  const isOwner = booking.customerId === viewer.id;
  const isPro = booking.proId === viewer.id;
  if (viewer.role !== 'ADMIN' && !isOwner && !isPro) throw new HttpError(404, 'Booking not found');

  if (viewer.role === 'CUSTOMER') {
    booking.notes = booking.notes.filter((n) => !n.internal);
    // Customers see technician name only
    if (booking.pro) booking.pro = { id: booking.pro.id, name: booking.pro.name };
  }
  return booking;
}

export async function addEvent(bookingId, status, note, actorId) {
  return prisma.bookingEvent.create({ data: { bookingId, status, note, actorId } });
}
