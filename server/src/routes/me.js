// The signed-in user's own profile, saved addresses and notifications.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { publicUser } from '../middleware/auth.js';

const router = Router();

router.patch(
  '/',
  validate(
    z.object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(30).regex(/^[+0-9()\-.\s]*$/, 'Enter a valid phone number').optional(),
      smsOptIn: z.boolean().optional(),
    }),
  ),
  ah(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.user.id }, data: req.body });
    res.json({ user: publicUser(user) });
  }),
);

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  formatted: z.string().trim().min(5, 'Enter a full address').max(300),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  placeId: z.string().max(300).nullable().optional(),
  isDefault: z.boolean().optional(),
});

router.get(
  '/addresses',
  ah(async (req, res) => {
    const addresses = await prisma.address.findMany({ where: { userId: req.user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    res.json({ addresses });
  }),
);

router.post(
  '/addresses',
  validate(addressSchema),
  ah(async (req, res) => {
    const count = await prisma.address.count({ where: { userId: req.user.id } });
    if (count >= 20) throw new HttpError(400, 'Address limit reached');
    const isDefault = req.body.isDefault || count === 0;
    if (isDefault) await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    const address = await prisma.address.create({ data: { ...req.body, isDefault, userId: req.user.id } });
    res.status(201).json({ address });
  }),
);

router.patch(
  '/addresses/:id',
  validate(addressSchema.partial()),
  ah(async (req, res) => {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) throw new HttpError(404, 'Address not found');
    if (req.body.isDefault) await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    const address = await prisma.address.update({ where: { id: existing.id }, data: req.body });
    res.json({ address });
  }),
);

router.delete(
  '/addresses/:id',
  ah(async (req, res) => {
    const { count } = await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!count) throw new HttpError(404, 'Address not found');
    res.json({ ok: true });
  }),
);

router.get(
  '/notifications',
  ah(async (req, res) => {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);
    res.json({ notifications, unread });
  }),
);

router.post(
  '/notifications/read',
  ah(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  }),
);

export default router;
