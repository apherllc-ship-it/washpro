import { useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { STATUS, fmt, money } from '../../lib/format.js';
import { PageHeader, PageLoader, StatusBadge } from '../../components/ui.jsx';

export default function AdminBookings() {
  const { tz } = useApp();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const { data } = useApi(`/admin/bookings${qs({ status })}`);

  return (
    <div>
      <PageHeader
        title="Bookings"
        actions={
          <select className="input w-auto" value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
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
              <tr>
                <th>#</th>
                <th>When</th>
                <th>Customer</th>
                <th>Services</th>
                <th>Technician</th>
                <th>Status</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.bookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td><Link className="font-medium text-brand-700" to={`/admin/bookings/${b.id}`}>{b.number}</Link></td>
                  <td>{fmt(b.start, tz, 'LLL d, h:mm a')}</td>
                  <td>{b.customer.name}</td>
                  <td className="max-w-[220px] truncate">{b.quote.items.map((i) => i.serviceName).join(', ')}</td>
                  <td>{b.pro?.name || <span className="text-amber-600">Unassigned</span>}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="text-right font-medium">{money(b.total)}</td>
                </tr>
              ))}
              {!data.bookings.length && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">No bookings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
