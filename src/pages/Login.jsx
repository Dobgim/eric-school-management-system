import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useStore } from '../lib/store';
import { homePath } from '../lib/permissions';
import { Logo } from '../components/Layout';
import { Button, Field, Input } from '../components/ui';
import { InstallButton } from '../components/InstallApp';

export default function Login() {
  const { school, login, serverProblem } = useStore();
  const nav = useNavigate();
  const [portal, setPortal] = useState('staff');
  const [form, setForm] = useState({ username: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await login(form.username, form.password, portal);
    setBusy(false);
    if (res.error) return setError(res.error);
    nav(homePath(res.user), { replace: true });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="relative flex items-center gap-4">
          <Logo school={school} size="lg" />
          <div>
            <p className="font-display text-xl font-semibold">{school.name}</p>
            {school.motto && <p className="text-brand-300 italic">“{school.motto}”</p>}
          </div>
        </div>
        <div className="relative max-w-md border-l-2 border-accent-400 pl-6">
          <h1 className="text-[2.6rem] leading-[1.1] font-semibold">One place for pupils, fees, staff and parents.</h1>
          <p className="mt-4 text-brand-200">Admissions, school fees with MTN &amp; Orange Mobile Money, payroll, uniforms and materials, reports for management and PTA meetings, and a portal for parents.</p>
        </div>
        <p className="relative text-sm text-brand-300">{[school.address, school.phone].filter(Boolean).join(' · ')}</p>
      </div>

      <div className="flex items-center justify-center bg-white px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo school={school} />
            <p className="font-bold text-slate-900">{school.name}</p>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use the account given to you by the school.</p>
          {typeof navigator !== 'undefined' && !navigator.onLine && <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">You’re offline. Sign in once while connected — after that the app opens and shows your information without internet.</p>}
          {serverProblem && <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>Can’t reach the school server.</b> {serverProblem}</p>}

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {[['staff', 'Staff'], ['parent', 'Parents']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setPortal(id); setError(''); }} className={`rounded-lg py-2 transition ${portal === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Username">
              <Input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoFocus />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="pr-10" />
                <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" icon={LogIn} className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-500">
            <span>Parents: get the app on your phone</span>
            <InstallButton size="sm" />
          </div>
          <div className="mt-6 rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-sm text-slate-600">New here?</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link to="/signup"><Button variant="secondary" size="sm">Parent sign-up</Button></Link>
              <Link to="/signup?as=staff"><Button variant="secondary" size="sm">Staff: I have an invitation</Button></Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">Forgot your password? Ask the school office to reset it.</p>
        </div>
      </div>
    </div>
  );
}
