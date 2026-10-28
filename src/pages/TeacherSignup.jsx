import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, GraduationCap, KeyRound, Plus, Trash2, UserCheck } from 'lucide-react';
import { request, useStore } from '../lib/store';
import { Logo } from '../components/Layout';
import LanguageSwitch from '../components/LanguageSwitch';
import { Button, Field, Input, Select } from '../components/ui';
import { PasswordInput } from './Signup';

/**
 * Teacher sign-up: full name, the classes and subjects they teach, and proof that they really work at the school —
 * an invitation code from the school, or their phone number already on the school's staff list (then the
 * super admin approves). What they teach is confirmed by the office before it gives them access to marks.
 */
export default function TeacherSignup() {
  const { school, enter } = useStore();
  const nav = useNavigate();
  const [classes, setClasses] = useState([]);
  const [proof, setProof] = useState('code');
  const [f, setF] = useState({ inviteCode: '', name: '', gender: 'F', phone: '', email: '', username: '', password: '', confirm: '', classTeacherOf: '' });
  const [teaching, setTeaching] = useState([{ subject: '', classIds: [] }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { request('/api/public/classes').then(setClasses).catch(() => setError('Could not load the school’s classes. Check your connection and reload.')); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const subjects = [...new Set(classes.flatMap((c) => c.subjects))];
  const setRow = (i, patch) => setTeaching(teaching.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    if (proof === 'code' && f.inviteCode.replace(/[^A-Za-z0-9]/g, '').length < 8) return setError('Enter the invitation code from the school.');
    const rows = teaching.filter((t) => t.subject && t.classIds.length);
    if (!rows.length && !f.classTeacherOf) return setError('Choose the classes and subjects you teach.');
    setBusy(true);
    try {
      const res = await request('/api/auth/teacher-signup', { method: 'POST', body: { ...f, inviteCode: proof === 'code' ? f.inviteCode : '', teaching: rows, classTeacherOf: f.classTeacherOf || null } });
      if (res.status === 'active') {
        nav('/my-class', { replace: true });
        await enter(res.user);
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
          <Clock className="mx-auto size-12 text-amber-500" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Request sent</h1>
          <p className="mt-2 text-slate-600">Your phone number is on the school’s staff list. The school’s administrator will check and approve your account; you can sign in as soon as it is approved.</p>
          <Link to="/login"><Button className="mt-6" variant="secondary">Back to sign in</Button></Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell school={school}>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-brand-50 text-brand-700"><GraduationCap className="size-6" /></span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Teacher sign-up</h1>
          <p className="text-sm text-slate-600">For the school’s teachers only.</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="label">How do we know you teach here?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[['code', KeyRound, 'I have an invitation code', 'From the school. Your account opens straight away.'], ['staff', UserCheck, 'The office added me to the staff list', 'With my phone number. The administrator approves my account.']].map(([id, Icon, title, text]) => (
              <button key={id} type="button" aria-pressed={proof === id} onClick={() => setProof(id)} className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left ${proof === id ? 'border-brand-700 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <Icon className={`mt-0.5 size-5 shrink-0 ${proof === id ? 'text-brand-700' : 'text-slate-400'}`} />
                <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{text}</span></span>
              </button>
            ))}
          </div>
        </fieldset>
        {proof === 'code' && <Field label="Invitation code" hint="Given to you by the school (e.g. K7QM-29XP)."><Input value={f.inviteCode} onChange={(e) => setF({ ...f, inviteCode: e.target.value.toUpperCase() })} placeholder="XXXX-XXXX" required autoComplete="off" /></Field>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. Grace Ayuk" required autoComplete="name" /></Field>
          <Field label="Sex"><Select value={f.gender} onChange={set('gender')} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} /></Field>
          <Field label="Phone number" hint={proof === 'staff' ? 'The number the school has on the staff list.' : undefined}><Input type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="6XX XXX XXX" required /></Field>
          <Field label="Email (optional)"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          <Field label="Username" hint="Letters and numbers, used to sign in."><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} required autoComplete="username" /></Field>
          <Field label="Password" hint="At least 8 characters."><PasswordInput value={f.password} onChange={set('password')} /></Field>
          <Field label="Confirm password"><PasswordInput value={f.confirm} onChange={set('confirm')} /></Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="font-semibold text-slate-900">What you teach</p>
          <p className="mb-3 text-xs text-slate-500">The office confirms this before you can enter marks.</p>
          <Field label="Class teacher of"><Select value={f.classTeacherOf} onChange={set('classTeacherOf')} placeholder="I am not a class teacher" options={classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <p className="mt-4 mb-2 text-sm font-semibold text-slate-700">Subjects you teach</p>
          <div className="space-y-3">
            {teaching.map((t, i) => {
              const offered = classes.filter((c) => !t.subject || c.subjects.includes(t.subject));
              return (
                <div key={i} className="rounded-md bg-slate-50 p-3">
                  <div className="flex gap-2">
                    <Select value={t.subject} onChange={(e) => setRow(i, { subject: e.target.value, classIds: t.classIds.filter((id) => classes.find((c) => c.id === id)?.subjects.includes(e.target.value)) })} placeholder="— Choose a subject —" options={subjects} aria-label="Subject" />
                    {teaching.length > 1 && <Button variant="ghost" icon={Trash2} onClick={() => setTeaching(teaching.filter((_, j) => j !== i))} aria-label="Remove subject" />}
                  </div>
                  {t.subject && (
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Classes for ${t.subject}`}>
                      {offered.map((c) => {
                        const on = t.classIds.includes(c.id);
                        return <button key={c.id} type="button" aria-pressed={on} onClick={() => setRow(i, { classIds: on ? t.classIds.filter((id) => id !== c.id) : [...t.classIds, c.id] })} className={`rounded-sm border px-2 py-1 text-xs font-medium ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400'}`}>{c.name}</button>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button className="mt-3" size="sm" variant="secondary" icon={Plus} onClick={() => setTeaching([...teaching, { subject: '', classIds: [] }])}>Add another subject</Button>
        </div>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" className="w-full py-3" disabled={busy}>{busy ? 'Creating account…' : 'Create my teacher account'}</Button>
        <p className="text-center text-xs text-slate-500">Only teachers invited by the school, or already on its staff list, can create an account.</p>
      </form>
    </Shell>
  );
}

function Shell({ school, children }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link to="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4" />Back to sign in</Link>
          <LanguageSwitch />
        </div>
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3"><Logo school={school} /><p className="font-bold text-slate-900">{school.name}</p></div>
          {children}
        </div>
      </div>
    </div>
  );
}
