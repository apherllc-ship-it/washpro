import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { CATEGORY, UNIT, money } from '../../lib/format.js';
import { SURFACES } from '../../lib/maps.js';
import { PageHeader, PageLoader, Modal, Field, ErrorBox, Toggle } from '../../components/ui.jsx';

const blank = {
  name: '', slug: '', category: 'POWER_WASH', description: '', unit: 'SQFT', pricePerUnit: 0.2, minimumCharge: 100,
  baseMinutes: 30, unitsPerHour: 1000, surfaceType: 'driveway', active: true, sortOrder: 0, materials: [{ name: 'Standard', multiplier: 1 }], addOns: [],
};
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AdminServices() {
  const { notify } = useApp();
  const { data, reload } = useApi('/admin/services');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);

  const open = (s) => {
    setErr(null);
    setEdit(
      s
        ? { ...s, materials: s.materials.map(({ id, name, multiplier }) => ({ id, name, multiplier })), addOns: s.addOns.map(({ id, name, description, unit, price, active }) => ({ id, name, description, unit, price, active })) }
        : { ...blank },
    );
  };

  const save = async () => {
    setErr(null);
    const { id, createdAt: _c, updatedAt: _u, ...body } = edit;
    const num = (v) => Number(v) || 0;
    const payload = {
      ...body,
      slug: body.slug || slugify(body.name),
      pricePerUnit: num(body.pricePerUnit), minimumCharge: num(body.minimumCharge), baseMinutes: Math.round(num(body.baseMinutes)),
      unitsPerHour: Math.max(1, num(body.unitsPerHour)), sortOrder: Math.round(num(body.sortOrder)),
      materials: body.materials.map((m) => ({ ...m, multiplier: num(m.multiplier) })),
      addOns: body.addOns.map((a) => ({ ...a, price: num(a.price) })),
    };
    try {
      if (id) await api.put(`/admin/services/${id}`, payload);
      else await api.post('/admin/services', payload);
      notify('Service saved');
      setEdit(null);
      reload(true);
    } catch (e) {
      setErr(e);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${edit.name}? Existing quotes keep their prices. Consider turning it off instead.`)) return;
    await api.del(`/admin/services/${edit.id}`);
    setEdit(null);
    reload(true);
  };

  if (!data) return <PageLoader />;
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const setList = (list, i, patch) => setEdit({ ...edit, [list]: edit[list].map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div>
      <PageHeader title="Services & pricing" subtitle="Rates, minimums, material multipliers and add-ons used by the instant quote." actions={<button className="btn-primary" onClick={() => open(null)}><Plus className="h-4 w-4" /> Add service</button>} />

      {['POWER_WASH', 'SOFT_WASH'].map((cat) => (
        <section key={cat} className="mb-6">
          <h2 className="mb-2 text-base">{CATEGORY[cat]}</h2>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Service</th><th>Rate</th><th>Minimum</th><th>Materials</th><th>Add-ons</th><th>Speed</th><th>Status</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.services.filter((s) => s.category === cat).map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td>{money(s.pricePerUnit)}/{UNIT[s.unit]}</td>
                    <td>{money(s.minimumCharge)}</td>
                    <td className="max-w-[200px] truncate text-xs">{s.materials.map((m) => `${m.name} ×${m.multiplier}`).join(', ')}</td>
                    <td className="max-w-[200px] truncate text-xs">{s.addOns.map((a) => a.name).join(', ') || '—'}</td>
                    <td className="text-xs">{s.baseMinutes}m + {s.unitsPerHour}/hr</td>
                    <td>{s.active ? <span className="text-emerald-700">On</span> : <span className="text-slate-400">Off</span>}</td>
                    <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => open(s)}><Pencil className="h-3.5 w-3.5" /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        wide
        title={edit?.id ? `Edit ${edit.name}` : 'New service'}
        footer={
          <>
            {edit?.id && <button className="btn-ghost mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</button>}
            <button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save service</button>
          </>
        }
      >
        {edit && (
          <div className="space-y-5">
            <ErrorBox error={err} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={err?.fields?.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} /></Field>
              <Field label="URL slug" error={err?.fields?.slug}><input className="input" value={edit.slug} onChange={set('slug')} /></Field>
              <Field label="Category">
                <select className="input" value={edit.category} onChange={set('category')}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </Field>
              <Field label="Matches drawn surface">
                <select className="input" value={edit.surfaceType} onChange={set('surfaceType')}>
                  {SURFACES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.description} onChange={set('description')} /></Field>
            </div>

            <div>
              <h3 className="mb-2 text-sm">Pricing rule</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Priced by">
                  <select className="input" value={edit.unit} onChange={set('unit')}>
                    <option value="SQFT">Square foot</option><option value="LINFT">Linear foot</option><option value="FLAT">Flat rate</option>
                  </select>
                </Field>
                <Field label={edit.unit === 'FLAT' ? 'Price' : `Price per ${UNIT[edit.unit]}`}><input className="input" type="number" step="0.01" min="0" value={edit.pricePerUnit} onChange={set('pricePerUnit')} /></Field>
                <Field label="Minimum charge"><input className="input" type="number" step="1" min="0" value={edit.minimumCharge} onChange={set('minimumCharge')} /></Field>
                <Field label="Setup time (min)" hint="Fixed time per job"><input className="input" type="number" min="0" value={edit.baseMinutes} onChange={set('baseMinutes')} /></Field>
                <Field label={`Speed (${edit.unit === 'FLAT' ? 'n/a' : UNIT[edit.unit]} per hour)`} hint="Used to estimate job length"><input className="input" type="number" min="1" value={edit.unitsPerHour} onChange={set('unitsPerHour')} /></Field>
                <Field label="Sort order"><input className="input" type="number" value={edit.sortOrder} onChange={set('sortOrder')} /></Field>
              </div>
              <div className="mt-3"><Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Offered to customers" /></div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm">Surface / material multipliers</h3>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit({ ...edit, materials: [...edit.materials, { name: '', multiplier: 1 }] })}><Plus className="h-3.5 w-3.5" /> Add</button>
              </div>
              <div className="space-y-2">
                {edit.materials.map((m, i) => (
                  <div key={m.id || i} className="flex gap-2">
                    <input className="input" placeholder="e.g. Pavers" value={m.name} onChange={(e) => setList('materials', i, { name: e.target.value })} />
                    <input className="input w-28" type="number" step="0.05" min="0" value={m.multiplier} onChange={(e) => setList('materials', i, { multiplier: e.target.value })} aria-label="Multiplier" />
                    <button type="button" className="btn-ghost p-2 text-red-600" onClick={() => setEdit({ ...edit, materials: edit.materials.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm">Add-ons</h3>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit({ ...edit, addOns: [...edit.addOns, { name: '', description: '', unit: 'FLAT', price: 0, active: true }] })}><Plus className="h-3.5 w-3.5" /> Add</button>
              </div>
              <div className="space-y-3">
                {edit.addOns.map((a, i) => (
                  <div key={a.id || i} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_130px_110px_auto]">
                    <input className="input" placeholder="e.g. Sealing" value={a.name} onChange={(e) => setList('addOns', i, { name: e.target.value })} />
                    <select className="input" value={a.unit} onChange={(e) => setList('addOns', i, { unit: e.target.value })}>
                      <option value="FLAT">Flat</option><option value="SQFT">Per sq ft</option><option value="LINFT">Per linear ft</option>
                    </select>
                    <input className="input" type="number" step="0.01" min="0" value={a.price} onChange={(e) => setList('addOns', i, { price: e.target.value })} aria-label="Price" />
                    <button type="button" className="btn-ghost p-2 text-red-600" onClick={() => setEdit({ ...edit, addOns: edit.addOns.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    <input className="input sm:col-span-3" placeholder="Short description" value={a.description} onChange={(e) => setList('addOns', i, { description: e.target.value })} />
                    <Toggle checked={a.active} onChange={(v) => setList('addOns', i, { active: v })} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
