import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, CheckCircle2, FileUp, Save, Trash2, UserPlus, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentSession } from '../lib/finance';
import { OPTIONAL_DOCS, REQUIRED_DOCS, pad, readFileAsDataURL, today, uid } from '../lib/utils';
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, useToast } from '../components/ui';

const blankGuardian = () => ({ name: '', relationship: 'Father', phone: '', altPhone: '', email: '', occupation: '', address: '' });
const MAX_DOC = 1_500_000;

export default function StudentForm() {
  const { id } = useParams();
  const { db, api } = useStore();
  const nav = useNavigate();
  const [toast, notify] = useToast();
  const existing = id ? db.students.find((s) => s.id === id) : null;
  const session = currentSession(db);

  const [s, setS] = useState(() => existing ? structuredClone(existing) : {
    firstName: '', otherNames: '', lastName: '', gender: 'M', dob: '', placeOfBirth: '', nationality: 'Cameroonian', religion: '',
    bloodGroup: '', allergies: '', medicalNotes: '', address: '', classId: '', category: 'regular', admissionDate: today(),
    previousSchool: '', photo: '', documents: [], guardianIds: [],
  });
  const [guardianMode, setGuardianMode] = useState(existing ? 'keep' : 'new');
  const [guardian, setGuardian] = useState(blankGuardian);
  const [existingGuardian, setExistingGuardian] = useState('');
  const [docName, setDocName] = useState(REQUIRED_DOCS[0]);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const missing = REQUIRED_DOCS.filter((d) => !s.documents.some((x) => x.name === d));

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) return notify('Photo must be under 500 KB.');
    setS({ ...s, photo: await readFileAsDataURL(f) });
  };
  const onDoc = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/pdf|image\//.test(f.type)) return notify('Upload a PDF or an image (JPG/PNG).');
    if (f.size > MAX_DOC) return notify('Each document must be under 1.5 MB.');
    const doc = { id: uid('doc'), name: docName, fileName: f.name, size: f.size, uploadedAt: new Date().toISOString(), verified: false, dataUrl: await readFileAsDataURL(f) };
    setS({ ...s, documents: [...s.documents.filter((d) => d.name !== docName || docName === 'Other'), doc] });
    const next = REQUIRED_DOCS.find((d) => d !== docName && !s.documents.some((x) => x.name === d));
    if (next) setDocName(next);
  };

  const validate = () => {
    const e = {};
    if (!s.firstName.trim()) e.firstName = 'Required';
    if (!s.lastName.trim()) e.lastName = 'Required';
    if (!s.dob) e.dob = 'Required';
    if (!s.classId) e.classId = 'Choose a class';
    if (guardianMode === 'new' && (!guardian.name.trim() || !guardian.phone.trim())) e.guardian = 'Parent/guardian name and phone are required';
    if (guardianMode === 'existing' && !existingGuardian) e.guardian = 'Choose a parent/guardian';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = () => {
    if (!validate()) return notify('Please fix the highlighted fields.');
    let guardianIds = s.guardianIds;
    if (guardianMode === 'new') guardianIds = [...guardianIds, api.add('guardians', { ...guardian, id: uid('g') }).id];
    if (guardianMode === 'existing' && !guardianIds.includes(existingGuardian)) guardianIds = [...guardianIds, existingGuardian];

    if (existing) {
      const patch = { ...s, guardianIds };
      if (existing.classId !== s.classId && existing.status === 'active') {
        patch.enrollments = { ...existing.enrollments, [session.id]: s.classId };
        patch.history = [...existing.history, { sessionId: session.id, classId: s.classId, action: 'reallocated', date: today() }];
      }
      api.update('students', existing.id, patch);
      api.log('Updated pupil record', `${s.firstName} ${s.lastName} (${existing.regNo})`);
      nav(`/students/${existing.id}`);
    } else {
      const year = (s.admissionDate || today()).slice(0, 4);
      const regNo = `${db.school.regPrefix}/${year}/${pad(api.nextCounter('reg'))}`;
      const created = api.add('students', {
        ...s, id: uid('p'), regNo, guardianIds, status: 'active', isNew: true, sessionAdmitted: session.id,
        enrollments: { [session.id]: s.classId },
        history: [{ sessionId: session.id, classId: s.classId, action: 'admitted', date: s.admissionDate || today() }],
      });
      api.log('Admitted pupil', `${s.firstName} ${s.lastName} — ${regNo}`);
      nav(`/students/${created.id}`, { state: { flash: `Admitted with registration number ${regNo}` } });
    }
  };

  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const err = (k) => errors[k] && <span className="mt-1 block text-xs font-medium text-rose-600">{errors[k]}</span>;

  return (
    <>
      {toast}
      <PageHeader
        title={existing ? `Edit ${existing.firstName} ${existing.lastName}` : 'Admit a new pupil'}
        subtitle={existing ? existing.regNo : `Registration number is generated automatically (${db.school.regPrefix}/${(s.admissionDate || today()).slice(0, 4)}/${pad((db.settings.counters.reg || 0) + 1)}).`}
        actions={<><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button icon={existing ? Save : UserPlus} onClick={save}>{existing ? 'Save changes' : 'Admit pupil'}</Button></>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Pupil biodata">
            <div className="mb-5 flex items-center gap-4">
              <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photo} size="lg" />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Camera className="size-4" /> {s.photo ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name *"><Input value={s.firstName} onChange={set('firstName')} />{err('firstName')}</Field>
              <Field label="Other names"><Input value={s.otherNames} onChange={set('otherNames')} /></Field>
              <Field label="Surname *"><Input value={s.lastName} onChange={set('lastName')} />{err('lastName')}</Field>
              <Field label="Sex"><Select value={s.gender} onChange={set('gender')} options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]} /></Field>
              <Field label="Date of birth *"><Input type="date" value={s.dob} onChange={set('dob')} max={today()} />{err('dob')}</Field>
              <Field label="Place of birth"><Input value={s.placeOfBirth} onChange={set('placeOfBirth')} /></Field>
              <Field label="Nationality"><Input value={s.nationality} onChange={set('nationality')} /></Field>
              <Field label="Religion"><Input value={s.religion} onChange={set('religion')} /></Field>
              <Field label="Blood group"><Select value={s.bloodGroup} onChange={set('bloodGroup')} placeholder="Unknown" options={['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']} /></Field>
              <Field label="Home address" className="sm:col-span-3"><Input value={s.address} onChange={set('address')} placeholder="Quarter, town" /></Field>
              <Field label="Allergies"><Input value={s.allergies} onChange={set('allergies')} /></Field>
              <Field label="Medical notes" className="sm:col-span-2"><Input value={s.medicalNotes} onChange={set('medicalNotes')} /></Field>
            </div>
          </Card>

          <Card title="Admission & class allocation">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Class *">
                <Select value={s.classId} onChange={set('classId')} placeholder="— Choose class —" options={classes.map((c) => {
                  const n = db.students.filter((x) => x.status === 'active' && x.classId === c.id).length;
                  return { value: c.id, label: `${c.name} (${n}/${c.capacity})${n >= c.capacity ? ' — full' : ''}` };
                })} />
                {err('classId')}
              </Field>
              <Field label="Admission date"><Input type="date" value={s.admissionDate} onChange={set('admissionDate')} disabled={!!existing} /></Field>
              <Field label="Fee category" hint="Discounts apply to tuition only."><Select value={s.category} onChange={set('category')} options={db.categories.map((c) => ({ value: c.id, label: `${c.name}${c.tuitionDiscount ? ` (−${c.tuitionDiscount}%)` : ''}` }))} /></Field>
              <Field label="Previous school" className="sm:col-span-3"><Input value={s.previousSchool || ''} onChange={set('previousSchool')} placeholder="Leave blank for first-time pupils" /></Field>
            </div>
          </Card>

          <Card title="Parent / Guardian">
            <div className="mb-4 flex flex-wrap gap-2">
              {[...(existing ? [['keep', `Keep current (${s.guardianIds.length})`]] : []), ['new', 'New parent'], ['existing', 'Existing parent (sibling)']].map(([m, l]) => (
                <button key={m} type="button" onClick={() => setGuardianMode(m)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${guardianMode === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>{l}</button>
              ))}
            </div>
            {guardianMode === 'keep' && (
              <ul className="space-y-1 text-sm text-slate-700">
                {s.guardianIds.map((gid) => { const g = db.guardians.find((x) => x.id === gid); return g && <li key={gid}>{g.name} · {g.relationship} · {g.phone}</li>; })}
                <li className="pt-2 text-xs text-slate-500">To add a second parent, choose “New parent” or “Existing parent”.</li>
              </ul>
            )}
            {guardianMode === 'new' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Full name *"><Input value={guardian.name} onChange={(e) => setGuardian({ ...guardian, name: e.target.value })} placeholder="Mr. John Tabi" /></Field>
                <Field label="Relationship"><Select value={guardian.relationship} onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })} options={['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling']} /></Field>
                <Field label="Phone *"><Input value={guardian.phone} onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })} placeholder="6XX XX XX XX" /></Field>
                <Field label="Alternative phone"><Input value={guardian.altPhone} onChange={(e) => setGuardian({ ...guardian, altPhone: e.target.value })} /></Field>
                <Field label="Email"><Input type="email" value={guardian.email} onChange={(e) => setGuardian({ ...guardian, email: e.target.value })} /></Field>
                <Field label="Occupation"><Input value={guardian.occupation} onChange={(e) => setGuardian({ ...guardian, occupation: e.target.value })} /></Field>
                <Field label="Address" className="sm:col-span-3"><Input value={guardian.address} onChange={(e) => setGuardian({ ...guardian, address: e.target.value })} /></Field>
              </div>
            )}
            {guardianMode === 'existing' && (
              <Field label="Parent / guardian" hint="Links this pupil to a parent already in the system, e.g. for siblings.">
                <Select value={existingGuardian} onChange={(e) => setExistingGuardian(e.target.value)} placeholder="— Choose —" options={[...db.guardians].sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({ value: g.id, label: `${g.name} · ${g.phone}` }))} />
              </Field>
            )}
            {err('guardian')}
          </Card>
        </div>

        <Card title="Admission documents" className="h-fit xl:sticky xl:top-20">
          <ul className="mb-4 space-y-2">
            {REQUIRED_DOCS.map((d) => {
              const ok = s.documents.some((x) => x.name === d);
              return (
                <li key={d} className="flex items-center gap-2 text-sm">
                  {ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-rose-500" />}
                  <span className={ok ? 'text-slate-700' : 'text-slate-500'}>{d}</span>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{missing.length} required document(s) missing. You can still admit the pupil and upload them later.</p>}
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <Field label="Document type"><Select value={docName} onChange={(e) => setDocName(e.target.value)} options={[...REQUIRED_DOCS, ...OPTIONAL_DOCS]} /></Field>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-3 py-4 text-sm font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <FileUp className="size-4" /> Choose PDF or image (max 1.5 MB)
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={onDoc} />
            </label>
          </div>
          {s.documents.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {s.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-700">{d.name}</p>
                    <p className="truncate text-xs text-slate-500">{d.fileName} · {Math.round(d.size / 1024)} KB</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {d.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Pending</Badge>}
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setS({ ...s, documents: s.documents.filter((x) => x.id !== d.id) })} aria-label="Remove" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Textarea className="mt-4" placeholder="Admission notes (optional)" value={s.notes || ''} onChange={set('notes')} />
        </Card>
      </div>
    </>
  );
}
