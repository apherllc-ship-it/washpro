import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp, homeFor } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { ErrorBox, Field, Spinner } from '../components/ui.jsx';

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-4 text-center text-sm text-slate-600">{footer}</p>}
    </div>
  );
}

// Only allow internal redirects after login.
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

export function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(form.email, form.password);
      navigate(safeNext(params.get('next')) || homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to manage quotes and appointments."
      footer={
        <>
          New here? <Link className="font-medium text-brand-700" to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create an account</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4 text-white" />} Sign in
        </button>
      </form>
    </AuthCard>
  );
}

export function Signup() {
  const { signup } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', smsOptIn: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await signup(form);
      navigate(safeNext(params.get('next')) || homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Save quotes, book online and track your appointment live."
      footer={
        <>
          Already have an account? <Link className="font-medium text-brand-700" to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Full name" error={error?.fields?.name}>
          <input className="input" autoComplete="name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email" error={error?.fields?.email}>
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Mobile phone (optional)" error={error?.fields?.phone}>
          <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="+1 555 555 5555" />
        </Field>
        <Field label="Password" error={error?.fields?.password} hint="At least 8 characters with a letter and a number.">
          <input className="input" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" className="mt-0.5 rounded border-slate-300" checked={form.smsOptIn} onChange={set('smsOptIn')} />
          Text me appointment updates (message & data rates may apply)
        </label>
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4 text-white" />} Create account
        </button>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/auth/forgot-password', { email });
      setMsg(r.message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link className="text-brand-700" to="/login">Back to sign in</Link>}>
      {msg ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={error} />
          <Field label="Email">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>Send reset link</button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const { setUser } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post('/auth/reset-password', { token: params.get('token') || '', password });
      setUser(user);
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="New password" error={error?.fields?.password} hint="At least 8 characters with a letter and a number.">
          <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>Save password</button>
      </form>
    </AuthCard>
  );
}
