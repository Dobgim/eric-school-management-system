import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileUp, Plus, Send, Trash2, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { fmtDate, readFileAsDataURL, today, uid } from '../lib/utils';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select } from '../components/ui';
import OutboxNotice from '../components/Outbox';

const blankChild = () => ({ key: uid('k'), firstName: '', otherNames: '', lastName: '', gender: '', dob: '', classId: '', placeOfBirth: '', previousSchool: '', allergies: '', medicalNotes: '', documents: [] });
export const APPLICATION_STATUS = { pending: ['amber', 'Under review'], accepted: ['green', 'Admitted'], rejected: ['red', 'Not accepted'] };

/** Parents register one or several children for admission in one go. */
export default function ParentAdmissions() {
  const { db, user, api } = useStore();
  const [params] = useSearchParams();
  const guardian = db.guardians.find((g) => g.id === user.guardianId);
  const surname = (guardian?.name || user.name).replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '').split(/\s+/).slice(-1)[0] || '';
  const [children, setChildren] = useState(() => [{ ...blankChild(), lastName: surname }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [queued, setQueued] = useState(false);
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const apps = [...db.admissionApplications].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const update = (key, patch) => setChildren((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const addDoc = async (key, file) => {
    if (!file) return;
    if (!/pdf|image\//.test(file.type)) return setError('Documents must be a photo or a PDF.');
    if (file.size > 1_500_000) return setError('Each document must be under 1.5 MB.');
    const doc = { name: 'Birth Certificate', fileName: file.name, size: file.size, dataUrl: await readFileAsDataURL(file) };
    setChildren((cs) => cs.map((c) => (c.key === key ? { ...c, documents: [...c.documents, doc].slice(0, 3) } : c)));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const bad = children.findIndex((c) => !c.firstName.trim() || !c.lastName.trim() || !c.gender || !c.dob || !c.classId);
    if (bad >= 0) return setError(`Child ${bad + 1}: fill in first name, surname, sex, date of birth and class.`);
    setBusy(true);
    try {
      const ops = children.map(({ key, ...c }) => ({ t: 'put', c: 'admissionApplications', v: { ...c, id: uid('app') } }));
      // Sent now when online (the server notifies the office); offline, kept on the phone and sent later.
      const r = await api.submit('/api/ops', { ops }, `Admission application for ${children.map((c) => c.firstName).join(', ')}`);
      if (r.sent) await api.reload();
      setQueued(!!r.queued);
      setSent(children.length);
      setChildren([{ ...blankChild(), lastName: surname }]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Register children" subtitle={`Apply for admission to ${db.school.name}. Add all your children in one go — the school will review each one.`} />

      <OutboxNotice />
      {params.get('welcome') && !apps.length && !sent && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <b>Welcome, {user.name.split(' ')[0]}!</b> Your account is ready. Fill in a form below for each child you want to register.
        </div>
      )}
      {sent > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="flex-1">{queued
            ? <><b>Saved on your phone.</b> You’re offline, so {sent === 1 ? 'this application' : `these ${sent} applications`} will be sent to the school automatically when you’re back online.</>
            : <><b>{sent === 1 ? 'Application sent.' : `${sent} applications sent.`}</b> The school office will review {sent === 1 ? 'it' : 'them'} and you’ll be notified. Admitted children appear on your dashboard with their registration number.</>}</div>
          <button type="button" onClick={() => setSent(0)} aria-label="Dismiss"><X className="size-4" /></button>
        </div>
      )}

      {apps.length > 0 && (
        <Card title="Your applications" className="mb-6" bodyClass="">
          <ul className="divide-y divide-slate-100">
            {apps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{a.firstName} {a.lastName}</p>
                  <p className="text-xs text-slate-500">
                    {db.classes.find((c) => c.id === (a.admittedClassId || a.classId))?.name} · applied {fmtDate(a.createdAt)} · <span className="font-mono">{a.ref}</span>
                    {a.regNo && <> · reg. no <span className="font-mono">{a.regNo}</span></>}
                  </p>
                  {a.reviewNote && <p className="mt-1 text-xs text-slate-600">{a.reviewNote}</p>}
                </div>
                <Badge tone={APPLICATION_STATUS[a.status][0]}>{APPLICATION_STATUS[a.status][1]}</Badge>
                {a.status === 'accepted' && <Link to={`/portal/children?child=${a.studentId}`} className="text-sm font-semibold text-brand-700 hover:underline">View</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form onSubmit={submit} className="space-y-4">
        {children.map((c, i) => (
          <Card key={c.key} title={`Child ${i + 1}${c.firstName ? ` — ${c.firstName}` : ''}`} actions={children.length > 1 && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setChildren(children.filter((x) => x.key !== c.key))}>Remove</Button>}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name *"><Input value={c.firstName} onChange={(e) => update(c.key, { firstName: e.target.value })} /></Field>
              <Field label="Other names"><Input value={c.otherNames} onChange={(e) => update(c.key, { otherNames: e.target.value })} /></Field>
              <Field label="Surname *"><Input value={c.lastName} onChange={(e) => update(c.key, { lastName: e.target.value })} /></Field>
              <Field label="Sex *"><Select value={c.gender} onChange={(e) => update(c.key, { gender: e.target.value })} placeholder="— Choose —" options={[{ value: 'M', label: 'Boy' }, { value: 'F', label: 'Girl' }]} /></Field>
              <Field label="Date of birth *"><Input type="date" max={today()} value={c.dob} onChange={(e) => update(c.key, { dob: e.target.value })} /></Field>
              <Field label="Class applying for *"><Select value={c.classId} onChange={(e) => update(c.key, { classId: e.target.value })} placeholder="— Choose class —" options={classes.map((x) => ({ value: x.id, label: x.name }))} /></Field>
              <Field label="Place of birth"><Input value={c.placeOfBirth} onChange={(e) => update(c.key, { placeOfBirth: e.target.value })} /></Field>
              <Field label="Previous school" className="sm:col-span-2"><Input value={c.previousSchool} onChange={(e) => update(c.key, { previousSchool: e.target.value })} placeholder="Leave empty if this is the first school" /></Field>
              <Field label="Allergies"><Input value={c.allergies} onChange={(e) => update(c.key, { allergies: e.target.value })} /></Field>
              <Field label="Health notes" className="sm:col-span-2"><Input value={c.medicalNotes} onChange={(e) => update(c.key, { medicalNotes: e.target.value })} placeholder="Anything the school should know" /></Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
                <FileUp className="size-4" /> Birth certificate (optional)
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { addDoc(c.key, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {c.documents.map((d, j) => (
                <span key={j} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  {d.fileName}
                  <button type="button" onClick={() => update(c.key, { documents: c.documents.filter((_, k) => k !== j) })} aria-label="Remove document"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          </Card>
        ))}

        <button type="button" onClick={() => setChildren([...children, { ...blankChild(), lastName: children.at(-1)?.lastName || surname }])} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white py-4 text-sm font-bold text-slate-600 hover:border-brand-400 hover:text-brand-700">
          <Plus className="size-4" /> Add another child
        </button>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">{children.length} child{children.length === 1 ? '' : 'ren'} in this application</p>
          <Button type="submit" icon={Send} disabled={busy}>{busy ? 'Sending…' : `Send ${children.length === 1 ? 'application' : `${children.length} applications`}`}</Button>
        </div>
      </form>
      {!apps.length && !children.length && <Empty />}
    </>
  );
}
