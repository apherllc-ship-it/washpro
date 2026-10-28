import { Link } from 'react-router-dom';
import { Calculator, CalendarDays, FileText, MapPin, User } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtRange, money, fmtDate } from '../../lib/format.js';
import { StatusBadge, QuoteBadge, PageLoader, Empty, RowLink } from '../../components/ui.jsx';
import { StatusTimeline } from '../../components/BookingParts.jsx';

export default function CustomerDashboard() {
  const { user, tz } = useApp();
  const { data: b } = useApi('/bookings', { pollMs: 20000 });
  const { data: q } = useApi('/quotes');
  if (!b || !q) return <PageLoader />;

  const active = b.bookings.filter((x) => !['COMPLETED', 'CANCELLED'].includes(x.status)).sort((x, y) => new Date(x.start) - new Date(y.start));
  const next = active[0];
  const openQuotes = q.quotes.filter((x) => ['PENDING', 'CONFIRMED'].includes(x.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Hi, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">Here's what's happening with your property.</p>
      </div>

      {next ? <NextBooking id={next.id} tz={tz} /> : (
        <Empty icon={CalendarDays} title="No upcoming appointments" action={<Link to="/quote" className="btn-primary"><Calculator className="h-4 w-4" /> Get an instant quote</Link>}>
          Measure your property and book online in a couple of minutes.
        </Empty>
      )}

      {openQuotes.length > 0 && (
        <section>
          <h2 className="mb-2 text-base">Quotes waiting for you</h2>
          <div className="card divide-y divide-slate-100">
            {openQuotes.map((x) => (
              <RowLink key={x.id} to={`/app/quotes/${x.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">Quote #{x.number} · {x.items.map((i) => i.serviceName).join(', ')}</p>
                    <p className="truncate text-xs text-slate-500">{x.address} · valid until {fmtDate(x.validUntil, tz)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <QuoteBadge status={x.status} />
                    <span className="text-sm font-semibold">{money(x.total)}</span>
                  </div>
                </div>
              </RowLink>
            ))}
          </div>
        </section>
      )}

      {active.length > 1 && (
        <section>
          <h2 className="mb-2 text-base">Other upcoming</h2>
          <div className="card divide-y divide-slate-100">
            {active.slice(1).map((x) => (
              <RowLink key={x.id} to={`/app/bookings/${x.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">{fmtRange(x.start, x.end, tz)}</p>
                  <StatusBadge status={x.status} />
                </div>
              </RowLink>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/quote" className="card flex items-center gap-3 p-4 hover:border-brand-300"><Calculator className="h-5 w-5 text-brand-600" /><span className="text-sm font-medium">New quote</span></Link>
        <Link to="/app/bookings" className="card flex items-center gap-3 p-4 hover:border-brand-300"><FileText className="h-5 w-5 text-brand-600" /><span className="text-sm font-medium">Booking history</span></Link>
        <Link to="/app/profile" className="card flex items-center gap-3 p-4 hover:border-brand-300"><User className="h-5 w-5 text-brand-600" /><span className="text-sm font-medium">Profile & addresses</span></Link>
      </div>
    </div>
  );
}

function NextBooking({ id, tz }) {
  const { data } = useApi(`/bookings/${id}`, { pollMs: 15000 });
  if (!data) return <div className="card h-48 animate-pulse" />;
  const bk = data.booking;
  return (
    <Link to={`/app/bookings/${id}`} className="card block p-5 hover:border-brand-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-brand-700">Next appointment · #{bk.number}</p>
          <p className="mt-1 text-lg font-semibold">{fmtRange(bk.start, bk.end, tz)}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" /> {bk.address}</p>
          {bk.pro && <p className="mt-1 text-sm text-slate-600">Technician: <span className="font-medium">{bk.pro.name}</span></p>}
        </div>
        <div className="text-right">
          <StatusBadge status={bk.status} />
          <p className="mt-2 text-lg font-semibold">{money(bk.total)}</p>
        </div>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <StatusTimeline booking={bk} />
      </div>
    </Link>
  );
}
