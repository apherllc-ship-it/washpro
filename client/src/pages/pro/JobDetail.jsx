import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Navigation, Phone, PlayCircle, CheckCircle2, Truck, MapPin, Mail } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtRange, money, num, UNIT_SHORT } from '../../lib/format.js';
import { PageHeader, PageLoader, ErrorBox, StatusBadge, Modal, Field, Spinner } from '../../components/ui.jsx';
import { StatusTimeline, PhotoGallery, NotesPanel } from '../../components/BookingParts.jsx';

const NEXT = {
  SCHEDULED: { status: 'ON_THE_WAY', label: "I'm on the way", icon: Truck, cls: 'bg-violet-600 hover:bg-violet-700' },
  ON_THE_WAY: { status: 'IN_PROGRESS', label: 'Start job', icon: PlayCircle, cls: 'bg-orange-600 hover:bg-orange-700' },
  IN_PROGRESS: { status: 'COMPLETED', label: 'Mark completed', icon: CheckCircle2, cls: 'bg-emerald-600 hover:bg-emerald-700' },
};

export default function ProJobDetail() {
  const { id } = useParams();
  const { tz, notify } = useApp();
  const { data, error, reload } = useApi(`/pro/jobs/${id}`);
  const [confirming, setConfirming] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoader />;
  const b = data.booking;
  const next = NEXT[b.status];
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.lat != null ? `${b.lat},${b.lng}` : b.address)}`;

  const advance = async () => {
    setBusy(true);
    try {
      await api.post(`/pro/jobs/${b.id}/status`, { status: confirming.status, note });
      notify(`Status updated – customer notified`);
      setConfirming(null);
      setNote('');
      reload(true);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const afterMissing = confirming?.status === 'COMPLETED' && !b.photos.some((p) => p.kind === 'AFTER');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ to: '/pro', label: 'My jobs' }} title={`Job #${b.number}`} actions={<StatusBadge status={b.status} />} />

      {next && (
        <button className={`btn mb-5 w-full py-4 text-base text-white ${next.cls}`} onClick={() => setConfirming(next)}>
          <next.icon className="h-5 w-5" /> {next.label}
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-lg font-semibold">{fmtRange(b.start, b.end, tz)}</p>
            <p className="mt-2 font-medium">{b.customer.name}</p>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {b.address}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-secondary"><Navigation className="h-4 w-4" /> Directions</a>
              {b.customer.phone && <a href={`tel:${b.customer.phone}`} className="btn-secondary"><Phone className="h-4 w-4" /> Call</a>}
              {b.customer.phone && <a href={`sms:${b.customer.phone}`} className="btn-secondary">Text</a>}
              <a href={`mailto:${b.customer.email}`} className="btn-secondary"><Mail className="h-4 w-4" /> Email</a>
            </div>
            {b.customerNotes && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Customer notes: {b.customerNotes}</p>}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Work order</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {b.quote.items.map((i) => (
                <li key={i.id} className="py-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{i.serviceName}{i.label && <span className="font-normal text-slate-500"> · {i.label}</span>}</span>
                    <span className="text-slate-600">{i.unit !== 'FLAT' && `${num(i.quantity)} ${UNIT_SHORT[i.unit]}`}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {i.materialName}
                    {(i.addOns || []).length > 0 && ` · Add-ons: ${i.addOns.map((a) => a.name).join(', ')}`}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-3 text-sm">
              Job total: <span className="font-semibold">{money(b.total)}</span>
              {b.depositStatus === 'PAID' && <span className="text-slate-500"> · deposit {money(b.depositAmount)} paid · collect {money(b.total - b.depositAmount)}</span>}
            </p>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Before & after photos</h2>
            <PhotoGallery photos={b.photos} uploadUrl={`/pro/jobs/${b.id}/photos`} deleteUrl={`/pro/jobs/${b.id}/photos`} onChanged={() => reload(true)} />
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">Job notes</h2>
            <NotesPanel notes={b.notes} postUrl={`/pro/jobs/${b.id}/notes`} onChanged={() => reload(true)} allowCustomerVisible />
          </div>
        </div>

        <aside className="card self-start p-5">
          <h2 className="mb-4 text-base">Status</h2>
          <StatusTimeline booking={b} />
        </aside>
      </div>

      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming?.label}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirming(null)}>Back</button>
            <button className="btn-primary" disabled={busy} onClick={advance}>
              {busy && <Spinner className="h-4 w-4 text-white" />} Confirm
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The customer will be notified right away.</p>
        {afterMissing && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Tip: add "after" photos before completing the job.</p>}
        <Field label="Note to include (optional)" className="mt-3">
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={confirming?.status === 'ON_THE_WAY' ? 'ETA about 20 minutes' : ''} />
        </Field>
      </Modal>
    </div>
  );
}
