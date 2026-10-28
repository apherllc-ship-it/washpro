import { DateTime } from 'luxon';

export const money = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const money0 = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const num = (n, d = 0) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: d });

export const UNIT = { SQFT: 'sq ft', LINFT: 'linear ft', FLAT: 'flat' };
export const UNIT_SHORT = { SQFT: 'sq ft', LINFT: 'ft', FLAT: '' };

export const fmt = (iso, tz, f = "ccc, LLL d 'at' h:mm a") => (iso ? DateTime.fromISO(String(iso)).setZone(tz || 'local').toFormat(f) : '');
export const fmtDate = (iso, tz) => fmt(iso, tz, 'LLL d, yyyy');
export const fmtTime = (iso, tz) => fmt(iso, tz, 'h:mm a');
export const fmtRange = (start, end, tz) => `${fmt(start, tz, "ccc, LLL d · h:mm a")} – ${fmt(end, tz, 'h:mm a')}`;
export const ago = (iso) => DateTime.fromISO(String(iso)).toRelative();

export const STATUS = {
  REQUESTED: { label: 'Requested', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  ON_THE_WAY: { label: 'On the way', cls: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600', dot: 'bg-slate-400' },
};

export const QUOTE_STATUS = {
  PENDING: { label: 'Awaiting confirmation', cls: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { label: 'Confirmed – ready to book', cls: 'bg-sky-100 text-sky-800' },
  BOOKED: { label: 'Booked', cls: 'bg-emerald-100 text-emerald-800' },
  EXPIRED: { label: 'Expired', cls: 'bg-slate-200 text-slate-600' },
};

export const CATEGORY = { POWER_WASH: 'Power Washing', SOFT_WASH: 'Soft Washing' };
