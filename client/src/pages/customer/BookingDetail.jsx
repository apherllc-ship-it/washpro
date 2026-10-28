import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapPin, CalendarClock, XCircle, CreditCard, User, Radio } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtRange, money } from '../../lib/format.js';
import { PageHeader, PageLoader, ErrorBox, StatusBadge, Modal, Field, Spinner } from '../../components/ui.jsx';
import { StatusTimeline, PhotoGallery, NotesPanel } from '../../components/BookingParts.jsx';
import QuoteSummary from '../../components/QuoteSummary.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';

export default function BookingDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { tz, notify } = useApp();
  // Poll for live status updates while the job is active.
  const { data, error, reload } = useApi(`/bookings/${id}`, { pollMs: 15000 });
  const [modal, setModal] = useState(null);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = params.get('deposit');
    if (d === 'success') notify('Deposit received – thank you!');
    if (d === 'cancelled') notify('Deposit payment was cancelled', 'error');
    if (d) setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoader />;
  const b = data.booking;
  const live = ['ON_THE_WAY', 'IN_PROGRESS'].includes(b.status);

  const run = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      notify(msg);
      setModal(null);
      reload(true);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const payDeposit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/bookings/${b.id}/deposit`);
      window.location.assign(r.checkoutUrl);
    } catch (e) {
      notify(e.message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={{ to: '/app/bookings', label: 'My bookings' }} title={`Booking #${b.number}`} actions={<StatusBadge status={b.status} />} />

      {live && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-violet-600 p-4 text-white">
          <Radio className="h-5 w-5 animate-pulse" />
          <p className="text-sm font-medium">{b.status === 'ON_THE_WAY' ? `${b.pro?.name || 'Your technician'} is on the way!` : 'Your job is in progress.'}</p>
        </div>
      )}

      {b.depositStatus === 'PENDING' && b.status !== 'CANCELLED' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">A deposit of {money(b.depositAmount)} is needed to confirm your appointment.</p>
          <button className="btn-primary" onClick={payDeposit} disabled={busy}>
            <CreditCard className="h-4 w-4" /> Pay deposit
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="card p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-start gap-2"><CalendarClock className="mt-0.5 h-4 w-4 text-brand-600" /> {fmtRange(b.start, b.end, tz)}</p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-brand-600" /> {b.address}</p>
              <p className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 text-brand-600" /> {b.pro ? `Technician: ${b.pro.name}` : 'Technician not assigned yet'}</p>
              {b.depositStatus === 'PAID' && <p className="flex items-start gap-2"><CreditCard className="mt-0.5 h-4 w-4 text-emerald-600" /> Deposit paid ({money(b.depositAmount)})</p>}
            </div>
            {data.canChange && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button className="btn-secondary" onClick={() => { setSlot(null); setModal('reschedule'); }}>
                  <CalendarClock className="h-4 w-4" /> Reschedule
                </button>
                <button className="btn-ghost text-red-600" onClick={() => setModal('cancel')}>
                  <XCircle className="h-4 w-4" /> Cancel
                </button>
              </div>
            )}
            {!data.canChange && ['REQUESTED', 'CONFIRMED', 'SCHEDULED'].includes(b.status) && (
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                Online changes close {data.cancelWindowHours} hours before the appointment. Please call us to make changes.
              </p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Photos</h2>
            <PhotoGallery photos={b.photos} />
          </div>

          <div className="card p-5">
            <h2 className="mb-2 text-base">Quote #{b.quote.number}</h2>
            <QuoteSummary quote={b.quote} />
          </div>

          {b.notes.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-base">Notes from our team</h2>
              <NotesPanel notes={b.notes} />
            </div>
          )}
        </div>

        <aside className="card self-start p-5">
          <h2 className="mb-4 text-base">Status</h2>
          <StatusTimeline booking={b} />
        </aside>
      </div>

      <Modal
        open={modal === 'reschedule'}
        onClose={() => setModal(null)}
        title="Pick a new time"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(null)}>Close</button>
            <button className="btn-primary" disabled={!slot || busy} onClick={() => run(() => api.post(`/bookings/${b.id}/reschedule`, { start: slot.start }), 'Appointment rescheduled')}>
              {busy && <Spinner className="h-4 w-4 text-white" />} Confirm new time
            </button>
          </>
        }
      >
        <SlotPicker bookingId={b.id} value={slot} onChange={setSlot} />
      </Modal>

      <Modal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancel appointment?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(null)}>Keep it</button>
            <button className="btn-danger" disabled={busy} onClick={() => run(() => api.post(`/bookings/${b.id}/cancel`, { reason }), 'Appointment cancelled')}>
              Cancel appointment
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">Your quote stays saved so you can book again later.</p>
        <Field label="Reason (optional)">
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
