import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { STATUS } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';

// Month grid (desktop) + agenda list (mobile) of bookings.
// `month` is a luxon DateTime at the start of a month; jobs have start/end/status.
export default function MonthCalendar({ month, onMonthChange, jobs, linkFor, titleFor }) {
  const { tz } = useApp();
  const zone = tz || 'local';
  const [view, setView] = useState(typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'month');

  const byDay = useMemo(() => {
    const m = new Map();
    for (const j of jobs) {
      const k = DateTime.fromISO(j.start).setZone(zone).toISODate();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(j);
    }
    return m;
  }, [jobs, zone]);

  const cells = useMemo(() => {
    const start = month.startOf('month');
    const first = start.minus({ days: start.weekday % 7 });
    return Array.from({ length: 42 }, (_, i) => first.plus({ days: i }));
  }, [month]);

  const today = DateTime.now().setZone(zone).toISODate();
  const agendaDays = [...byDay.keys()].sort();

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
        <div className="flex items-center gap-1">
          <button className="btn-ghost p-2" onClick={() => onMonthChange(month.minus({ months: 1 }))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="btn-ghost p-2" onClick={() => onMonthChange(month.plus({ months: 1 }))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-1 text-base">{month.toFormat('LLLL yyyy')}</h2>
          <button className="btn-secondary btn-sm ml-2" onClick={() => onMonthChange(DateTime.now().setZone(zone).startOf('month'))}>
            Today
          </button>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {['month', 'agenda'].map((v) => (
            <button key={v} className={`rounded-md px-3 py-1 capitalize ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <div className="grid grid-cols-7 text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="border-b border-slate-100 py-2 text-center font-medium text-slate-500">
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const k = d.toISODate();
            const list = byDay.get(k) || [];
            const inMonth = d.month === month.month;
            return (
              <div key={k} className={`min-h-[96px] border-b border-r border-slate-100 p-1 ${inMonth ? '' : 'bg-slate-50/70'}`}>
                <p className={`mb-1 text-right text-[11px] ${k === today ? 'font-bold text-brand-700' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>{d.day}</p>
                <div className="space-y-1">
                  {list.slice(0, 4).map((j) => (
                    <Link key={j.id} to={linkFor(j)} className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${STATUS[j.status].cls}`} title={titleFor(j)}>
                      {DateTime.fromISO(j.start).setZone(zone).toFormat('h:mma').toLowerCase()} {titleFor(j)}
                    </Link>
                  ))}
                  {list.length > 4 && <p className="px-1 text-[11px] text-slate-500">+{list.length - 4} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {!agendaDays.length && <p className="p-6 text-center text-sm text-slate-500">No jobs this month.</p>}
          {agendaDays.map((k) => (
            <div key={k} className="p-3">
              <p className={`mb-2 text-xs font-semibold uppercase ${k === today ? 'text-brand-700' : 'text-slate-500'}`}>{DateTime.fromISO(k).toFormat('cccc, LLL d')}</p>
              <div className="space-y-2">
                {byDay.get(k).map((j) => (
                  <Link key={j.id} to={linkFor(j)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <span className={`h-10 w-1 rounded-full ${STATUS[j.status].dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{titleFor(j)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {DateTime.fromISO(j.start).setZone(zone).toFormat('h:mm a')} – {DateTime.fromISO(j.end).setZone(zone).toFormat('h:mm a')} · {j.address}
                      </p>
                    </div>
                    <span className={`chip ${STATUS[j.status].cls}`}>{STATUS[j.status].label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
