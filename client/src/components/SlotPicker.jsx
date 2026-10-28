import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { useApp } from '../context/AppContext.jsx';
import { Spinner } from './ui.jsx';

// Pick a day (only days with open slots are enabled) and then a time slot.
export default function SlotPicker({ quoteId, bookingId, value, onChange }) {
  const { tz } = useApp();
  const zone = tz || 'local';
  const today = DateTime.now().setZone(zone).startOf('day');
  const [month, setMonth] = useState(today.startOf('month'));
  const [days, setDays] = useState({});
  const [loadingDays, setLoadingDays] = useState(false);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const from = month < today ? today : month;
    const n = Math.ceil(month.endOf('month').diff(from, 'days').days);
    if (n <= 0) return;
    setLoadingDays(true);
    api
      .get(`/public/availability/days${qs({ from: from.toISODate(), days: n, quoteId, bookingId })}`)
      .then((r) => setDays((d) => ({ ...d, ...r.days })))
      .catch(setError)
      .finally(() => setLoadingDays(false));
  }, [month.toISODate(), quoteId, bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!date) return;
    setSlots(null);
    api
      .get(`/public/availability/slots${qs({ date, quoteId, bookingId })}`)
      .then((r) => setSlots(r.slots))
      .catch(setError);
  }, [date, quoteId, bookingId]);

  const grid = useMemo(() => {
    const start = month.startOf('month');
    const lead = start.weekday % 7; // Sunday first
    const cells = Array.from({ length: lead }, () => null);
    for (let d = 0; d < start.daysInMonth; d++) cells.push(start.plus({ days: d }));
    return cells;
  }, [month]);

  const firstAvailable = Object.entries(days).find(([, n]) => n > 0)?.[0];

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="btn-ghost p-2" disabled={month <= today.startOf('month')} onClick={() => setMonth(month.minus({ months: 1 }))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="font-semibold">{month.toFormat('LLLL yyyy')}</p>
          <button type="button" className="btn-ghost p-2" onClick={() => setMonth(month.plus({ months: 1 }))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
          {grid.map((d, i) => {
            if (!d) return <span key={i} />;
            const iso = d.toISODate();
            const open = days[iso] > 0;
            const sel = iso === date;
            return (
              <button
                key={iso}
                type="button"
                disabled={!open}
                onClick={() => setDate(iso)}
                className={`aspect-square rounded-lg text-sm font-medium transition ${
                  sel ? 'bg-brand-600 text-white' : open ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'text-slate-300'
                }`}
              >
                {d.day}
              </button>
            );
          })}
        </div>
        {loadingDays && <Spinner className="mx-auto mt-3 h-4 w-4" />}
        {!loadingDays && !date && firstAvailable && (
          <p className="mt-3 text-xs text-slate-500">
            Next available: <button type="button" className="font-medium text-brand-700 underline" onClick={() => setDate(firstAvailable)}>{DateTime.fromISO(firstAvailable).toFormat('ccc, LLL d')}</button>
          </p>
        )}
      </div>

      <div>
        <p className="mb-3 font-semibold">{date ? DateTime.fromISO(date).toFormat('cccc, LLLL d') : 'Choose a day'}</p>
        {error && <p className="text-sm text-red-600">{error.message}</p>}
        {date && !slots && <Spinner />}
        {slots && !slots.some((s) => s.available) && <p className="text-sm text-slate-500">No times left on this day.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots
            ?.filter((s) => s.available)
            .map((s) => {
              const sel = value?.start === s.start;
              return (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => onChange(s)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${sel ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white hover:border-brand-400'}`}
                >
                  {DateTime.fromISO(s.start).setZone(zone).toFormat('h:mm a')}
                </button>
              );
            })}
        </div>
        {tz && <p className="mt-3 text-xs text-slate-400">Times shown in {tz.replace('_', ' ')}</p>}
      </div>
    </div>
  );
}
