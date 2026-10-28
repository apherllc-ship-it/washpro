import { DateTime } from 'luxon';
import { Briefcase, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtTime } from '../../lib/format.js';
import { PageHeader, PageLoader, Empty, StatusBadge } from '../../components/ui.jsx';

export default function ProJobs() {
  const { tz, user } = useApp();
  const zone = tz || 'local';
  const { data } = useApi('/pro/jobs', { pollMs: 60000 });
  if (!data) return <PageLoader />;

  const today = DateTime.now().setZone(zone).toISODate();
  const open = data.jobs.filter((j) => !['COMPLETED', 'CANCELLED'].includes(j.status));
  const groups = {};
  for (const j of open) {
    const d = DateTime.fromISO(j.start).setZone(zone).toISODate();
    if (d < today && j.status !== 'IN_PROGRESS' && j.status !== 'ON_THE_WAY') continue;
    (groups[d] ||= []).push(j);
  }
  const days = Object.keys(groups).sort();

  return (
    <div>
      <PageHeader title="My jobs" subtitle={`Hi ${user.name.split(' ')[0]} – here's your schedule.`} />
      {!days.length && <Empty icon={Briefcase} title="No upcoming jobs">New assignments will show up here and you'll get a notification.</Empty>}
      <div className="space-y-6">
        {days.map((d) => (
          <section key={d}>
            <h2 className={`mb-2 text-sm font-semibold uppercase ${d === today ? 'text-brand-700' : 'text-slate-500'}`}>
              {d === today ? 'Today' : DateTime.fromISO(d).toFormat('cccc, LLL d')}
            </h2>
            <div className="space-y-3">
              {groups[d].map((j) => (
                <Link key={j.id} to={`/pro/jobs/${j.id}`} className="card block p-4 hover:border-brand-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">
                        {fmtTime(j.start, tz)} <span className="text-sm font-normal text-slate-500">– {fmtTime(j.end, tz)}</span>
                      </p>
                      <p className="font-medium">{j.customer.name}</p>
                      <p className="mt-1 flex items-start gap-1 text-sm text-slate-600">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {j.address}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{j.quote.items.map((i) => i.serviceName).join(' · ')}</p>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  {j.customer.phone && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" /> {j.customer.phone}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
