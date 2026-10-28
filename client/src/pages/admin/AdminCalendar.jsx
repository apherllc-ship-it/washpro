import { useState } from 'react';
import { DateTime } from 'luxon';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { PageHeader } from '../../components/ui.jsx';
import MonthCalendar from '../../components/MonthCalendar.jsx';

export default function AdminCalendar() {
  const { tz } = useApp();
  const [month, setMonth] = useState(DateTime.now().setZone(tz || 'local').startOf('month'));
  const [proId, setProId] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const from = month.minus({ days: 7 }).toISO();
  const to = month.endOf('month').plus({ days: 7 }).toISO();
  const { data } = useApi(`/admin/bookings${qs({ from, to, proId })}`, { pollMs: 60000 });
  const { data: pros } = useApi('/admin/pros');
  const jobs = (data?.bookings || []).filter((b) => showCancelled || b.status !== 'CANCELLED');

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="All jobs. Click a job to assign a technician."
        actions={
          <>
            <select className="input w-auto" value={proId} onChange={(e) => setProId(e.target.value)}>
              <option value="">All technicians</option>
              <option value="none">Unassigned</option>
              {pros?.pros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="rounded border-slate-300" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Cancelled
            </label>
          </>
        }
      />
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        jobs={jobs}
        linkFor={(j) => `/admin/bookings/${j.id}`}
        titleFor={(j) => `${j.customer.name}${j.pro ? ` · ${j.pro.name.split(' ')[0]}` : ' · ⚠ unassigned'}`}
      />
    </div>
  );
}
