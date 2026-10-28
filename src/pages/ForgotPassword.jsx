import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { request, useStore } from '../lib/store';
import { Logo } from '../components/Layout';
import { Button, Field, Input } from '../components/ui';
import { PasswordInput } from './Signup';

/**
 * Parents prove who they are with details only they and the school know (their phone number plus
 * one child's registration number and date of birth), then choose a new password. Staff ask the office.
 */
export default function ForgotPassword() {
  const { school, enter } = useStore();
  const nav = useNavigate();
  const [who, setWho] = useState('parent');
  const [f, setF] = useState({ phone: '', childRef: '', childDob: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      const res = await request('/api/auth/reset-parent', { method: 'POST', body: { phone: f.phone, childRef: f.childRef, childDob: f.childDob, password: f.password } });
      nav('/portal', { replace: true });
      await enter(res.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4" />Back to sign in</Link>
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Logo school={school} />
            <p className="font-bold text-slate-900">{school.name}</p>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Reset your password</h1>

          <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {[['parent', 'Parents'], ['staff', 'Staff']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setWho(id); setError(''); }} className={`rounded-lg py-2 transition ${who === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>

          {who === 'parent' ? (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <p className="text-sm text-slate-600">Confirm one of your children’s details, then choose a new password. You’ll be signed in straight away.</p>
              <Field label="Your phone number" hint="The number you signed up with or gave the school.">
                <Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="6XX XXX XXX" required autoFocus />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Child’s registration no." hint="Or the APP-… reference of a pending application.">
                  <Input value={f.childRef} onChange={set('childRef')} required />
                </Field>
                <Field label="Child’s date of birth">
                  <Input type="date" value={f.childDob} onChange={set('childDob')} required />
                </Field>
              </div>
              <Field label="New password" hint="At least 8 characters."><PasswordInput value={f.password} onChange={set('password')} /></Field>
              <Field label="Repeat new password"><PasswordInput value={f.confirm} onChange={set('confirm')} /></Field>
              {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              <Button type="submit" icon={KeyRound} className="w-full" disabled={busy}>{busy ? 'Checking…' : 'Reset password and sign in'}</Button>
            </form>
          ) : (
            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <p>For security, staff passwords are reset by the school’s administrator. Ask them to set a temporary password for you under <b>Users &amp; Activity</b>, then change it under <b>My account</b> after you sign in.</p>
              {(school.phone || school.email) && <p>School office: {[school.phone, school.email].filter(Boolean).join(' · ')}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
