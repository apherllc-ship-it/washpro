// Shared job actions for pros and admins (notes, photos) plus the pro's own job list.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, validate, HttpError } from '../middleware/error.js';
import { requireRole } from '../middleware/auth.js';
import { changeStatus, loadBookingDetail } from '../lib/bookings.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)),
});

// Ensures the current user is the assigned pro, or an admin.
async function jobForStaff(req) {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking || (req.user.role !== 'ADMIN' && booking.proId !== req.user.id)) throw new HttpError(404, 'Job not found');
  return booking;
}

export const staffJobRouter = Router({ mergeParams: true });

staffJobRouter.post(
  '/:id/notes',
  validate(z.object({ body: z.string().trim().min(1).max(4000), internal: z.boolean().optional().default(true) })),
  ah(async (req, res) => {
    const booking = await jobForStaff(req);
    const note = await prisma.jobNote.create({
      data: { bookingId: booking.id, authorId: req.user.id, body: req.body.body, internal: req.body.internal },
      include: { author: { select: { name: true, role: true } } },
    });
    res.status(201).json({ note });
  }),
);

staffJobRouter.post(
  '/:id/photos',
  upload.array('photos', 10),
  ah(async (req, res) => {
    const booking = await jobForStaff(req);
    const kind = ['BEFORE', 'AFTER', 'OTHER'].includes(req.body.kind) ? req.body.kind : 'OTHER';
    const caption = String(req.body.caption || '').slice(0, 200);
    if (!req.files?.length) throw new HttpError(400, 'Choose at least one image (JPG, PNG or WebP, up to 8 MB)');
    const photos = [];
    for (const f of req.files) {
      photos.push(
        await prisma.photo.create({
          data: { bookingId: booking.id, uploaderId: req.user.id, kind, caption, mimeType: f.mimetype, size: f.size, data: f.buffer },
          select: { id: true, kind: true, caption: true, createdAt: true },
        }),
      );
    }
    res.status(201).json({ photos });
  }),
);

staffJobRouter.delete(
  '/:id/photos/:photoId',
  ah(async (req, res) => {
    const booking = await jobForStaff(req);
    const { count } = await prisma.photo.deleteMany({ where: { id: req.params.photoId, bookingId: booking.id } });
    if (!count) throw new HttpError(404, 'Photo not found');
    res.json({ ok: true });
  }),
);

// ---- Pro-only ----
export const proRouter = Router();
proRouter.use(requireRole('PRO', 'ADMIN'));

proRouter.get(
  '/jobs',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 90 * 86400000);
    if (isNaN(from) || isNaN(to)) throw new HttpError(400, 'Invalid date range');
    const jobs = await prisma.booking.findMany({
      where: { proId: req.user.id, start: { gte: from, lt: to } },
      orderBy: { start: 'asc' },
      include: { customer: { select: { name: true, phone: true } }, quote: { select: { items: { select: { serviceName: true, quantity: true, unit: true } } } } },
    });
    res.json({ jobs });
  }),
);

proRouter.get(
  '/jobs/:id',
  ah(async (req, res) => {
    res.json({ booking: await loadBookingDetail(req.params.id, req.user) });
  }),
);

proRouter.post(
  '/jobs/:id/status',
  validate(z.object({ status: z.enum(['ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED']), note: z.string().max(1000).optional().default('') })),
  ah(async (req, res) => {
    await jobForStaff(req);
    const booking = await changeStatus(req.params.id, req.body.status, req.user, req.body.note);
    res.json({ booking });
  }),
);

proRouter.use('/jobs', staffJobRouter);

// ---- Photo bytes (customer owner, assigned pro, or admin) ----
export const photoRouter = Router();
photoRouter.get(
  '/:id',
  ah(async (req, res) => {
    const photo = await prisma.photo.findUnique({ where: { id: req.params.id }, include: { booking: { select: { customerId: true, proId: true } } } });
    const u = req.user;
    const allowed = photo && (u.role === 'ADMIN' || photo.booking.customerId === u.id || photo.booking.proId === u.id);
    if (!allowed) throw new HttpError(404, 'Photo not found');
    res.set('Content-Type', photo.mimeType);
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(photo.data));
  }),
);
