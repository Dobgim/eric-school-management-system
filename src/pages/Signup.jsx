import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Baby, Briefcase, CheckCircle2, Clock, Eye, EyeOff, KeyRound, School, Users, XCircle } from 'lucide-react';
import { request, useStore } from '../lib/store';
import { homePath } from '../lib/permissions';
import { fmtDate } from '../lib/utils';
import { Logo } from '../components/Layout';
import { Button, Field, Input, Select } from '../components/ui';

function PasswordInput({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={onChange} required minLength={8} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

const Choice = ({ active, onClick, icon: Icon, title, text }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition ${active ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon className="size-4.5" /></span>
    <span><span className="block text-sm font-bold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{text}</span></span>
  </button>
);

export default function Signup() {
  const { school, enter, serverProblem } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const invite = params.get('invite') || '';
  const type = params.get('as') === 'staff' || invite ? 'staff' : 'parent';
  const [mode, setMode] = useState('new'); // parent: new family | existing pupil
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', confirm: '', relationship: 'Father', childRegNo: '', childDob: '', address: '', inviteCode: invite, position: '', username: '', gender: 'F' });
  const [check, setCheck] = useState(null); // invitation look-up result
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Look up the invitation as soon as a full code is entered (or arrives in the link).
  useEffect(() => {
    if (type !== 'staff') return;
    const code = f.inviteCode.replace(/[^a-z0-9]/gi, '');
    if (code.length < 8) { setCheck(null); return; }
    let live = true;
    request(`/api/invites/check?code=${encodeURIComponent(code)}`).then((r) => {
      if (!live) return;
      setCheck(r);
      if (r.valid) setF((x) => ({ ...x, name: x.name || r.name, position: x.position || r.position }));
    }).catch((e) => live && setCheck({ valid: false, reason: e.message }));
    return () => { live = false; };
  }, [f.inviteCode, type]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    if (type === 'staff' && !check?.valid) return setError('Enter a valid invitation code from the school first.');
    setBusy(true);
    try {
      const body = type === 'parent'
        ? { type, mode, name: f.name, phone: f.phone, email: f.email, password: f.password, relationship: f.relationship, address: f.address, childRegNo: f.childRegNo, childDob: f.childDob }
        : { type, inviteCode: f.inviteCode, name: f.name, phone: f.phone, email: f.email, password: f.password, position: f.position, username: f.username, gender: f.gender };
      const res = await request('/api/auth/signup', { method: 'POST', body });
      if (res.status === 'active') {
        // Go to the destination first: once signed in, this page is replaced by the app's own routes.
        nav(type === 'parent' && mode === 'new' ? '/portal/admissions?welcome=1' : homePath(res.user), { replace: true });
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
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-amber-50 text-amber-600"><Clock className="size-8" /></div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Request sent</h2>
          <p className="mt-2 text-slate-600">We couldn’t match your details to a pupil automatically, so the school office will confirm which children are yours. You can sign in with your phone number and password as soon as it’s approved.</p>
          <Link to="/"><Button className="mt-6">Back to sign in</Button></Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell school={school}>
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Back to sign in</Link>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">{type === 'parent' ? 'Create a parent account' : 'Join as a member of staff'}</h2>
      <p className="mt-1 text-sm text-slate-500">{type === 'parent' ? 'For parents and guardians.' : 'Staff accounts need an invitation from the school.'}</p>
      {serverProblem && <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>Can’t reach the school server.</b> {serverProblem}</p>}

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {[['parent', 'Parent / Guardian', Users], ['staff', 'Staff (invitation)', Briefcase]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => { setParams(id === 'staff' ? { as: 'staff' } : {}, { replace: true }); setError(''); }} className={`flex items-center justify-center gap-2 rounded-lg px-1 py-2 transition ${type === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>
            <Icon className="size-4 shrink-0" />{label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {type === 'parent' ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice active={mode === 'new'} onClick={() => setMode('new')} icon={Baby} title="Register my child(ren)" text="New to the school — apply for one or more children after signing up." />
              <Choice active={mode === 'existing'} onClick={() => setMode('existing')} icon={School} title="My child already attends" text="Link your account using your child’s registration number." />
            </div>
            <Field label="Full name"><Input value={f.name} onChange={set('name')} autoComplete="name" required placeholder="e.g. Mr. John Tabi" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number" hint="You will sign in with this number."><Input type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} autoComplete="tel" required placeholder="677 12 34 56" /></Field>
              <Field label="Email (optional)"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="You are the child’s"><Select value={f.relationship} onChange={set('relationship')} options={['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling']} /></Field>
              {mode === 'new' && <Field label="Home address (optional)"><Input value={f.address} onChange={set('address')} placeholder="Quarter, town" /></Field>}
            </div>
            {mode === 'existing' && (
              <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                <p className="mb-3 text-sm font-semibold text-brand-900">One of your children at the school</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Registration number" hint="On receipts and the admission letter."><Input value={f.childRegNo} onChange={set('childRegNo')} required placeholder="e.g. SCH/2026/0001" /></Field>
                  <Field label="Date of birth"><Input type="date" value={f.childDob} onChange={set('childDob')} required /></Field>
                </div>
                <p className="mt-3 text-xs text-slate-600">If these and your phone number match the school’s records, your account opens straight away and shows all your children.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="Invitation code" hint="Given to you by the school (e.g. K7QM-29XP).">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input value={f.inviteCode} onChange={(e) => setF({ ...f, inviteCode: e.target.value.toUpperCase() })} className="pl-9 font-mono tracking-widest uppercase" required placeholder="XXXX-XXXX" />
              </div>
            </Field>
            {check && (check.valid
              ? <p className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />Invitation for <b>{check.roleLabel}</b>{check.name ? ` — ${check.name}` : ''}. Valid until {fmtDate(check.expiresAt)}.</p>
              : <p className="flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><XCircle className="mt-0.5 size-4 shrink-0" />{check.reason}</p>)}
            {!check && <p className="text-xs text-slate-500">Don’t have a code? Ask the school administrator to invite you. Parents should use the Parent tab.</p>}
            {check?.valid && (
              <>
                <Field label="Full name"><Input value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone number"><Input type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} autoComplete="tel" required placeholder="677 12 34 56" /></Field>
                  <Field label="Email (optional)"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Job title"><Input value={f.position} onChange={set('position')} placeholder="e.g. Class Teacher, Nurse" /></Field>
                  <Field label="Sex"><Select value={f.gender} onChange={set('gender')} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} /></Field>
                </div>
                <Field label="Username" hint="Letters and numbers, used to sign in."><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} autoComplete="username" required minLength={3} /></Field>
              </>
            )}
          </>
        )}

        {(type === 'parent' || check?.valid) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" hint="At least 8 characters."><PasswordInput value={f.password} onChange={set('password')} /></Field>
            <Field label="Confirm password"><PasswordInput value={f.confirm} onChange={set('confirm')} /></Field>
          </div>
        )}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        {(type === 'parent' || check?.valid) && <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating account…' : type === 'parent' && mode === 'new' ? 'Create account & register children' : 'Create account'}</Button>}
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
          <p className="font-bold text-slate-900">{school.name}</p>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
