import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { PageHeader, PageLoader, Field, ErrorBox, Toggle } from '../../components/ui.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NUMERIC = ['travelFreeMiles', 'travelFeePerMile', 'travelFeeMax', 'maxServiceMiles', 'taxRate', 'depositPercent', 'crews', 'slotIntervalMinutes', 'bookingLeadHours', 'bookingHorizonDays', 'cancelWindowHours', 'quoteValidDays'];

export default function AdminSettings() {
  const { notify } = useApp();
  const { data, reload } = useApi('/admin/settings');
  const [s, setS] = useState(null);
  const [hours, setHours] = useState(null);
  const [err, setErr] = useState(null);
  const [block, setBlock] = useState({ date: '', reason: '' });

  useEffect(() => {
    if (data) {
      setS(data.settings);
      setHours(data.hours);
    }
  }, [data]);

  if (!data || !s) return <PageLoader />;

  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const saveSettings = async (e) => {
    e?.preventDefault();
    setErr(null);
    const { id: _id, ...body } = s;
    for (const k of NUMERIC) body[k] = Number(body[k]);
    body.businessLat = body.businessLat === '' || body.businessLat == null ? null : Number(body.businessLat);
    body.businessLng = body.businessLng === '' || body.businessLng == null ? null : Number(body.businessLng);
    if (body.businessAddress !== data.settings.businessAddress && body.businessLat === data.settings.businessLat) {
      body.businessLat = null; // let the server geocode the new address
      body.businessLng = null;
    }
    try {
      await api.put('/admin/settings', body);
      notify('Settings saved');
      reload(true);
    } catch (e2) {
      setErr(e2);
    }
  };

  const saveHours = async () => {
    try {
      await api.put('/admin/hours', { hours });
      notify('Business hours saved');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const addBlock = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/blocked-dates', block);
      setBlock({ date: '', reason: '' });
      reload(true);
    } catch (e2) {
      notify(e2.message, 'error');
    }
  };

  const num = (k, label, props = {}) => (
    <Field label={label} hint={props.hint} error={err?.fields?.[k]}>
      <input className="input" type="number" step={props.step || 1} min="0" value={s[k] ?? ''} onChange={set(k)} />
    </Field>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Settings" />

      <form onSubmit={saveSettings} className="space-y-5">
        <ErrorBox error={err} />
        <div className="card space-y-4 p-5">
          <h2 className="text-base">Business</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><input className="input" value={s.businessName} onChange={set('businessName')} /></Field>
            <Field label="Timezone" error={err?.fields?.timezone} hint="e.g. America/Chicago"><input className="input" value={s.timezone} onChange={set('timezone')} /></Field>
            <Field label="Email"><input className="input" type="email" value={s.businessEmail} onChange={set('businessEmail')} /></Field>
            <Field label="Phone"><input className="input" value={s.businessPhone} onChange={set('businessPhone')} /></Field>
            <Field label="Business address (travel fees start here)" className="sm:col-span-2" hint={s.businessLat != null ? `Location: ${Number(s.businessLat).toFixed(5)}, ${Number(s.businessLng).toFixed(5)}` : 'Not located yet – needs a Google server key, or enter coordinates below.'}>
              <input className="input" value={s.businessAddress} onChange={set('businessAddress')} />
            </Field>
            <Field label="Latitude"><input className="input" type="number" step="any" value={s.businessLat ?? ''} onChange={set('businessLat')} /></Field>
            <Field label="Longitude"><input className="input" type="number" step="any" value={s.businessLng ?? ''} onChange={set('businessLng')} /></Field>
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="text-base">Travel fee & pricing</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {num('travelFreeMiles', 'Free radius (miles)', { step: 0.5 })}
            {num('travelFeePerMile', 'Fee per mile beyond', { step: 0.25 })}
            {num('travelFeeMax', 'Max travel fee')}
            {num('maxServiceMiles', 'Service area limit (miles)', { hint: '0 = no limit' })}
            {num('taxRate', 'Tax rate (%)', { step: 0.01 })}
            {num('quoteValidDays', 'Quotes valid for (days)')}
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="text-base">Booking rules</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {num('crews', 'Crews (jobs at the same time)')}
            {num('slotIntervalMinutes', 'Time slot step (minutes)')}
            {num('bookingLeadHours', 'Minimum notice (hours)')}
            {num('bookingHorizonDays', 'Book up to (days ahead)')}
            {num('cancelWindowHours', 'Cancel/reschedule cutoff (hours)')}
          </div>
          <Toggle checked={s.autoConfirm} onChange={(v) => setS({ ...s, autoConfirm: v })} label="Automatically confirm new bookings" />
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="text-base">Deposits (Stripe)</h2>
          <Toggle checked={s.depositEnabled} onChange={(v) => setS({ ...s, depositEnabled: v })} label="Require a deposit when booking" />
          <div className="grid gap-4 sm:grid-cols-3">{num('depositPercent', 'Deposit (% of total)')}</div>
          <p className="text-xs text-slate-500">Deposits only apply when STRIPE_SECRET_KEY is configured on the server.</p>
        </div>

        <div className="flex justify-end">
          <button className="btn-primary">Save settings</button>
        </div>
      </form>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base">Business hours</h2>
          <button className="btn-primary btn-sm" onClick={saveHours}>Save hours</button>
        </div>
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm font-medium">{DAYS[h.dayOfWeek]}</span>
              <Toggle checked={!h.closed} onChange={(v) => setHours(hours.map((x, j) => (j === i ? { ...x, closed: !v } : x)))} />
              {h.closed ? (
                <span className="text-sm text-slate-400">Closed</span>
              ) : (
                <>
                  <input type="time" className="input w-32" value={h.openTime} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, openTime: e.target.value } : x)))} />
                  <span className="text-slate-400">to</span>
                  <input type="time" className="input w-32" value={h.closeTime} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, closeTime: e.target.value } : x)))} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-base">Blocked days</h2>
        <form onSubmit={addBlock} className="mb-4 flex flex-wrap gap-2">
          <input type="date" className="input w-auto" required value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} />
          <input className="input flex-1" placeholder="Reason (holiday, rain day…)" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
          <button className="btn-primary">Block day</button>
        </form>
        {!data.blocked.length && <p className="text-sm text-slate-500">No upcoming blocked days.</p>}
        <ul className="divide-y divide-slate-100">
          {data.blocked.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span><span className="font-medium">{b.date}</span>{b.reason && <span className="text-slate-500"> – {b.reason}</span>}</span>
              <button className="btn-ghost p-1.5 text-red-600" onClick={() => api.del(`/admin/blocked-dates/${b.id}`).then(() => reload(true))} aria-label="Unblock"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
