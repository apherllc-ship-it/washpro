import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtRange, money } from '../../lib/format.js';
import { PageHeader, PageLoader, Empty, StatusBadge, RowLink } from '../../components/ui.jsx';

export default function CustomerBookings() {
  const { tz } = useApp();
  const { data } = useApi('/bookings', { pollMs: 30000 });
  if (!data) return <PageLoader />;
  const upcoming = data.bookings.filter((b) => !['COMPLETED', 'CANCELLED'].includes(b.status)).reverse();
  const past = data.bookings.filter((b) => ['COMPLETED', 'CANCELLED'].includes(b.status));

  const List = ({ items }) => (
    <div className="card divide-y divide-slate-100">
      {items.map((b) => (
        <RowLink key={b.id} to={`/app/bookings/${b.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{fmtRange(b.start, b.end, tz)}</p>
              <p className="truncate text-xs text-slate-500">
                #{b.number} · {b.quote.items.map((i) => i.serviceName).join(', ')}
                {b.pro && ` · ${b.pro.name}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={b.status} />
              <span className="text-sm font-semibold">{money(b.total)}</span>
            </div>
          </div>
        </RowLink>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="My bookings" />
      {!data.bookings.length && (
        <Empty icon={CalendarDays} title="No bookings yet" action={<Link to="/quote" className="btn-primary">Get a quote</Link>}>
          Book a cleaning after confirming a quote.
        </Empty>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-base">Upcoming</h2>
          <List items={upcoming} />
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-base">History</h2>
          <List items={past} />
        </section>
      )}
    </div>
  );
}
