import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, CalendarClock, Phone, Mail, UserCheck, CreditCard } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { STATUS, fmtRange, money } from '../../lib/format.js';
import { PageHeader, PageLoader, ErrorBox, StatusBadge, Modal, Field, Spinner } from '../../components/ui.jsx';
import { StatusTimeline, ActivityLog, PhotoGallery, NotesPanel } from '../../components/BookingParts.jsx';
import QuoteSummary from '../../components/QuoteSummary.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';

export default function AdminBookingDetail() {
  const { id } = useParams();
  const { tz, notify } = useApp();
  const { data, error, reload } = useApi(`/admin/bookings/${id}`, { pollMs: 30000 });
  const { data: pros } = useApi('/admin/pros');
  const [busy, setBusy] = useState(false);
  const [statusModal, setStatusModal] = useState(null);
  const [note, setNote] = useState('');
  const [resched, setResched] = useState(false);
  const [slot, setSlot] = useState(null);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoader />;
  const b = data.booking;
  const closed = ['COMPLETED', 'CANCELLED'].includes(b.status);

  const patch = async (body, msg) => {
    setBusy(true);
    try {
      await api.patch(`/admin/bookings/${b.id}`, body);
      notify(msg);
      setStatusModal(null);
      setNote('');
      reload(true);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/bookings/${b.id}/reschedule`, { start: slot.start });
      notify('Rescheduled – customer notified');
      setResched(false);
      reload(true);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader back={{ to: '/admin/calendar', label: 'Calendar' }} title={`Booking #${b.number}`} subtitle={`Quote #${b.quote.number}`} actions={<StatusBadge status={b.status} />} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="card p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-start gap-2"><CalendarClock className="mt-0.5 h-4 w-4 text-brand-600" /> {fmtRange(b.start, b.end, tz)}</p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-brand-600" /> {b.address}</p>
              <p className="flex items-start gap-2">
                <UserCheck className="mt-0.5 h-4 w-4 text-brand-600" />
                <Link to={`/admin/customers/${b.customer.id}`} className="font-medium text-brand-700">{b.customer.name}</Link>
              </p>
              <p className="flex flex-wrap items-center gap-3">
                {b.customer.phone && <a href={`tel:${b.customer.phone}`} className="flex items-center gap-1 text-slate-600"><Phone className="h-3.5 w-3.5" /> {b.customer.phone}</a>}
                <a href={`mailto:${b.customer.email}`} className="flex items-center gap-1 text-slate-600"><Mail className="h-3.5 w-3.5" /> {b.customer.email}</a>
              </p>
              {b.depositStatus !== 'NONE' && (
                <p className="flex items-start gap-2"><CreditCard className="mt-0.5 h-4 w-4 text-brand-600" /> Deposit {money(b.depositAmount)} – {b.depositStatus.toLowerCase()}</p>
              )}
            </div>
            {b.customerNotes && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Customer notes: {b.customerNotes}</p>}
          </div>

          <div className="card p-5">
            <h2 className="mb-2 text-base">Quote</h2>
            <QuoteSummary quote={b.quote} />
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Photos</h2>
            <PhotoGallery photos={b.photos} uploadUrl={`/admin/bookings/${b.id}/photos`} deleteUrl={`/admin/bookings/${b.id}/photos`} onChanged={() => reload(true)} />
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Job notes</h2>
            <NotesPanel notes={b.notes} postUrl={`/admin/bookings/${b.id}/notes`} onChanged={() => reload(true)} allowCustomerVisible />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card space-y-4 p-5">
            <h2 className="text-base">Manage</h2>
            <Field label="Technician">
              <select className="input" disabled={closed || busy} value={b.proId || ''} onChange={(e) => patch({ proId: e.target.value || null }, e.target.value ? 'Technician assigned' : 'Technician removed')}>
                <option value="">Unassigned</option>
                {pros?.pros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.role === 'ADMIN' ? ' (admin)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">Change status</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS)
                  .filter(([k]) => k !== b.status)
                  .map(([k, s]) => (
                    <button key={k} className={`chip ${s.cls} hover:opacity-80`} onClick={() => setStatusModal(k)}>
                      {s.label}
                    </button>
                  ))}
              </div>
            </div>
            {!closed && (
              <button className="btn-secondary w-full" onClick={() => { setSlot(null); setResched(true); }}>
                <CalendarClock className="h-4 w-4" /> Reschedule
              </button>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-base">Timeline</h2>
            <StatusTimeline booking={b} />
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Activity</h2>
            <ActivityLog events={b.events} />
          </div>
        </aside>
      </div>

      <Modal
        open={!!statusModal}
        onClose={() => setStatusModal(null)}
        title={`Set status to ${STATUS[statusModal]?.label}?`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setStatusModal(null)}>Back</button>
            <button className={statusModal === 'CANCELLED' ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={() => patch({ status: statusModal, note }, 'Status updated – customer notified')}>
              {busy && <Spinner className="h-4 w-4 text-white" />} Confirm
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The customer gets an email{b.customer.phone ? ', text (if opted in)' : ''} and in-app notification.</p>
        <Field label="Note (optional)" className="mt-3">
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={resched}
        onClose={() => setResched(false)}
        title="Reschedule booking"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setResched(false)}>Close</button>
            <button className="btn-primary" disabled={!slot || busy} onClick={reschedule}>Save new time</button>
          </>
        }
      >
        <SlotPicker bookingId={b.id} value={slot} onChange={setSlot} />
      </Modal>
    </div>
  );
}
