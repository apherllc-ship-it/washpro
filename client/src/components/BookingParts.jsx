import { useState } from 'react';
import { Check, X, Camera, Trash2, Upload } from 'lucide-react';
import { STATUS, fmt } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useApp } from '../context/AppContext.jsx';
import { Modal, Spinner } from './ui.jsx';

const FLOW = ['REQUESTED', 'CONFIRMED', 'SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];

// Visual status timeline: Requested → … → Completed (or Cancelled).
export function StatusTimeline({ booking }) {
  const { tz } = useApp();
  const cancelled = booking.status === 'CANCELLED';
  const idx = FLOW.indexOf(booking.status);
  const when = (s) => [...booking.events].reverse().find((e) => e.status === s)?.createdAt;

  return (
    <ol className="relative">
      {FLOW.map((s, i) => {
        const done = !cancelled && i <= idx;
        const current = !cancelled && i === idx;
        const t = done && when(s);
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
            {i < FLOW.length - 1 && <span className={`absolute left-[11px] top-6 h-full w-0.5 ${!cancelled && i < idx ? 'bg-brand-500' : 'bg-slate-200'}`} />}
            <span
              className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'
              } ${current && s !== 'COMPLETED' ? 'ring-4 ring-brand-100' : ''}`}
            >
              {done && <Check className="h-3.5 w-3.5" />}
            </span>
            <div className="-mt-0.5">
              <p className={`text-sm ${done ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>{STATUS[s].label}</p>
              {t && <p className="text-xs text-slate-500">{fmt(t, tz, "LLL d, h:mm a")}</p>}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="mt-4 flex gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white">
            <X className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-red-700">Cancelled</p>
            <p className="text-xs text-slate-500">{fmt(when('CANCELLED'), tz, 'LLL d, h:mm a')}</p>
          </div>
        </li>
      )}
    </ol>
  );
}

export function ActivityLog({ events }) {
  const { tz } = useApp();
  return (
    <ul className="space-y-3">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="text-sm">
          <p>
            <span className="font-medium">{STATUS[e.status]?.label}</span>
            {e.note && <span className="text-slate-600"> – {e.note}</span>}
          </p>
          <p className="text-xs text-slate-500">
            {fmt(e.createdAt, tz, 'LLL d, h:mm a')}
            {e.actor && ` · ${e.actor.name}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

// Before/after photo gallery. `uploadUrl` enables uploads for staff.
export function PhotoGallery({ photos, uploadUrl, deleteUrl, onChanged }) {
  const [view, setView] = useState(null);
  const groups = ['BEFORE', 'AFTER', 'OTHER'].map((k) => ({ k, list: photos.filter((p) => p.kind === k) })).filter((g) => g.list.length || (uploadUrl && g.k !== 'OTHER'));

  return (
    <div className="space-y-4">
      {!photos.length && !uploadUrl && <p className="text-sm text-slate-500">Photos will appear here once your technician uploads them.</p>}
      {groups.map((g) => (
        <div key={g.k}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold capitalize text-slate-700">{g.k.toLowerCase()}</p>
            {uploadUrl && g.k !== 'OTHER' && <PhotoUpload url={uploadUrl} kind={g.k} onDone={onChanged} />}
          </div>
          {g.list.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.list.map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                  <button type="button" className="h-full w-full" onClick={() => setView(p)}>
                    <img src={`/api/photos/${p.id}`} alt={p.caption || `${g.k} photo`} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                  {deleteUrl && (
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 opacity-0 shadow group-hover:opacity-100"
                      onClick={async () => {
                        if (!confirm('Delete this photo?')) return;
                        await api.del(`${deleteUrl}/${p.id}`);
                        onChanged?.();
                      }}
                      aria-label="Delete photo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No {g.k.toLowerCase()} photos yet.</p>
          )}
        </div>
      ))}
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${view.kind.toLowerCase()} photo` : ''} wide>
        {view && <img src={`/api/photos/${view.id}`} alt="" className="mx-auto max-h-[75vh] rounded-lg" />}
      </Modal>
    </div>
  );
}

// Downscale large phone photos in the browser before upload (keeps uploads fast on mobile data).
async function shrink(file, max = 1800) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function PhotoUpload({ url, kind, onDone }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  const onPick = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      for (const f of files) fd.append('photos', await shrink(f));
      await api.post(url, fd);
      notify(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`);
      onDone?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="btn-secondary btn-sm cursor-pointer">
      {busy ? <Spinner className="h-3.5 w-3.5" /> : kind === 'BEFORE' ? <Camera className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
      Add {kind.toLowerCase()}
      <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPick} disabled={busy} />
    </label>
  );
}

export function NotesPanel({ notes, postUrl, onChanged, allowCustomerVisible }) {
  const { tz, notify } = useApp();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(true);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(postUrl, { body, internal });
      setBody('');
      onChanged?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {postUrl && (
        <form onSubmit={submit} className="mb-4 space-y-2">
          <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a job note…" />
          <div className="flex items-center justify-between gap-2">
            {allowCustomerVisible ? (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" className="rounded border-slate-300" checked={!internal} onChange={(e) => setInternal(!e.target.checked)} />
                Visible to customer
              </label>
            ) : (
              <span />
            )}
            <button className="btn-primary btn-sm" disabled={busy || !body.trim()}>
              Add note
            </button>
          </div>
        </form>
      )}
      {!notes.length && <p className="text-sm text-slate-500">No notes yet.</p>}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <p className="mt-1 text-xs text-slate-500">
              {n.author?.name} · {fmt(n.createdAt, tz, 'LLL d, h:mm a')}
              {n.internal === false && postUrl && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-700">customer-visible</span>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
