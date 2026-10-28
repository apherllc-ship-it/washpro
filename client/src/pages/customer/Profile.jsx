import { useEffect, useState } from 'react';
import { MapPin, Star, Trash2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { loadGoogleMaps } from '../../lib/maps.js';
import { PageHeader, Field, ErrorBox, Toggle, Modal } from '../../components/ui.jsx';
import AddressSearch from '../../components/AddressSearch.jsx';

export default function Profile() {
  const { user, setUser, notify, config } = useApp();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', smsOptIn: user.smsOptIn });
  const [err, setErr] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErr, setPwErr] = useState(null);
  const { data: addr, reload } = useApi('/me/addresses');
  const [adding, setAdding] = useState(false);
  const [newAddr, setNewAddr] = useState(null);
  const [label, setLabel] = useState('Home');
  const [google, setGoogle] = useState(null);

  useEffect(() => {
    if (adding && config?.googleMapsKey) loadGoogleMaps(config.googleMapsKey).then(setGoogle).catch(() => {});
  }, [adding, config?.googleMapsKey]);

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api.patch('/me', form);
      setUser(r.user);
      notify('Profile saved');
    } catch (e2) {
      setErr(e2);
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    setPwErr(null);
    try {
      await api.post('/auth/change-password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      notify('Password updated');
    } catch (e2) {
      setPwErr(e2);
    }
  };

  const addAddress = async () => {
    try {
      await api.post('/me/addresses', { ...newAddr, label });
      setAdding(false);
      setNewAddr(null);
      reload(true);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Profile" subtitle={user.email} />

      <form onSubmit={save} className="card space-y-4 p-5">
        <h2 className="text-base">Contact details</h2>
        <ErrorBox error={err} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={err?.fields?.name}>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mobile phone" error={err?.fields?.phone}>
            <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <Toggle checked={form.smsOptIn} onChange={(v) => setForm({ ...form, smsOptIn: v })} label="Send me text message updates" />
        <button className="btn-primary">Save</button>
      </form>

      {user.role === 'CUSTOMER' && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base">Saved addresses</h2>
            <button className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          {!addr?.addresses?.length && <p className="text-sm text-slate-500">No saved addresses.</p>}
          <ul className="divide-y divide-slate-100">
            {addr?.addresses?.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {a.label} {a.isDefault && <span className="chip ml-1 bg-brand-50 text-brand-700">Default</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{a.formatted}</p>
                </div>
                {!a.isDefault && (
                  <button className="btn-ghost p-2" title="Make default" onClick={() => api.patch(`/me/addresses/${a.id}`, { isDefault: true }).then(() => reload(true))}>
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button className="btn-ghost p-2 text-red-600" title="Delete" onClick={() => confirm('Delete this address?') && api.del(`/me/addresses/${a.id}`).then(() => reload(true))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={changePw} className="card space-y-4 p-5">
        <h2 className="text-base">Change password</h2>
        <ErrorBox error={pwErr} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password">
            <input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password" error={pwErr?.fields?.newPassword}>
            <input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
        </div>
        <button className="btn-secondary">Update password</button>
      </form>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add address"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn-primary" disabled={!newAddr} onClick={addAddress}>Save address</button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Label">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home, Rental, Office…" />
          </Field>
          <div>
            <span className="label">Address</span>
            <AddressSearch google={google} value={newAddr} onSelect={setNewAddr} />
            {newAddr && <p className="mt-2 text-xs text-slate-500">{newAddr.formatted}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
