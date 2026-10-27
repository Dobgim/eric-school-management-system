import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, CheckCircle2, Clock, Eye, EyeOff, Users } from 'lucide-react';
import { request, useStore } from '../lib/store';
import { homePath } from '../lib/permissions';
import { Logo } from '../components/Layout';
import { Button, Field, Input, Select, Textarea } from '../components/ui';

const DEPARTMENTS = [
  { value: 'teacher', label: 'Teaching staff (Teacher)' },
  { value: 'admin', label: 'Administration / Secretariat' },
  { value: 'bursar', label: 'Bursary / Accounts' },
  { value: 'staff', label: 'Other staff (nurse, store, kitchen, security, cleaning…)' },
];

function PasswordInput({ value, onChange, autoComplete = 'new-password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} required minLength={8} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export default function Signup() {
  const { school, enter } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = params.get('as') === 'staff' ? 'staff' : 'parent';
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', confirm: '', relationship: 'Father', childRegNo: '', childDob: '', role: 'teacher', position: '', username: '', message: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      const body = type === 'parent'
        ? { type, name: f.name, phone: f.phone, email: f.email, password: f.password, relationship: f.relationship, childRegNo: f.childRegNo, childDob: f.childDob }
        : { type, name: f.name, phone: f.phone, email: f.email, password: f.password, role: f.role, position: f.position, username: f.username, message: f.message };
      const res = await request('/api/auth/signup', { method: 'POST', body });
      if (res.status === 'active') {
        await enter(res.user);
        nav(homePath(res.user), { replace: true });
        return;
      }
      setPending(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <Shell school={school}>
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-amber-50 text-amber-600"><Clock className="size-8" /></div>
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Request sent</h2>
          <p className="mt-2 text-slate-600">
            {type === 'parent'
              ? 'The school office will confirm which pupil(s) are yours. You can sign in with your phone number and password as soon as your account is approved.'
              : 'The school administrator will review your request and set your access. You can sign in with your username and password once it is approved.'}
          </p>
          <Link to="/"><Button className="mt-6">Back to sign in</Button></Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell school={school}>
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Back to sign in</Link>
      <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Create an account</h2>
      <p className="mt-1 text-sm text-slate-500">For parents and guardians of pupils, and for members of staff.</p>

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {[['parent', 'Parent / Guardian', Users], ['staff', 'School staff', Briefcase]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => { setParams(id === 'staff' ? { as: 'staff' } : {}, { replace: true }); setError(''); }} className={`flex items-center justify-center gap-2 rounded-lg py-2 transition ${type === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Full name"><Input value={f.name} onChange={set('name')} autoComplete="name" required placeholder={type === 'parent' ? 'e.g. Mr. John Tabi' : 'e.g. Grace Ngwa'} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" hint={type === 'parent' ? 'You will sign in with this number.' : undefined}><Input type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} autoComplete="tel" required placeholder="677 12 34 56" /></Field>
          <Field label="Email (optional)"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        </div>

        {type === 'parent' ? (
          <>
            <Field label="You are the pupil's"><Select value={f.relationship} onChange={set('relationship')} options={['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling']} /></Field>
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
              <p className="mb-3 text-sm font-semibold text-brand-900">Your child (to link your account)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Registration number" hint="On receipts and the admission letter."><Input value={f.childRegNo} onChange={set('childRegNo')} required placeholder="e.g. SCH/2026/0001" /></Field>
                <Field label="Date of birth"><Input type="date" value={f.childDob} onChange={set('childDob')} required /></Field>
              </div>
              <p className="mt-3 text-xs text-slate-600">If these and your phone number match the school’s records, your account opens straight away and shows all your children. Otherwise the school office confirms it first.</p>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department"><Select value={f.role} onChange={set('role')} options={DEPARTMENTS} /></Field>
              <Field label="Job title"><Input value={f.position} onChange={set('position')} required placeholder="e.g. Class Teacher, Bursar, Nurse" /></Field>
            </div>
            <Field label="Username" hint="Letters and numbers, used to sign in."><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} autoComplete="username" required minLength={3} /></Field>
            <Field label="Message to the administrator (optional)"><Textarea rows={2} value={f.message} onChange={set('message')} placeholder="e.g. I teach Class 4 from this term." /></Field>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" hint="At least 8 characters."><PasswordInput value={f.password} onChange={set('password')} /></Field>
          <Field label="Confirm password"><PasswordInput value={f.confirm} onChange={set('confirm')} /></Field>
        </div>

        {type === 'staff' && <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />Staff accounts are approved by the school administrator, who sets your access.</p>}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
      </form>
    </Shell>
  );
}

function Shell({ school, children }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo school={school} />
          <p className="font-extrabold text-slate-900">{school.name}</p>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
