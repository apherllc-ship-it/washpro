// Optional Stripe Checkout for booking deposits.
import Stripe from 'stripe';
import { config } from '../config.js';
import { prisma, getSettings } from '../db.js';
import { notifyBookingStatus, notifyAdmins } from './notify.js';

export const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

export async function createDepositCheckout(booking, customerEmail) {
  if (!stripe || booking.depositAmount <= 0) return null;
  const settings = await getSettings();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: config.stripe.currency,
          unit_amount: Math.round(booking.depositAmount * 100),
          product_data: { name: `${settings.businessName} – deposit for booking #${booking.number}` },
        },
      },
    ],
    metadata: { bookingId: booking.id },
    success_url: `${config.appUrl}/app/bookings/${booking.id}?deposit=success`,
    cancel_url: `${config.appUrl}/app/bookings/${booking.id}?deposit=cancelled`,
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { stripeSessionId: session.id } });
  return session.url;
}

// Express handler – must receive the raw request body.
export async function stripeWebhook(req, res) {
  if (!stripe || !config.stripe.webhookSecret) return res.status(400).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
    const bookingId = event.data.object.metadata?.bookingId;
    const booking = bookingId && (await prisma.booking.findUnique({ where: { id: bookingId } }));
    if (booking && booking.depositStatus !== 'PAID') {
      const confirm = booking.status === 'REQUESTED';
      await prisma.$transaction([
        prisma.booking.update({ where: { id: booking.id }, data: { depositStatus: 'PAID', ...(confirm ? { status: 'CONFIRMED' } : {}) } }),
        prisma.bookingEvent.create({
          data: { bookingId: booking.id, status: confirm ? 'CONFIRMED' : booking.status, note: `Deposit of $${booking.depositAmount.toFixed(2)} received` },
        }),
      ]);
      await notifyBookingStatus(booking.id, { extra: 'Your deposit was received.' }).catch(() => {});
      await notifyAdmins(`Deposit paid for booking #${booking.number}`, `$${booking.depositAmount.toFixed(2)}`, `/admin/bookings/${booking.id}`).catch(() => {});
    }
  }
  res.json({ received: true });
}
