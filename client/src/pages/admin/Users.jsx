import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api, qs } from '../../lib/api.js';
import { fmtDate } from '../../lib/format.js';
import { PageHeader, PageLoader, Modal, Field, ErrorBox, Toggle } from '../../components/ui.jsx';

const ROLES = { CUSTOMER: 'Customer', PRO: 'Technician', ADMIN: 'Admin' };
const empty = { name: '', email: '', phone: '', role: 'PRO', password: '' };

export default function AdminUsers() {
  const { tz, notify, user: me } = useApp();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const { data, reload } = useApi(`/admin/users${qs({ role, q })}`);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);

  const create = async () => {
    setErr(null);
    try {
      await api.post('/admin/users', form);
      notify('User created');
      setForm(null);
      reload(true);
    } catch (e) {
      setErr(e);
    }
  };

  const save = async () => {
    setErr(null);
    try {
      const { id, password, ...rest } = edit;
      await api.patch(`/admin/users/${id}`, { name: rest.name, phone: rest.phone || '', role: rest.role, active: rest.active, ...(password ? { password } : {}) });
      notify('User updated');
      setEdit(null);
      reload(true);
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <div>
      <PageHeader title="Team & users" subtitle="Add technicians, manage roles and access." actions={<button className="btn-primary" onClick={() => { setErr(null); setForm(empty); }}><UserPlus className="h-4 w-4" /> Add user</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!data ? <PageLoader /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || '—'}</td>
                  <td><span className={`chip ${u.role === 'ADMIN' ? 'bg-violet-100 text-violet-800' : u.role === 'PRO' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>{ROLES[u.role]}</span></td>
                  <td>{u.active ? <span className="text-emerald-700">Active</span> : <span className="text-slate-400">Disabled</span>}</td>
                  <td>{fmtDate(u.createdAt, tz)}</td>
                  <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => { setErr(null); setEdit({ ...u, password: '' }); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="Add user" footer={<><button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></>}>
        {form && (
          <div className="space-y-4">
            <ErrorBox error={err} />
            <Field label="Name" error={err?.fields?.name}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email" error={err?.fields?.email}><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Temporary password" error={err?.fields?.password} hint="Share it securely; they can change it from their profile.">
              <input className="input" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit user" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        {edit && (
          <div className="space-y-4">
            <ErrorBox error={err} />
            <p className="text-sm text-slate-500">{edit.email}</p>
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Role">
              <select className="input" value={edit.role} disabled={edit.id === me.id} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {edit.id !== me.id && <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Account active" />}
            <Field label="Set new password (optional)" error={err?.fields?.password}>
              <input className="input" type="text" autoComplete="off" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
