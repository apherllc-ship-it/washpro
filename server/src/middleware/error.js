import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wrap async route handlers so thrown errors reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validate req.body / req.query with a zod schema and replace it with the parsed value.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  if (source === 'query') req.validQuery = result.data;
  else req[source] = result.data;
  next();
};

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Please check the highlighted fields',
      fields: Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message])),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  if (err?.code === 'P2002') return res.status(409).json({ error: 'That value is already in use' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Upload too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
