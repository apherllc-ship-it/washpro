import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { QUOTE_STATUS, fmtDate, money } from '../../lib/format.js';
import { PageHeader, PageLoader, QuoteBadge } from '../../components/ui.jsx';

export default function AdminQuotes() {
  const { tz } = useApp();
  const [status, setStatus] = useState('');
  const { data } = useApi(`/admin/quotes${qs({ status })}`);
  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Pending quotes are follow-up opportunities."
        actions={
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(QUOTE_STATUS).map(([k, s]) => (
              <option key={k} value={k}>{s.label}</option>
            ))}
          </select>
        }
      />
      {!data ? (
        <PageLoader />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Created</th><th>Customer</th><th>Address</th><th>Services</th><th>Status</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.quotes.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td><Link className="font-medium text-brand-700" to={`/admin/quotes/${q.id}`}>{q.number}</Link></td>
                  <td>{fmtDate(q.createdAt, tz)}</td>
                  <td><Link className="text-brand-700" to={`/admin/customers/${q.customer.id}`}>{q.customer.name}</Link></td>
                  <td className="max-w-[200px] truncate">{q.address}</td>
                  <td className="max-w-[200px] truncate">{q.items.map((i) => i.serviceName).join(', ')}</td>
                  <td><QuoteBadge status={q.status} /></td>
                  <td className="text-right font-medium">{money(q.total)}</td>
                </tr>
              ))}
              {!data.quotes.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No quotes.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
