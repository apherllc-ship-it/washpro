import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Droplets, LayoutDashboard, FileText, CalendarDays, User, LogOut, Calculator, Users, Wrench, Settings, Briefcase, ClipboardList, Menu, X, Contact,
} from 'lucide-react';
import { useApp, homeFor } from '../context/AppContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import { Toast } from './ui.jsx';

const NAV = {
  CUSTOMER: [
    { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
    { to: '/quote', label: 'New quote', icon: Calculator },
    { to: '/app/bookings', label: 'Bookings', icon: CalendarDays },
    { to: '/app/quotes', label: 'Quotes', icon: FileText },
    { to: '/app/profile', label: 'Profile', icon: User },
  ],
  PRO: [
    { to: '/pro', label: 'My jobs', icon: Briefcase, end: true },
    { to: '/pro/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/app/profile', label: 'Profile', icon: User },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
    { to: '/admin/quotes', label: 'Quotes', icon: FileText },
    { to: '/admin/customers', label: 'Customers', icon: Contact },
    { to: '/admin/users', label: 'Team & users', icon: Users },
    { to: '/admin/services', label: 'Services & pricing', icon: Wrench },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
    { to: '/pro', label: 'My jobs', icon: Briefcase, end: true },
  ],
};

// Up to 4 items shown in the mobile bottom bar
const MOBILE = { CUSTOMER: [0, 1, 2, 4], PRO: [0, 1, 2], ADMIN: [0, 1, 2, 4] };

export function Brand({ light }) {
  const { config } = useApp();
  return (
    <span className={`flex items-center gap-2 font-semibold ${light ? 'text-white' : 'text-slate-900'}`}>
      <span className="rounded-lg bg-brand-600 p-1.5 text-white">
        <Droplets className="h-5 w-5" />
      </span>
      <span className="truncate">{config?.businessName || 'WashPro'}</span>
    </span>
  );
}

export function PublicHeader() {
  const { user } = useApp();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/">
          <Brand />
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/quote" className="btn-ghost hidden sm:inline-flex">
            Instant quote
          </Link>
          {user ? (
            <Link to={homeFor(user)} className="btn-primary">
              My account
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link to="/signup" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PublicLayout() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <Outlet />
      <Toast />
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV[user.role];
  const mobile = MOBILE[user.role].map((i) => items[i]);

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`;

  const sidebar = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {items.map((it) => (
        <NavLink key={it.to + it.label} to={it.to} end={it.end} className={linkCls} onClick={() => setOpen(false)}>
          <it.icon className="h-4 w-4" />
          {it.label}
        </NavLink>
      ))}
      <div className="mt-auto border-t border-slate-100 pt-3">
        <div className="px-3 pb-2 text-xs text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{user.name}</span>
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase">{user.role}</span>
        </div>
        <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <Link to={homeFor(user)} className="flex h-16 items-center border-b border-slate-100 px-4">
          <Brand />
        </Link>
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <Brand />
              <button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <button className="btn-ghost -ml-2 p-2 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Link to={homeFor(user)} className="md:hidden">
              <Brand />
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {user.role === 'CUSTOMER' && (
              <Link to="/quote" className="btn-primary btn-sm hidden sm:inline-flex">
                <Calculator className="h-4 w-4" /> Get a quote
              </Link>
            )}
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${mobile.length}, 1fr)` }}>
        {mobile.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-700' : 'text-slate-500'}`}
          >
            <it.icon className="h-5 w-5" />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <Toast />
    </div>
  );
}
