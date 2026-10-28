import { useEffect, useMemo, useState } from 'react';
import { Download, ListChecks, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms } from '../lib/finance';
import { downloadReportCards } from '../lib/documents';
import { can } from '../lib/permissions';
import { SUBJECTS, classSubjects, ordinal, weightedAverage } from '../lib/subjects';
import { fullName } from '../lib/utils';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, useToast } from '../components/ui';

const CONDUCT = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const autoRemark = (avg) => (avg >= 16 ? 'Outstanding performance, keep it up.' : avg >= 12 ? 'Good work. Can do better.' : avg >= 10 ? 'Average. Needs more effort.' : 'Weak. Needs close follow-up at home.');
const blank = (v) => v === '' || v === undefined || v === null;

/**
 * Term results by subject: marks out of 20 for each subject (with coefficients), from which the weighted average,
 * class position and class statistics are calculated. Entered by the class teacher (own class) or the office,
 * and printed as report cards.
 */
export default function Academics({ lockedClassId }) {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const myClass = lockedClassId || (user.role === 'teacher' ? db.classes.find((c) => c.teacherId === user.staffId)?.id : null);
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const [classId, setClassId] = useState(myClass || classes[0]?.id);
  const [termId, setTermId] = useState(db.settings.currentTermId);
  const [editSubjects, setEditSubjects] = useState(false);
  const term = allTerms(db).find((t) => t.id === termId);
  const cls = db.classes.find((c) => c.id === classId);
  const subjects = classSubjects(cls);
  const canEditSubjects = can(user, 'students.edit') || user.role === 'superadmin';

  const pupils = useMemo(() => db.students
    .filter((s) => s.enrollments?.[term.sessionId] === classId && (s.status === 'active' || db.academicRecords.some((r) => r.studentId === s.id && r.termId === termId)))
    .sort((a, b) => a.lastName.localeCompare(b.lastName)), [db, classId, termId, term.sessionId]);

  // Days present from the daily register, when the class teacher keeps one.
  const register = useMemo(() => {
    const days = (db.attendance || []).filter((a) => a.classId === classId && a.date >= term.start && (!term.end || a.date <= term.end));
    return { days: days.length, absences: (id) => days.filter((a) => (a.absent || []).includes(id)).length };
  }, [db.attendance, classId, term.start, term.end]);

  const [rows, setRows] = useState({});
  const [daysOpen, setDaysOpen] = useState(60);
  useEffect(() => {
    const next = {};
    let open = register.days || 60;
    pupils.forEach((p) => {
      const r = db.academicRecords.find((x) => x.studentId === p.id && x.termId === termId);
      if (r?.daysOpen) open = r.daysOpen;
      next[p.id] = {
        marks: { ...(r?.marks || {}) }, conduct: r?.conduct || 'Good', remark: r?.remark || '',
        attendance: r?.attendance ?? (register.days ? register.days - register.absences(p.id) : ''),
      };
    });
    setRows(next);
    setDaysOpen(open);
    // Only reload when the class/term changes, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, termId]);

  if (user.role === 'teacher' && !myClass) return <Empty title="No class assigned" message="Ask the administrator to assign you a class." />;

  const setMark = (id, subject, v) => setRows((r) => ({ ...r, [id]: { ...r[id], marks: { ...r[id].marks, [subject]: v } } }));
  const setRow = (id, k, v) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  const avgOf = (id) => weightedAverage(rows[id]?.marks, subjects);

  const save = () => {
    const bad = pupils.some((p) => subjects.some((s) => { const m = rows[p.id]?.marks?.[s.name]; return !blank(m) && (Number(m) < 0 || Number(m) > 20); }));
    if (bad) return notify('Marks must be between 0 and 20.');
    const entered = pupils.filter((p) => avgOf(p.id) !== null);
    const ranked = [...entered].sort((a, b) => avgOf(b.id) - avgOf(a.id));
    const avgs = ranked.map((p) => avgOf(p.id));
    const classAverage = avgs.length ? Math.round((avgs.reduce((t, a) => t + a, 0) / avgs.length) * 100) / 100 : null;
    api.mutate((d) => {
      d.academicRecords = d.academicRecords.filter((r) => !(r.termId === termId && pupils.some((p) => p.id === r.studentId)));
      ranked.forEach((p, i) => {
        const r = rows[p.id];
        const avg = avgOf(p.id);
        // Ties share a position.
        const position = i > 0 && avgOf(ranked[i - 1].id) === avg ? d.academicRecords.at(-1).position : i + 1;
        const marks = Object.fromEntries(subjects.filter((s) => !blank(r.marks[s.name])).map((s) => [s.name, Number(r.marks[s.name])]));
        d.academicRecords.push({
          id: `ar-${termId}-${p.id}`, studentId: p.id, sessionId: term.sessionId, termId, classId,
          marks, subjects, average: avg, position, outOf: ranked.length,
          classAverage, highest: avgs[0], lowest: avgs.at(-1),
          conduct: r.conduct, remark: r.remark || autoRemark(avg),
          attendance: blank(r.attendance) ? null : Number(r.attendance), daysOpen: Number(daysOpen) || null,
          enteredBy: user.id,
        });
      });
      return d;
    });
    api.log('Saved term results', `${cls?.name} · ${term.label}`);
    notify(`Saved results for ${ranked.length} pupil(s). Report cards are ready to download.`);
  };

  const saved = db.academicRecords.filter((r) => r.termId === termId && r.classId === classId).sort((a, b) => a.position - b.position);
  const download = (records, name) => downloadReportCards(db, records, name);

  return (
    <>
      {toast}
      {!lockedClassId && <PageHeader title="Term Results & Report Cards" subtitle="Enter each pupil’s mark out of 20 in every subject. Averages (with coefficients), positions and report cards are produced automatically." />}
      <Card
        title={lockedClassId ? 'Term results & report cards' : undefined}
        actions={<>
          <Button variant="secondary" icon={Download} disabled={!saved.length} onClick={() => download(saved, `Report cards - ${cls?.name} - ${term.label}`)}>Report cards ({saved.length})</Button>
          <Button icon={Save} onClick={save} disabled={!pupils.length}>Save results</Button>
        </>}
        bodyClass=""
      >
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Field label="Class"><Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!!myClass} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Term"><Select value={termId} onChange={(e) => setTermId(e.target.value)} options={allTerms(db).map((t) => ({ value: t.id, label: t.label }))} /></Field>
          <Field label="Days school opened" hint={register.days ? `${register.days} day${register.days === 1 ? '' : 's'} in the daily register this term.` : undefined}><input className="input" type="number" min="1" value={daysOpen} onChange={(e) => setDaysOpen(e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm">
          <ListChecks className="size-4 text-slate-400" />
          <span className="text-slate-500">Subjects (coefficient):</span>
          {subjects.map((s) => <span key={s.name} className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{s.name} <b>{s.coef}</b></span>)}
          {canEditSubjects && <button type="button" onClick={() => setEditSubjects(true)} className="ml-1 text-xs font-semibold text-brand-700 hover:underline">Edit subjects</button>}
        </div>
        {!pupils.length ? <Empty title="No pupils in this class for that session" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50">Pupil</th>
                  {subjects.map((s) => <th key={s.name} className="min-w-20 text-center" title={s.name}><span className="block max-w-24 truncate normal-case">{s.name}</span><span className="font-normal">x{s.coef}</span></th>)}
                  <th className="text-right">Average</th>
                  <th className="w-24">Days present</th>
                  <th className="w-32">Conduct</th>
                  <th>Remark (auto if blank)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pupils.map((p) => {
                  const r = rows[p.id] || { marks: {} };
                  const avg = avgOf(p.id);
                  const rec = saved.find((x) => x.studentId === p.id);
                  return (
                    <tr key={p.id}>
                      <td className="sticky left-0 z-10 bg-white"><p className="font-semibold whitespace-nowrap text-slate-800">{fullName(p)}</p><p className="font-mono text-xs text-slate-500">{p.regNo}</p></td>
                      {subjects.map((s) => (
                        <td key={s.name} className="px-1.5">
                          <input className="input w-16 px-1.5 text-center tabular-nums" type="number" step="0.25" min="0" max="20" inputMode="decimal"
                            value={r.marks?.[s.name] ?? ''} onChange={(e) => setMark(p.id, s.name, e.target.value)} aria-label={`${s.name} mark for ${fullName(p)}`} />
                        </td>
                      ))}
                      <td className="text-right font-bold tabular-nums">{avg === null ? '—' : avg.toFixed(2)}{rec && <span className="block text-xs font-normal text-slate-500">{ordinal(rec.position)} / {rec.outOf}</span>}</td>
                      <td><input className="input w-20 tabular-nums" type="number" min="0" max={daysOpen} value={r.attendance ?? ''} onChange={(e) => setRow(p.id, 'attendance', e.target.value)} aria-label="Days present" /></td>
                      <td><Select value={r.conduct || 'Good'} onChange={(e) => setRow(p.id, 'conduct', e.target.value)} options={CONDUCT} /></td>
                      <td><input className="input min-w-56" value={r.remark ?? ''} placeholder={avg !== null ? autoRemark(avg) : ''} onChange={(e) => setRow(p.id, 'remark', e.target.value)} aria-label="Remark" /></td>
                      <td>{rec && <Button size="sm" variant="ghost" icon={Download} onClick={() => download([rec], `Report card - ${fullName(p)} - ${term.label}`)} aria-label={`Report card for ${fullName(p)}`} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editSubjects && <SubjectsEditor cls={cls} onClose={() => setEditSubjects(false)} onSaved={() => notify('Subjects saved for this class.')} />}
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
      <p className="mb-3 text-sm text-slate-600">The coefficient is how much the subject counts in the average (for example 2 for English, French and Mathematics).</p>
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
