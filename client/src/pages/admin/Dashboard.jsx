import { Link } from 'react-router-dom';
import { DollarSign, CalendarCheck, FileText, Users, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { money, money0, fmtTime, fmt, STATUS } from '../../lib/format.js';
import { PageHeader, PageLoader, StatCard, StatusBadge, RowLink } from '../../components/ui.jsx';

export default function AdminDashboard() {
  const { tz } = useApp();
  const { data } = useApi('/admin/stats', { pollMs: 60000 });
  if (!data) return <PageLoader />;
  const max = Math.max(1, ...data.months.map((m) => m.revenue));
  const change = data.revenue.lastMonth ? Math.round(((data.revenue.month - data.revenue.lastMonth) / data.revenue.lastMonth) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Your business at a glance" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Revenue this month"
          value={money0(data.revenue.month)}
          sub={`${data.revenue.jobsThisMonth} completed jobs${change !== null ? ` · ${change >= 0 ? '+' : ''}${change}% vs last month` : ''}`}
          icon={DollarSign}
          tone="green"
        />
        <StatCard label="Upcoming booked jobs" value={data.upcoming.count} sub={`${money0(data.upcoming.value)} scheduled`} icon={CalendarCheck} />
        <StatCard label="Pending quotes" value={data.pendingQuotes.count} sub={`${money0(data.pendingQuotes.value)} potential`} icon={FileText} tone="amber" />
        <StatCard label="Customers" value={data.customers} sub={`${money0(data.revenue.allTime)} all-time revenue`} icon={Users} tone="violet" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="card p-5">
          <h2 className="text-base">Revenue (completed jobs)</h2>
          <div className="mt-4 flex h-44 items-end gap-3">
            {data.months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] text-slate-500">{m.revenue ? money0(m.revenue) : ''}</span>
                <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.max(2, (m.revenue / max) * 130)}px` }} title={money(m.revenue)} />
                <span className="text-xs text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {Object.entries(STATUS).map(([k, s]) => (
              <Link key={k} to={`/admin/bookings?status=${k}`} className={`chip ${s.cls}`}>
                {s.label}: {data.byStatus[k] || 0}
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-base">Today's jobs</h2>
            <Link to="/admin/calendar" className="text-sm text-brand-700">Calendar</Link>
          </div>
          {!data.today.length && <p className="p-4 text-sm text-slate-500">No jobs today.</p>}
          <div className="divide-y divide-slate-100">
            {data.today.map((b) => (
              <RowLink key={b.id} to={`/admin/bookings/${b.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fmtTime(b.start, tz)} · {b.customer.name}</p>
                    <p className="truncate text-xs text-slate-500">{b.pro?.name || 'Unassigned'} · {b.address}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              </RowLink>
            ))}
          </div>
        </div>
      </div>

      {data.requested.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h2 className="text-base">Needs confirmation ({data.requested.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.requested.map((b) => (
              <RowLink key={b.id} to={`/admin/bookings/${b.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium">#{b.number} {b.customer.name}</span> · {fmt(b.start, tz)}
                  </p>
                  <span className="text-sm font-semibold">{money(b.total)}</span>
                </div>
              </RowLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
