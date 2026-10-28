import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Download, ListChecks, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms } from '../lib/finance';
import { downloadReportCards } from '../lib/documents';
import { can } from '../lib/permissions';
import { SUBJECTS, classSubjects, ordinal } from '../lib/subjects';
import { fullName } from '../lib/utils';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Tabs, useToast } from '../components/ui';

const CONDUCT = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const isOffice = (user) => user.role === 'superadmin' || user.role === 'admin';
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Classes where the user may enter marks: the office everywhere; a teacher in their class and where they teach a subject. */
function markClasses(db, user) {
  if (isOffice(user)) return db.classes.map((c) => c.id);
  const me = db.staff.find((s) => s.id === user.staffId);
  const own = db.classes.find((c) => c.teacherId && c.teacherId === user.staffId)?.id;
  return [...new Set([own, ...(me?.teaching || []).flatMap((t) => t.classIds || [])].filter(Boolean))];
}
function canEnter(db, user, cls, subject) {
  if (isOffice(user)) return true;
  if (cls.teacherId && cls.teacherId === user.staffId) return true;
  const me = db.staff.find((s) => s.id === user.staffId);
  return (me?.teaching || []).some((t) => same(t.subject, subject) && (t.classIds || []).includes(cls.id));
}
const enrolled = (db, classId, term, termId) => db.students
  .filter((s) => s.enrollments?.[term.sessionId] === classId && (s.status === 'active' || db.academicRecords.some((r) => r.studentId === s.id && r.termId === termId)))
  .sort((a, b) => a.lastName.localeCompare(b.lastName));

/**
 * Marks by subject: each teacher enters the marks of the subjects they teach, in every class they teach them.
 * The server works out each pupil's average (with coefficients) and position whenever marks change;
 * the class teacher adds attendance, conduct and remarks, and prints the report cards.
 */
export default function Academics({ lockedClassId }) {
  const { db, user } = useStore();
  const ownClass = db.classes.find((c) => c.teacherId && c.teacherId === user.staffId)?.id;
  const classIds = lockedClassId ? [lockedClassId] : markClasses(db, user);
  const canResults = isOffice(user) || !!ownClass;
  const [tab, setTab] = useState('marks');
  const [termId, setTermId] = useState(db.settings.currentTermId);
  if (!classIds.length) return <><PageHeader title="Marks & report cards" /><Empty title="No class or subject assigned" message="Ask the office to make you a class teacher, or to list the subjects and classes you teach on your staff record." /></>;
  const terms = allTerms(db);
  return (
    <>
      {!lockedClassId && <PageHeader title="Marks & report cards" subtitle="Each teacher enters the marks of the subjects they teach. Averages, positions and report cards follow automatically." />}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={[{ id: 'marks', label: 'Enter marks' }, ...(canResults ? [{ id: 'results', label: 'Class results & report cards' }] : [])]} value={tab} onChange={setTab} />
        <Field label="Term"><Select className="w-56" value={termId} onChange={(e) => setTermId(e.target.value)} options={terms.map((t) => ({ value: t.id, label: t.label }))} /></Field>
      </div>
      {tab === 'marks' ? <EnterMarks classIds={classIds} termId={termId} /> : <ClassResults classIds={lockedClassId ? [lockedClassId] : isOffice(user) ? db.classes.map((c) => c.id) : [ownClass]} termId={termId} />}
    </>
  );
}

