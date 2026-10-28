import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Plus, Trash2, Sun, PencilRuler, AlertTriangle, Keyboard, Save } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { loadGoogleMaps, SURFACES, surfaceByKey, autoQuantity, ROOF_PITCH } from '../lib/maps.js';
import { CATEGORY, UNIT, UNIT_SHORT, money } from '../lib/format.js';
import AddressSearch from '../components/AddressSearch.jsx';
import MeasureMap from '../components/MeasureMap.jsx';
import QuoteSummary from '../components/QuoteSummary.jsx';
import { ErrorBox, PageLoader, Spinner, Field } from '../components/ui.jsx';

const DRAFT_KEY = 'wp_quote_draft';
const defaultMaterial = (s) => (s?.materials?.find((m) => m.multiplier === 1) || s?.materials?.[0])?.id || null;
let seq = 0;
const newId = () => `a${Date.now().toString(36)}${seq++}`;

function servicesFor(services, surface, kind) {
  const exact = services.filter((s) => s.surfaceType === surface);
  if (exact.length) return exact;
  const unit = kind === 'polyline' ? 'LINFT' : 'SQFT';
  return services.filter((s) => s.unit === unit);
}

export default function QuoteBuilder() {
  const { config, user, notify } = useApp();
  const navigate = useNavigate();
  const { data: svcData } = useApi('/public/services');
  const services = useMemo(() => svcData?.services || [], [svcData]);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const [google, setGoogle] = useState(null);
  const [mapsError, setMapsError] = useState(null);
  const [address, setAddress] = useState(null);
  const [areas, setAreas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drawing, setDrawing] = useState(null); // { surface, kind, color }
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [pricing, setPricing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [solarBusy, setSolarBusy] = useState(false);

  // Load Google Maps with the runtime key.
  useEffect(() => {
    if (!config?.googleMapsKey) {
      setMapsError('Map measuring is not set up yet – you can still enter measurements manually.');
      return undefined;
    }
    const onAuth = () => setMapsError('The Google Maps key was rejected. Enter measurements manually.');
    window.addEventListener('wp-maps-auth-failed', onAuth);
    loadGoogleMaps(config.googleMapsKey).then(setGoogle).catch((e) => setMapsError(e.message));
    return () => window.removeEventListener('wp-maps-auth-failed', onAuth);
  }, [config?.googleMapsKey]);

  // Restore a draft saved before sign-in.
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (d) {
        setAddress(d.address);
        setAreas(d.areas || []);
        setNotes(d.notes || '');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const center = address?.lat != null ? { lat: address.lat, lng: address.lng } : null;

  const updateArea = useCallback(
    (id, patch) =>
      setAreas((list) =>
        list.map((a) => {
          if (a.id !== id) return a;
          const next = { ...a, ...patch };
          if (!next.manual) next.quantity = autoQuantity(next, byId.get(next.serviceId));
          return next;
        }),
      ),
    [byId],
  );

  const startDrawing = (surfaceKey) => {
    const s = surfaceByKey[surfaceKey];
    setSelectedId(null);
    setDrawing({ surface: s.key, kind: s.kind, color: s.color });
  };

  const onDrawComplete = (path, measure) => {
    const s = surfaceByKey[drawing.surface];
    const options = servicesFor(services, s.key, s.kind);
    const service = options[0];
    const count = areas.filter((a) => a.surface === s.key).length;
    const area = {
      id: newId(),
      surface: s.key,
      kind: s.kind,
      color: s.color,
      label: count ? `${s.label} ${count + 1}` : s.label,
      path,
      measure,
      stories: 1,
      pitch: 1.12,
      serviceId: service?.id || '',
      materialId: defaultMaterial(service),
      addOnIds: [],
      manual: false,
    };
    area.quantity = autoQuantity(area, service);
    setAreas((l) => [...l, area]);
    setSelectedId(area.id);
    setDrawing(null);
  };

  const addManual = (surfaceKey = 'driveway', quantity = 0, label) => {
    const s = surfaceByKey[surfaceKey];
    const service = servicesFor(services, s.key, s.kind)[0];
    const area = {
      id: newId(), surface: s.key, kind: s.kind, color: s.color, label: label || s.label, path: null, measure: null,
      stories: 1, pitch: 1, serviceId: service?.id || '', materialId: defaultMaterial(service), addOnIds: [], manual: true, quantity,
    };
    setAreas((l) => [...l, area]);
    setSelectedId(area.id);
  };

  const solarRoof = async () => {
    if (!center) return;
    setSolarBusy(true);
    try {
      const r = await api.get(`/public/measure/solar?lat=${center.lat}&lng=${center.lng}`);
      if (!r.available) notify(r.reason || 'No roof data for this address', 'error');
      else {
        addManual('roof', r.roofAreaSqft, `Roof (satellite estimate, ${r.segments.length} planes)`);
        notify(`Roof area estimated at ${r.roofAreaSqft.toLocaleString()} sq ft`);
      }
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSolarBusy(false);
    }
  };

  // Build request payload from areas.
  const payload = useMemo(() => {
    const items = areas
      .filter((a) => a.serviceId && byId.has(a.serviceId) && (a.quantity > 0 || byId.get(a.serviceId).unit === 'FLAT'))
      .map((a) => ({ serviceId: a.serviceId, quantity: Number(a.quantity) || 0, materialId: a.materialId, addOnIds: a.addOnIds, label: a.label, geometry: a.path }));
    return address?.formatted && items.length ? { address: address.formatted, lat: address.lat, lng: address.lng, items, customerNotes: notes } : null;
  }, [areas, address, notes, byId]);

  // Live price preview (debounced).
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    if (!payload) {
      setPreview(null);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setPricing(true);
      try {
        const { quote } = await api.post('/public/quote/preview', { ...payload, customerNotes: undefined });
        setPreview(quote);
        setPreviewErr(null);
      } catch (e) {
        setPreviewErr(e);
      } finally {
        setPricing(false);
      }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [payload]);

  const save = async () => {
    if (!payload) return;
    if (!user) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ address, areas, notes }));
      navigate('/signup?next=/quote');
      return;
    }
    setSaving(true);
    try {
      const { quote } = await api.post('/quotes', payload);
      sessionStorage.removeItem(DRAFT_KEY);
      notify('Quote saved');
      navigate(`/app/quotes/${quote.id}`);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!svcData) return <PageLoader />;
  const selected = areas.find((a) => a.id === selectedId);
  const isStaff = user && user.role !== 'CUSTOMER';

  return (
    <div className={user ? '' : 'mx-auto max-w-6xl px-4 py-6'}>
      <div className="mb-5">
        <h1 className="text-2xl">Instant quote</h1>
        <p className="mt-1 text-sm text-slate-500">Find your property, outline the surfaces you want cleaned, and see your price instantly.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="card p-4">
            <p className="label flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-brand-600" /> Property address
            </p>
            <AddressSearch google={google} value={address} onSelect={(a) => setAddress(a)} />
            {address?.formatted && <p className="mt-2 text-xs text-slate-500">Selected: {address.formatted}</p>}
          </div>

          {mapsError ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {mapsError}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                <span className="flex items-center gap-1 pr-1 text-sm font-medium text-slate-700">
                  <PencilRuler className="h-4 w-4" /> Draw:
                </span>
                {SURFACES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={!center}
                    onClick={() => startDrawing(s.key)}
                    className={`chip border py-1 ${drawing?.surface === s.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-40`}
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
                  </button>
                ))}
              </div>
              {google ? (
                <MeasureMap
                  google={google}
                  center={center}
                  areas={areas}
                  selectedId={selectedId}
                  drawing={drawing}
                  onDrawComplete={onDrawComplete}
                  onDrawCancel={() => setDrawing(null)}
                  onPathChange={(id, path, measure) => updateArea(id, { path, measure })}
                  onSelect={setSelectedId}
                  className="h-[55vh] min-h-[340px] rounded-none"
                />
              ) : (
                <div className="flex h-[340px] items-center justify-center">
                  <Spinner className="h-8 w-8" />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-slate-500">
                <span>
                  {!center
                    ? 'Enter your address to see the satellite view.'
                    : drawing
                      ? surfaceByKey[drawing.surface].hint || 'Tap each corner of the surface, then press Finish.'
                      : 'Select a shape to drag its corners. Right-click a corner to delete it.'}
                </span>
                {config?.solarEnabled && center && (
                  <button type="button" className="btn-secondary btn-sm" onClick={solarRoof} disabled={solarBusy}>
                    {solarBusy ? <Spinner className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />} Auto-measure roof
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h2 className="text-base">Areas to clean ({areas.length})</h2>
              <ManualAdd onAdd={addManual} />
            </div>
            {!areas.length && <p className="p-4 text-sm text-slate-500">Draw a surface on the map or add one manually with known measurements.</p>}
            <ul className="divide-y divide-slate-100">
              {areas.map((a) => (
                <AreaRow
                  key={a.id}
                  area={a}
                  selected={a.id === selectedId}
                  onSelect={() => setSelectedId(a.id)}
                  services={services}
                  service={byId.get(a.serviceId)}
                  onChange={(patch) => updateArea(a.id, patch)}
                  onRemove={() => {
                    setAreas((l) => l.filter((x) => x.id !== a.id));
                    if (selectedId === a.id) setSelectedId(null);
                  }}
                />
              ))}
            </ul>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base">Your quote</h2>
              {pricing && <Spinner className="h-4 w-4" />}
            </div>
            <ErrorBox error={previewErr} className="mt-3" />
            {preview?.outOfArea && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This address is outside our usual service area. Contact us to confirm availability.</p>
            )}
            {preview ? (
              <div className="mt-2">
                <QuoteSummary quote={preview} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{!address ? 'Start with your address.' : 'Add an area and choose a service to see your price.'}</p>
            )}
            <Field label="Notes for our team (optional)" className="mt-4">
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, pets, problem areas…" />
            </Field>
            {isStaff ? (
              <p className="mt-4 text-xs text-slate-500">Staff accounts can preview prices here. Customers save and book quotes from their own account.</p>
            ) : (
              <button className="btn-primary mt-4 w-full" disabled={!preview || saving || preview?.outOfArea} onClick={save}>
                {saving ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />}
                {user ? 'Save quote & continue' : 'Sign up to save & book'}
              </button>
            )}
            <p className="mt-2 text-center text-xs text-slate-500">You'll review and confirm the quote before choosing a time.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ManualAdd({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        <Keyboard className="h-3.5 w-3.5" /> Add manually
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {SURFACES.map((s) => (
            <button
              key={s.key}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onAdd(s.key);
                setOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AreaRow({ area, selected, onSelect, services, service, onChange, onRemove }) {
  const grouped = ['POWER_WASH', 'SOFT_WASH'].map((c) => ({ c, list: services.filter((s) => s.category === c) }));
  const unit = service?.unit || (area.kind === 'polyline' ? 'LINFT' : 'SQFT');

  const pickService = (id) => {
    const s = services.find((x) => x.id === id);
    onChange({ serviceId: id, materialId: defaultMaterial(s), addOnIds: [] });
  };

  return (
    <li className={`p-4 ${selected ? 'bg-brand-50/50' : ''}`} onClick={onSelect}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: area.color }} />
        <input className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium focus:ring-0" value={area.label} onChange={(e) => onChange({ label: e.target.value })} aria-label="Area name" />
        <button type="button" className="btn-ghost p-1.5 text-slate-400 hover:text-red-600" onClick={onRemove} aria-label="Remove area">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Service">
          <select className="input" value={area.serviceId} onChange={(e) => pickService(e.target.value)}>
            <option value="">Choose a service…</option>
            {grouped.map((g) => (
              <optgroup key={g.c} label={CATEGORY[g.c]}>
                {g.list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} – {money(s.pricePerUnit)}/{UNIT[s.unit]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {service?.materials?.length > 0 && (
          <Field label="Surface / material">
            <select className="input" value={area.materialId || ''} onChange={(e) => onChange({ materialId: e.target.value || null })}>
              {service.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.multiplier !== 1 ? ` (×${m.multiplier})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        {unit !== 'FLAT' && (
          <Field
            label={`Measurement (${UNIT_SHORT[unit]})`}
            hint={area.manual ? (area.path ? 'Manually adjusted' : 'Entered manually') : 'Measured from the map – edit to adjust'}
          >
            <div className="flex gap-2">
              <input
                className="input"
                type="number"
                min="0"
                inputMode="decimal"
                value={area.quantity}
                onChange={(e) => onChange({ quantity: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)), manual: true })}
              />
              {area.manual && area.path && (
                <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => onChange({ manual: false })}>
                  Reset
                </button>
              )}
            </div>
          </Field>
        )}

        {area.surface === 'siding' && area.path && unit === 'SQFT' && (
          <Field label="Stories" hint={`Perimeter ${Math.round(area.measure?.perimeter || 0)} ft × ${area.stories * 10} ft walls`}>
            <select className="input" value={area.stories} onChange={(e) => onChange({ stories: Number(e.target.value) })}>
              {[1, 1.5, 2, 2.5, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        )}

        {area.surface === 'roof' && area.path && unit === 'SQFT' && (
          <Field label="Roof pitch" hint={`Footprint ${Math.round(area.measure?.area || 0).toLocaleString()} sq ft`}>
            <select className="input" value={area.pitch} onChange={(e) => onChange({ pitch: Number(e.target.value) })}>
              {ROOF_PITCH.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {service?.addOns?.length > 0 && (
        <div className="mt-3">
          <p className="label">Add-ons</p>
          <div className="flex flex-wrap gap-2">
            {service.addOns.map((a) => {
              const on = area.addOnIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  title={a.description}
                  onClick={() => onChange({ addOnIds: on ? area.addOnIds.filter((x) => x !== a.id) : [...area.addOnIds, a.id] })}
                  className={`chip border py-1 ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {on ? '✓' : '+'} {a.name} · {money(a.price)}
                  {a.unit !== 'FLAT' ? `/${UNIT_SHORT[a.unit]}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}
