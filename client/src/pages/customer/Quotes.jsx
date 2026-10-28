import { Link } from 'react-router-dom';
import { FileText, Calculator } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { money, fmtDate } from '../../lib/format.js';
import { PageHeader, PageLoader, Empty, QuoteBadge, RowLink } from '../../components/ui.jsx';

export default function CustomerQuotes() {
  const { tz } = useApp();
  const { data } = useApi('/quotes');
  if (!data) return <PageLoader />;
  return (
    <div>
      <PageHeader title="My quotes" actions={<Link to="/quote" className="btn-primary"><Calculator className="h-4 w-4" /> New quote</Link>} />
      {!data.quotes.length ? (
        <Empty icon={FileText} title="No quotes yet">Get an instant price by measuring your property on the map.</Empty>
      ) : (
        <div className="card divide-y divide-slate-100">
          {data.quotes.map((q) => (
            <RowLink key={q.id} to={`/app/quotes/${q.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Quote #{q.number} · {q.items.map((i) => i.serviceName).join(', ')}</p>
                  <p className="truncate text-xs text-slate-500">{q.address} · {fmtDate(q.createdAt, tz)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <QuoteBadge status={q.status} />
                  <span className="text-sm font-semibold">{money(q.total)}</span>
                </div>
              </div>
            </RowLink>
          ))}
        </div>
      )}
    </div>
  );
}
