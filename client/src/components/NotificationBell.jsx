import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { ago } from '../lib/format.js';

export default function NotificationBell() {
  const { data, reload } = useApi('/me/notifications', { pollMs: 30000 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = data?.unread || 0;

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open && unread) {
      await api.post('/me/notifications/read').catch(() => {});
      reload(true);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost relative p-2" onClick={toggle} aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Notifications</div>
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {!data?.notifications?.length && <p className="px-4 py-6 text-center text-sm text-slate-500">You're all caught up.</p>}
            {data?.notifications?.map((n) => {
              const inner = (
                <>
                  <p className={`text-sm ${n.read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{ago(n.createdAt)}</p>
                </>
              );
              return n.link ? (
                <Link key={n.id} to={n.link} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-slate-50">
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className="px-4 py-3">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
