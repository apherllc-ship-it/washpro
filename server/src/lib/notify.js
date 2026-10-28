// Email (SMTP via nodemailer), SMS (Twilio) and in-app notifications.
// When SMTP / Twilio are not configured, messages are logged to the console instead.
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { prisma, getSettings } from '../db.js';

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

const sms = config.twilio.sid && config.twilio.token && config.twilio.from ? twilio(config.twilio.sid, config.twilio.token) : null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(businessName, title, bodyHtml, cta) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
  <tr><td style="background:#0369a1;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">${esc(businessName)}</td></tr>
  <tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${bodyHtml}
  ${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta.url)}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(cta.label)}</a></p>` : ''}
  </td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail({ to, subject, title, html, text, cta }) {
  const settings = await getSettings();
  const full = layout(settings.businessName, title || subject, html, cta);
  if (!transporter) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text || ''}${cta ? `\n${cta.label}: ${cta.url}` : ''}`);
    return;
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, html: full, text: text || subject });
  } catch (err) {
    console.error('Email failed:', err.message);
  }
}

export async function sendSms(to, body) {
  if (!to) return;
  if (!sms) {
    console.log(`[sms:dev] to=${to} ${body}`);
    return;
  }
  try {
    await sms.messages.create({ to, from: config.twilio.from, body });
  } catch (err) {
    console.error('SMS failed:', err.message);
  }
}

export async function notifyInApp(userId, title, body, link) {
  await prisma.notification.create({ data: { userId, title, body, link } });
}

export const STATUS_LABEL = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  SCHEDULED: 'Scheduled',
  ON_THE_WAY: 'On the way',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_MESSAGE = {
  REQUESTED: 'We received your booking request and will confirm it shortly.',
  CONFIRMED: 'Your appointment is confirmed.',
  SCHEDULED: 'A technician has been assigned to your appointment.',
  ON_THE_WAY: 'Your technician is on the way!',
  IN_PROGRESS: 'Your technician has started the job.',
  COMPLETED: 'Your job is complete. Thank you for choosing us!',
  CANCELLED: 'Your appointment has been cancelled.',
};

export function formatWhen(date, tz) {
  return DateTime.fromJSDate(date).setZone(tz).toFormat("ccc, LLL d 'at' h:mm a");
}

// Sends email + SMS + in-app notification to the customer about a booking update.
export async function notifyBookingStatus(bookingId, { headline, extra } = {}) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, pro: true },
  });
  if (!booking) return;
  const settings = await getSettings();
  const when = formatWhen(booking.start, settings.timezone);
  const title = headline || `Booking #${booking.number}: ${STATUS_LABEL[booking.status]}`;
  const message = `${STATUS_MESSAGE[booking.status]}${extra ? ` ${extra}` : ''}`;
  const link = `/app/bookings/${booking.id}`;

  await notifyInApp(booking.customerId, title, `${message} (${when})`, link);

  await sendEmail({
    to: booking.customer.email,
    subject: title,
    title,
    text: `${message}\n${when}\n${booking.address}`,
    html: `<p>${esc(message)}</p>
      <table cellpadding="4" style="font-size:14px">
        <tr><td style="color:#64748b">When</td><td>${esc(when)}</td></tr>
        <tr><td style="color:#64748b">Where</td><td>${esc(booking.address)}</td></tr>
        <tr><td style="color:#64748b">Total</td><td>$${booking.total.toFixed(2)}</td></tr>
        ${booking.pro ? `<tr><td style="color:#64748b">Technician</td><td>${esc(booking.pro.name)}</td></tr>` : ''}
        <tr><td style="color:#64748b">Status</td><td>${esc(STATUS_LABEL[booking.status])}</td></tr>
      </table>`,
    cta: { label: 'View booking', url: `${config.appUrl}${link}` },
  });

  if (booking.customer.smsOptIn && booking.customer.phone) {
    await sendSms(booking.customer.phone, `${settings.businessName}: ${message} ${when}. ${config.appUrl}${link}`);
  }
}

// Notifies all admins (in-app + email) – used for new requests and cancellations.
export async function notifyAdmins(title, body, link) {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true } });
  await Promise.all(
    admins.map(async (a) => {
      await notifyInApp(a.id, title, body, link);
      await sendEmail({ to: a.email, subject: title, title, text: body, html: `<p>${esc(body)}</p>`, cta: link ? { label: 'Open', url: `${config.appUrl}${link}` } : undefined });
    }),
  );
}

export async function notifyPro(proId, title, body, link) {
  const pro = await prisma.user.findUnique({ where: { id: proId } });
  if (!pro) return;
  await notifyInApp(pro.id, title, body, link);
  await sendEmail({ to: pro.email, subject: title, title, text: body, html: `<p>${esc(body)}</p>`, cta: link ? { label: 'Open job', url: `${config.appUrl}${link}` } : undefined });
  if (pro.smsOptIn && pro.phone) await sendSms(pro.phone, `${title}: ${body}`);
}
