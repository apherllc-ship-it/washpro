import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { fmtDate, money } from '../../lib/format.js';
import { PageHeader, PageLoader } from '../../components/ui.jsx';

export default function AdminCustomers() {
  const { tz } = useApp();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useApi(`/admin/customers${qs({ q: debounced })}`);

  return (
    <div>
      <PageHeader title="Customers" subtitle="Your customer CRM – contact info, history and notes." />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search by name, email, phone or address" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!data ? (
        <PageLoader />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Address</th><th className="text-right">Jobs</th><th className="text-right">Total spent</th><th>Last job</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td><Link className="font-medium text-brand-700" to={`/admin/customers/${c.id}`}>{c.name}</Link>{!c.active && <span className="chip ml-1 bg-slate-200">disabled</span>}</td>
                  <td><div>{c.email}</div><div className="text-xs text-slate-500">{c.phone}</div></td>
                  <td className="max-w-[220px] truncate">{c.address || '—'}</td>
                  <td className="text-right">{c.jobs}</td>
                  <td className="text-right font-medium">{money(c.totalSpent)}</td>
                  <td>{c.lastJob ? fmtDate(c.lastJob, tz) : '—'}</td>
                </tr>
              ))}
              {!data.customers.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No customers found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
