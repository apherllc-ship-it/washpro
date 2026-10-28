import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtRange, money } from '../../lib/format.js';
import { PageHeader, PageLoader, ErrorBox, Field, Spinner } from '../../components/ui.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';
import QuoteSummary from '../../components/QuoteSummary.jsx';

export default function BookQuote() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tz, notify, config } = useApp();
  const { data, error } = useApi(`/quotes/${id}`);
  const [slot, setSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoader />;
  const q = data.quote;
  if (q.status === 'PENDING') return <Navigate to={`/app/quotes/${id}`} replace />;
  if (q.status === 'BOOKED' && q.booking) return <Navigate to={`/app/bookings/${q.booking.id}`} replace />;

  const book = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post('/bookings', { quoteId: q.id, start: slot.start, customerNotes: notes });
      if (r.checkoutUrl) {
        window.location.assign(r.checkoutUrl);
        return;
      }
      notify('Booking requested! Check your email for details.');
      navigate(`/app/bookings/${r.booking.id}`, { replace: true });
    } catch (e) {
      setErr(e);
      if (e.status === 409) setSlot(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={{ to: `/app/quotes/${id}`, label: `Quote #${q.number}` }} title="Choose a date & time" subtitle={q.address} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <SlotPicker quoteId={q.id} value={slot} onChange={setSlot} />
        </div>
        <aside className="space-y-4">
          <div className="card p-5">
            <QuoteSummary quote={q} compact />
          </div>
          <div className="card p-5">
            <ErrorBox error={err} className="mb-3" />
            {slot ? <p className="text-sm font-medium">{fmtRange(slot.start, slot.end, tz)}</p> : <p className="text-sm text-slate-500">Select a time slot.</p>}
            <Field label="Anything we should know? (optional)" className="mt-3">
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={q.customerNotes || 'Gate code, parking, pets…'} />
            </Field>
            <button className="btn-primary mt-4 w-full" disabled={!slot || busy} onClick={book}>
              {busy ? <Spinner className="h-4 w-4 text-white" /> : <CalendarCheck className="h-4 w-4" />}
              {config?.depositEnabled && q.deposit > 0 ? `Book & pay ${money(q.deposit)} deposit` : 'Request this time'}
            </button>
            <p className="mt-2 text-xs text-slate-500">You can reschedule or cancel up to {config?.cancelWindowHours ?? 24} hours before your appointment.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
