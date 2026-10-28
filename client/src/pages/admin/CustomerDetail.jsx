import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Mail, Phone, MapPin, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmt, fmtDate, money } from '../../lib/format.js';
import { PageHeader, PageLoader, ErrorBox, StatusBadge, QuoteBadge, StatCard } from '../../components/ui.jsx';

export default function AdminCustomerDetail() {
  const { id } = useParams();
  const { tz, notify } = useApp();
  const { data, error, reload } = useApi(`/admin/customers/${id}`);
  const [note, setNote] = useState('');

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoader />;
  const c = data.customer;
  const completed = c.bookings.filter((b) => b.status === 'COMPLETED').length;

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await api.post(`/admin/customers/${c.id}/notes`, { body: note });
      setNote('');
      reload(true);
    } catch (e2) {
      notify(e2.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader back={{ to: '/admin/customers', label: 'Customers' }} title={c.name} subtitle={`Customer since ${fmtDate(c.createdAt, tz)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spent" value={money(c.totalSpent)} tone="green" />
        <StatCard label="Completed jobs" value={completed} />
        <StatCard label="Bookings" value={c.bookings.length} />
        <StatCard label="Quotes" value={c.quotes.length} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-base">Job history</h2>
            {!c.bookings.length && <p className="p-4 text-sm text-slate-500">No bookings yet.</p>}
            <div className="divide-y divide-slate-100">
              {c.bookings.map((b) => (
                <Link key={b.id} to={`/admin/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium">#{b.number} · {fmt(b.start, tz, 'LLL d, yyyy h:mm a')}</p>
                    <p className="text-xs text-slate-500">{b.address}{b.pro && ` · ${b.pro.name}`}</p>
                  </div>
                  <div className="flex items-center gap-2"><StatusBadge status={b.status} /><span className="text-sm font-semibold">{money(b.total)}</span></div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-base">Quotes</h2>
            {!c.quotes.length && <p className="p-4 text-sm text-slate-500">No quotes.</p>}
            <div className="divide-y divide-slate-100">
              {c.quotes.map((q) => (
                <Link key={q.id} to={`/admin/quotes/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium">#{q.number} · {q.items.map((i) => i.serviceName).join(', ')}</p>
                    <p className="text-xs text-slate-500">{fmtDate(q.createdAt, tz)} · {q.address}</p>
                  </div>
                  <div className="flex items-center gap-2"><QuoteBadge status={q.status} /><span className="text-sm font-semibold">{money(q.total)}</span></div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card space-y-2 p-5 text-sm">
            <h2 className="mb-2 text-base">Contact</h2>
            <a className="flex items-center gap-2 text-brand-700" href={`mailto:${c.email}`}><Mail className="h-4 w-4" /> {c.email}</a>
            {c.phone && <a className="flex items-center gap-2 text-brand-700" href={`tel:${c.phone}`}><Phone className="h-4 w-4" /> {c.phone}</a>}
            <p className="text-xs text-slate-500">SMS updates: {c.smsOptIn ? 'opted in' : 'off'}</p>
            {c.addresses.map((a) => (
              <p key={a.id} className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> <span><span className="font-medium">{a.label}:</span> {a.formatted}</span></p>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base">CRM notes</h2>
            <form onSubmit={addNote} className="mb-4 space-y-2">
              <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Preferences, follow-ups, gate codes… (internal only)" />
              <button className="btn-primary btn-sm" disabled={!note.trim()}>Add note</button>
            </form>
            {!c.notes.length && <p className="text-sm text-slate-500">No notes yet.</p>}
            <ul className="space-y-3">
              {c.notes.map((n) => (
                <li key={n.id} className="group rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{n.author.name} · {fmt(n.createdAt, tz, 'LLL d, yyyy')}</span>
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => confirm('Delete note?') && api.del(`/admin/customers/${c.id}/notes/${n.id}`).then(() => reload(true))} aria-label="Delete note">
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
