import { useState } from 'react';
import { DateTime } from 'luxon';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { PageHeader } from '../../components/ui.jsx';
import MonthCalendar from '../../components/MonthCalendar.jsx';

export default function ProCalendar() {
  const { tz } = useApp();
  const [month, setMonth] = useState(DateTime.now().setZone(tz || 'local').startOf('month'));
  const from = month.minus({ days: 7 }).toISO();
  const to = month.endOf('month').plus({ days: 7 }).toISO();
  const { data } = useApi(`/pro/jobs${qs({ from, to })}`);
  return (
    <div>
      <PageHeader title="Calendar" subtitle="Jobs assigned to you" />
      <MonthCalendar month={month} onMonthChange={setMonth} jobs={data?.jobs || []} linkFor={(j) => `/pro/jobs/${j.id}`} titleFor={(j) => j.customer.name} />
    </div>
  );
}
