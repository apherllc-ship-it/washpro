import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, CheckCircle2, MapPin, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDate } from '../../lib/format.js';
import { loadGoogleMaps } from '../../lib/maps.js';
import { PageHeader, PageLoader, ErrorBox, QuoteBadge } from '../../components/ui.jsx';
import QuoteSummary from '../../components/QuoteSummary.jsx';
import MeasureMap from '../../components/MeasureMap.jsx';

const COLORS = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function QuoteDetail({ admin }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tz, notify, config } = useApp();
  const { data, error, reload } = useApi(`/quotes/${id}`);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(null);

  const shapes = useMemo(
    () =>
      (data?.quote.items || [])
        .filter((i) => Array.isArray(i.geometry) && i.geometry.length > 1)
        .map((i, n) => ({ id: i.id, kind: i.unit === 'LINFT' ? 'polyline' : 'polygon', path: i.geometry, color: COLORS[n % COLORS.length] })),
    [data],
  );

  useEffect(() => {
    if (shapes.length && config?.googleMapsKey) loadGoogleMaps(config.googleMapsKey).then(setGoogle).catch(() => {});
  }, [shapes.length, config?.googleMapsKey]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoader />;
  const q = data.quote;

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post(`/quotes/${q.id}/confirm`, { accept: true });
      notify('Quote confirmed – now pick a time');
      navigate(`/app/quotes/${q.id}/book`);
    } catch (e) {
      notify(e.message, 'error');
      reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm_('Delete this quote?')) return;
    await api.del(`/quotes/${q.id}`);
    navigate('/app/quotes');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={admin ? { to: '/admin/quotes', label: 'Quotes' } : { to: '/app/quotes', label: 'My quotes' }}
        title={`Quote #${q.number}`}
        subtitle={`Created ${fmtDate(q.createdAt, tz)} · valid until ${fmtDate(q.validUntil, tz)}`}
        actions={<QuoteBadge status={q.status} />}
      />

      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="h-4 w-4 text-brand-600" /> {q.address}
          </p>
          {admin && q.customer && (
            <p className="mb-2 text-sm">
              Customer: <Link className="font-medium text-brand-700" to={`/admin/customers/${q.customer.id}`}>{q.customer.name}</Link> · {q.customer.email}
            </p>
          )}
          <QuoteSummary quote={q} />
          {q.customerNotes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Notes: {q.customerNotes}</p>}
        </div>

        <div className="space-y-4">
          {!admin && (q.status === 'PENDING' || q.status === 'CONFIRMED') && (
            <div className="card p-5">
              {q.status === 'PENDING' ? (
                <>
                  <h2 className="text-base">Confirm your quote</h2>
                  <p className="mt-1 text-sm text-slate-500">Review the itemized price. Final price may change if on-site conditions differ significantly from the measurements.</p>
                  <label className="mt-4 flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 rounded border-slate-300" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                    I accept this quote and its terms.
                  </label>
                  <button className="btn-primary mt-4 w-full" disabled={!accept || busy} onClick={confirm}>
                    <CheckCircle2 className="h-4 w-4" /> Confirm & choose a time
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-base">Quote confirmed</h2>
                  <p className="mt-1 text-sm text-slate-500">Pick a date and time that works for you.</p>
                  <Link to={`/app/quotes/${q.id}/book`} className="btn-primary mt-4 w-full">
                    <CalendarPlus className="h-4 w-4" /> Book appointment
                  </Link>
                </>
              )}
              <button className="btn-ghost mt-2 w-full text-red-600" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete quote
              </button>
            </div>
          )}
          {q.booking && (
            <Link to={admin ? `/admin/bookings/${q.booking.id}` : `/app/bookings/${q.booking.id}`} className="btn-secondary w-full">
              View booking
            </Link>
          )}
          {q.status === 'EXPIRED' && !admin && (
            <Link to="/quote" className="btn-primary w-full">
              Request a new quote
            </Link>
          )}
          {google && shapes.length > 0 && <MeasureMap google={google} areas={shapes} readOnly className="h-64" />}
        </div>
      </div>
    </div>
  );
}

const confirm_ = (m) => window.confirm(m);