function EnterMarks({ classIds, termId }) {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const classes = db.classes.filter((c) => classIds.includes(c.id)).sort((a, b) => a.order - b.order);
  const [classId, setClassId] = useState(classes[0]?.id);
  const cls = db.classes.find((c) => c.id === classId) || classes[0];
  const term = allTerms(db).find((t) => t.id === termId);
  const subjects = classSubjects(cls).filter((s) => canEnter(db, user, cls, s.name));
  const [subject, setSubject] = useState(subjects[0]?.name || '');
  useEffect(() => { if (!subjects.some((s) => s.name === subject)) setSubject(subjects[0]?.name || ''); }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pupils = useMemo(() => (cls && term ? enrolled(db, cls.id, term, termId) : []), [db, cls, term, termId]);
  const sheet = (db.marks || []).find((m) => m.classId === cls?.id && m.termId === termId && same(m.subject, subject));
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValues(Object.fromEntries(pupils.map((p) => [p.id, sheet?.marks?.[p.id] ?? '']))); }, [cls?.id, termId, subject, sheet?.updatedAt, pupils.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (Object.values(values).some((v) => v !== '' && !(Number(v) >= 0 && Number(v) <= 20))) return notify('Marks must be between 0 and 20.');
    setBusy(true);
    try {
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'marks', v: { classId: cls.id, termId, subject, marks: values } }] } });
      await api.reload();
      api.log('Entered marks', `${subject} · ${cls.name} · ${term.label}`);
      notify(`${subject} marks saved for ${Object.values(values).filter((v) => v !== '').length} pupil(s). Averages and positions are updated.`);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  // Which subjects of this class already have marks (helps the class teacher see what is missing).
  const progress = classSubjects(cls).map((s) => {
    const sh = (db.marks || []).find((m) => m.classId === cls?.id && m.termId === termId && same(m.subject, s.name));
    return { ...s, count: sh ? Object.keys(sh.marks || {}).length : 0, by: sh && db.users.find((u) => u.id === sh.enteredBy)?.name };
  });

  return (
    <>
      {toast}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card bodyClass="" title={subject ? `${subject} · ${cls?.name}` : cls?.name} actions={<Button icon={Save} disabled={busy || !subject || !pupils.length} onClick={save}>{busy ? 'Saving…' : 'Save marks'}</Button>}>
          <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
            <Field label="Class"><Select value={cls?.id} onChange={(e) => setClassId(e.target.value)} disabled={classes.length < 2} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Subject"><Select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!subjects.length} options={subjects.map((s) => ({ value: s.name, label: `${s.name} (coef ${s.coef})` }))} placeholder={subjects.length ? undefined : 'No subject you teach here'} /></Field>
          </div>
          {!subjects.length ? (
            <Empty title="You don't teach a subject of this class" message="Subjects on your staff record must match the class's subject names. Ask the office to check both." />
          ) : !pupils.length ? <Empty title="No pupils in this class for that term" /> : (
            <>
              {sheet && <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">Last saved by {db.users.find((u) => u.id === sheet.enteredBy)?.name || 'a teacher'} · {new Date(sheet.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
              <ul className="divide-y divide-slate-100">
                {pupils.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0"><p className="truncate font-semibold text-slate-800"><span className="mr-2 text-xs text-slate-400 tabular-nums">{i + 1}</span>{fullName(p)}</p><p className="font-mono text-xs text-slate-500">{p.regNo}</p></div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-20 text-center tabular-nums" type="number" inputMode="decimal" step="0.25" min="0" max="20"
                        value={values[p.id] ?? ''} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} aria-label={`${subject} mark for ${fullName(p)}`} />
                      <span className="text-xs text-slate-400">/20</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card title={`Marks entered · ${cls?.name}`}>
          <ul className="space-y-2 text-sm">
            {progress.map((s) => (
              <li key={s.name} className="flex items-start justify-between gap-2">
                <span className="flex items-start gap-1.5">
                  {s.count ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-slate-300" />}
                  <span><span className={s.count ? 'text-slate-800' : 'text-slate-500'}>{s.name}</span>{s.by && <span className="block text-xs text-slate-500">{s.by}</span>}</span>
                </span>
                <Badge tone={s.count >= pupils.length && pupils.length ? 'green' : s.count ? 'amber' : 'slate'}>{s.count}/{pupils.length}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function ClassResults({ classIds, termId }) {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const classes = db.classes.filter((c) => classIds.includes(c.id)).sort((a, b) => a.order - b.order);
  const [classId, setClassId] = useState(classes[0]?.id);
  const [editSubjects, setEditSubjects] = useState(false);
  const cls = db.classes.find((c) => c.id === classId) || classes[0];
  const term = allTerms(db).find((t) => t.id === termId);
  const subjects = classSubjects(cls);
  const pupils = useMemo(() => (cls && term ? enrolled(db, cls.id, term, termId) : []), [db, cls, term, termId]);
  const recordOf = (id) => db.academicRecords.find((r) => r.studentId === id && r.termId === termId);

  // Days present from the daily register, when the class teacher keeps one.
  const register = useMemo(() => {
    const days = (db.attendance || []).filter((a) => a.classId === cls?.id && term && a.date >= term.start && (!term.end || a.date <= term.end));
    return { days: days.length, absences: (id) => days.filter((a) => (a.absent || []).includes(id)).length };
  }, [db.attendance, cls?.id, term]);

  const [rows, setRows] = useState({});
  const [daysOpen, setDaysOpen] = useState(60);
  useEffect(() => {
    let open = register.days || 60;
    const next = {};
    pupils.forEach((p) => {
      const r = recordOf(p.id);
      if (r?.daysOpen) open = r.daysOpen;
      next[p.id] = { conduct: r?.conduct || 'Good', remark: r?.remarkCustom ? r.remark : '', attendance: r?.attendance ?? (register.days ? register.days - register.absences(p.id) : '') };
    });
    setRows(next);
    setDaysOpen(open);
  }, [cls?.id, termId, pupils.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRow = (id, k, v) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const ops = pupils.map((p) => ({ t: 'put', c: 'academicRecords', v: { classId: cls.id, termId, studentId: p.id, daysOpen: Number(daysOpen) || null, ...rows[p.id] } }));
      await api.request('/api/ops', { method: 'POST', body: { ops } });
      await api.reload();
      api.log('Saved term results', `${cls.name} · ${term.label}`);
      notify('Attendance, conduct and remarks saved.');
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  const saved = db.academicRecords.filter((r) => r.termId === termId && r.classId === cls?.id && r.average != null).sort((a, b) => a.position - b.position);
  const download = (records, name) => downloadReportCards(db, records, name);
  const canEditSubjects = can(user, 'students.edit') || user.role === 'superadmin';

  return (
    <>
      {toast}
      <Card
        bodyClass=""
        title={cls ? `${cls.name} · ${term?.label}` : ''}
        actions={<>
          <Button variant="secondary" icon={Download} disabled={!saved.length} onClick={() => download(saved, `Report cards - ${cls.name} - ${term.label}`)}>Report cards ({saved.length})</Button>
          <Button icon={Save} disabled={busy || !pupils.length} onClick={save}>{busy ? 'Saving…' : 'Save details'}</Button>
        </>}
      >
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
          <Field label="Class"><Select value={cls?.id} onChange={(e) => setClassId(e.target.value)} disabled={classes.length < 2} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Days school opened" hint={register.days ? `${register.days} day${register.days === 1 ? '' : 's'} in the daily register this term.` : undefined}><input className="input" type="number" min="1" value={daysOpen} onChange={(e) => setDaysOpen(e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm">
          <ListChecks className="size-4 text-slate-400" />
          <span className="text-slate-500">Subjects (coefficient):</span>
          {subjects.map((s) => <span key={s.name} className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{s.name} <b>{s.coef}</b></span>)}
          {canEditSubjects && <button type="button" onClick={() => setEditSubjects(true)} className="ml-1 text-xs font-semibold text-brand-700 hover:underline">Edit subjects</button>}
        </div>
        {!pupils.length ? <Empty title="No pupils in this class for that term" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50">Pupil</th>
                  {subjects.map((s) => <th key={s.name} className="text-center" title={s.name}><span className="block max-w-20 truncate normal-case">{s.name}</span><span className="font-normal">x{s.coef}</span></th>)}
                  <th className="text-right">Average</th>
                  <th className="w-24">Days present</th>
                  <th className="w-32">Conduct</th>
                  <th>Remark (automatic if blank)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pupils.map((p) => {
                  const rec = recordOf(p.id);
                  const r = rows[p.id] || {};
                  return (
                    <tr key={p.id}>
                      <td className="sticky left-0 z-10 bg-white"><p className="font-semibold whitespace-nowrap text-slate-800">{fullName(p)}</p><p className="font-mono text-xs text-slate-500">{p.regNo}</p></td>
                      {subjects.map((s) => { const m = rec?.marks?.[s.name]; return <td key={s.name} className={`text-center tabular-nums ${m == null ? 'text-slate-300' : m < 10 ? 'text-rose-600' : ''}`}>{m == null ? '—' : Number(m).toFixed(m % 1 ? 2 : 0)}</td>; })}
                      <td className="text-right font-bold tabular-nums">{rec?.average == null ? '—' : Number(rec.average).toFixed(2)}{rec?.position && <span className="block text-xs font-normal text-slate-500">{ordinal(rec.position)} / {rec.outOf}</span>}</td>
                      <td><input className="input w-20 tabular-nums" type="number" min="0" max={daysOpen} value={r.attendance ?? ''} onChange={(e) => setRow(p.id, 'attendance', e.target.value)} aria-label={`Days present for ${fullName(p)}`} /></td>
                      <td><Select value={r.conduct || 'Good'} onChange={(e) => setRow(p.id, 'conduct', e.target.value)} options={CONDUCT} /></td>
                      <td><input className="input min-w-56" value={r.remark ?? ''} placeholder={rec?.remark || ''} onChange={(e) => setRow(p.id, 'remark', e.target.value)} aria-label={`Remark for ${fullName(p)}`} /></td>
                      <td>{rec?.average != null && <Button size="sm" variant="ghost" icon={Download} onClick={() => download([rec], `Report card - ${fullName(p)} - ${term.label}`)} aria-label={`Report card for ${fullName(p)}`} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editSubjects && <SubjectsEditor cls={cls} onClose={() => setEditSubjects(false)} onSaved={() => notify('Subjects saved.')} />}
    </>
  );
}

/** The office sets each class's subjects and coefficients (they appear on the report card in this order). */
function SubjectsEditor({ cls, onClose, onSaved }) {
  const { db, api } = useStore();
  const [list, setList] = useState(() => classSubjects(cls).map((s) => ({ ...s })));
  const set = (i, patch) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = (target) => {
    const clean = list.map((s) => ({ name: s.name.trim(), coef: Math.max(1, Math.round(Number(s.coef) || 1)) })).filter((s) => s.name);
    if (new Set(clean.map((s) => s.name.toLowerCase())).size !== clean.length) return;
    for (const c of target) api.update('classes', c.id, { subjects: clean });
    api.log('Updated subjects', target.map((c) => c.name).join(', '));
    onSaved();
    onClose();
  };
  const sameLevel = db.classes.filter((c) => (c.level || '') === (cls.level || ''));
  return (
    <Modal open onClose={onClose} title={`Subjects for ${cls.name}`} size="lg" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      {sameLevel.length > 1 && <Button variant="secondary" onClick={() => save(sameLevel)}>Save for all {cls.level || 'similar'} classes</Button>}
      <Button icon={Save} onClick={() => save([cls])}>Save</Button>
    </>}>
      <datalist id="subject-options">{SUBJECTS.map((s) => <option key={s} value={s} />)}</datalist>
      <p className="mb-3 text-sm text-slate-600">The coefficient is how much the subject counts in the average (for example 2 for English, French and Mathematics). Teachers' subjects on their staff records must use the same names.</p>
      <div className="space-y-2">
        {list.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input list="subject-options" value={s.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Subject" aria-label="Subject" />
            <Input className="w-20 text-center" type="number" min="1" max="10" value={s.coef} onChange={(e) => set(i, { coef: e.target.value })} aria-label="Coefficient" />
            <Button variant="ghost" icon={Trash2} onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Remove subject" />
          </div>
        ))}
      </div>
      <Button className="mt-3" size="sm" variant="secondary" icon={Plus} onClick={() => setList([...list, { name: '', coef: 1 }])}>Add subject</Button>
    </Modal>
  );
}
