import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Copy, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { exportTimetable } from '../lib/documents';
import { classSubjects } from '../lib/subjects';
import { DAYS, DEFAULT_PERIODS, clashes, teacherLessons, timetableOf } from '../lib/timetable';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Tabs, useToast } from '../components/ui';

const staffName = (db, id) => { const s = db.staff.find((x) => x.id === id); return s ? `${s.firstName} ${s.lastName}` : ''; };
const shortName = (db, id) => { const s = db.staff.find((x) => x.id === id); return s ? `${s.firstName[0]}. ${s.lastName}` : ''; };

/** Weekly timetables. The office builds them per class; teachers see their own week; parents see their child's class. */
export default function Timetable() {
  const { db, user } = useStore();
  const office = can(user, 'students.edit') || user.role === 'superadmin';
  const ownClass = db.classes.find((c) => c.teacherId && c.teacherId === user.staffId);
  const [tab, setTab] = useState(office ? 'classes' : 'mine');
  const tabs = office
    ? [{ id: 'classes', label: 'Class timetables' }, { id: 'teachers', label: 'Teachers’ timetables' }]
    : [{ id: 'mine', label: 'My week' }, ...(ownClass ? [{ id: 'class', label: ownClass.name }] : [])];
  return (
    <>
      <PageHeader title="Timetable" subtitle={office ? 'Build each class’s weekly timetable. Clashes (a teacher in two classes at once) are flagged.' : 'Your lessons for the week.'} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'classes' && <ClassEditor />}
      {tab === 'teachers' && <TeacherWeekPicker />}
      {tab === 'mine' && (user.staffId ? <TeacherWeek staffId={user.staffId} /> : <Empty title="No staff record linked" />)}
      {tab === 'class' && ownClass && <ClassTimetable classId={ownClass.id} />}
    </>
  );
}

/** Read-only timetable of one class: a grid on wide screens, one card per day on phones. */
export function ClassTimetable({ classId }) {
  const { db } = useStore();
  const tt = timetableOf(db, classId);
  const cls = db.classes.find((c) => c.id === classId);
  const has = Object.keys(tt.cells || {}).length > 0;
  const today = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  const [day, setDay] = useState(DAYS.some(([d]) => d === today) ? today : 'mon');
  if (!has) return <Card><Empty title="No timetable yet" message="The school office has not published this class's timetable." /></Card>;
  const cellText = (key) => { const c = tt.cells?.[key]; return c?.subject ? `${c.subject}${c.teacherId ? ` (${shortName(db, c.teacherId)})` : ''}` : ''; };
  return (
    <Card title={`${cls?.name} · weekly timetable`} actions={<Button size="sm" variant="secondary" icon={FileText} onClick={() => exportTimetable(db, tt)}>PDF</Button>} bodyClass="">
      <div className="hidden overflow-x-auto md:block">
        <Grid db={db} tt={tt} />
      </div>
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2">
          {DAYS.map(([d, label]) => <button key={d} type="button" onClick={() => setDay(d)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${day === d ? 'bg-brand-700 text-white' : 'text-slate-600'}`}>{label.slice(0, 3)}</button>)}
        </div>
        <ul className="divide-y divide-slate-100">
          {tt.periods.map((p, i) => (
            <li key={i} className={`flex gap-3 px-4 py-2.5 text-sm ${p.kind === 'break' ? 'bg-slate-50 text-slate-500 italic' : ''}`}>
              <span className="w-24 shrink-0 tabular-nums text-slate-500">{p.start}–{p.end}</span>
              <span className="font-medium text-slate-800">{p.kind === 'break' ? p.label || 'Break' : cellText(`${day}-${i}`) || '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function Grid({ db, tt, onCell, flagged = new Set() }) {
  return (
    <table className="table-base">
      <thead><tr><th className="w-28">Time</th>{DAYS.map(([d, label]) => <th key={d}>{label}</th>)}</tr></thead>
      <tbody>
        {tt.periods.map((p, i) => (
          <tr key={i}>
            <td className="whitespace-nowrap tabular-nums text-slate-500">{p.start}–{p.end}</td>
            {p.kind === 'break'
              ? <td colSpan={DAYS.length} className="bg-slate-50 text-center text-sm text-slate-500 italic">{p.label || 'Break'}</td>
              : DAYS.map(([d]) => {
                const key = `${d}-${i}`;
                const c = tt.cells?.[key];
                const inner = c?.subject
                  ? <><span className="block font-semibold text-slate-800">{c.subject}</span>{c.teacherId && <span className="block text-xs text-slate-500">{shortName(db, c.teacherId)}</span>}</>
                  : <span className="text-slate-300">{onCell ? '+ Add' : '—'}</span>;
                return (
                  <td key={d} className={`p-1 align-top ${flagged.has(key) ? 'bg-rose-50' : ''}`}>
                    {onCell ? <button type="button" onClick={() => onCell(key, i)} className="block min-h-11 w-full rounded-md px-2 py-1 text-left hover:bg-brand-50">{inner}{flagged.has(key) && <span className="block text-xs font-semibold text-rose-600">Clash</span>}</button> : <div className="px-2 py-1">{inner}</div>}
                  </td>
                );
              })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClassEditor() {
  const { db, api } = useStore();
  const [toast, notify] = useToast();
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const [classId, setClassId] = useState(classes[0]?.id);
  const [tt, setTt] = useState(() => timetableOf(db, classId));
  const [dirty, setDirty] = useState(false);
  const [cell, setCell] = useState(null);
  const [periods, setPeriods] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTt(structuredClone(timetableOf(db, classId))); setDirty(false); }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = db.classes.find((c) => c.id === classId);
  const found = clashes(db, tt);
  const update = (next) => { setTt(next); setDirty(true); };

  const save = async () => {
    setBusy(true);
    try {
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'timetables', v: { ...tt, id: `tt-${classId}`, classId, updatedAt: new Date().toISOString() } }] } });
      await api.reload();
      setDirty(false);
      api.log('Saved timetable', cls.name);
      notify(found.length ? `Saved, but ${found.length} lesson(s) clash with another class.` : 'Timetable saved. Teachers and parents can see it now.');
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      {toast}
      <Card
        bodyClass=""
        title={<div className="flex items-center gap-2"><span>Class</span><select className="input w-auto py-1" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        actions={<>
          <Button variant="secondary" icon={Clock} onClick={() => setPeriods(structuredClone(tt.periods))}>Times & breaks</Button>
          <Button variant="secondary" icon={FileText} onClick={() => exportTimetable(db, tt)}>PDF</Button>
          <Button icon={Save} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save timetable' : 'Saved'}</Button>
        </>}
      >
        {found.length > 0 && (
          <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800">
            <AlertTriangle className="mr-1 inline size-4" />
            {found.map((f) => `${staffName(db, f.teacherId)} is also teaching ${db.classes.find((c) => c.id === f.otherClassId)?.name} on ${DAYS.find(([d]) => d === f.day)[1]} at ${f.period.start}`).join(' · ')}
          </div>
        )}
        <div className="overflow-x-auto"><Grid db={db} tt={tt} onCell={(key, i) => setCell({ key, period: tt.periods[i], ...(tt.cells?.[key] || { subject: '', teacherId: '' }) })} flagged={new Set(found.map((f) => f.key))} /></div>
      </Card>

      {cell && (
        <CellEditor cls={cls} cell={cell} tt={tt} onClose={() => setCell(null)}
          onSave={(v) => { const cells = { ...tt.cells }; if (v.subject) cells[cell.key] = { subject: v.subject, teacherId: v.teacherId || '' }; else delete cells[cell.key]; update({ ...tt, cells }); setCell(null); }} />
      )}
      {periods && (
        <Modal open onClose={() => setPeriods(null)} title={`Lesson times · ${cls.name}`} size="lg" footer={<>
          <Button variant="secondary" onClick={() => setPeriods(null)}>Cancel</Button>
          <Button onClick={() => {
            const clean = periods.filter((p) => p.start && p.end && p.start < p.end).sort((a, b) => a.start.localeCompare(b.start));
            // Lessons stay with their time slot when periods are added or removed.
            const cells = {};
            for (const [key, c] of Object.entries(tt.cells || {})) {
              const [d, i] = key.split('-');
              const at = clean.findIndex((p) => p.start === tt.periods[Number(i)]?.start && p.kind === 'lesson');
              if (at >= 0) cells[`${d}-${at}`] = c;
            }
            update({ ...tt, periods: clean, cells });
            setPeriods(null);
          }}>Apply</Button>
        </>}>
          <div className="space-y-2">
            {periods.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input type="time" className="w-28" value={p.start} onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label="Start" />
                <span className="text-slate-400">to</span>
                <Input type="time" className="w-28" value={p.end} onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} aria-label="End" />
                <Select className="w-28" value={p.kind} onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} options={[{ value: 'lesson', label: 'Lesson' }, { value: 'break', label: 'Break' }]} />
                {p.kind === 'break' && <Input className="w-32" value={p.label || ''} placeholder="Break" onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Break name" />}
                <Button variant="ghost" icon={Trash2} onClick={() => setPeriods(periods.filter((_, j) => j !== i))} aria-label="Remove" />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => { const last = periods.at(-1); setPeriods([...periods, { start: last?.end || '08:00', end: '', kind: 'lesson' }]); }}>Add period</Button>
            <Button size="sm" variant="ghost" onClick={() => setPeriods(structuredClone(DEFAULT_PERIODS))}>Use the default day</Button>
            <Select className="w-56" value="" onChange={(e) => { const src = timetableOf(db, e.target.value); setPeriods(structuredClone(src.periods)); }} placeholder="Copy times from…" options={classes.filter((c) => c.id !== classId).map((c) => ({ value: c.id, label: c.name }))} />
          </div>
        </Modal>
      )}
    </>
  );
}

function CellEditor({ cls, cell, tt, onClose, onSave }) {
  const { db } = useStore();
  const [v, setV] = useState({ subject: cell.subject, teacherId: cell.teacherId });
  const teachers = db.staff.filter((s) => s.status === 'active' && s.category === 'teaching');
  // Teachers who teach this subject in this class come first.
  const teachesIt = (s) => (s.teaching || []).some((t) => t.subject.trim().toLowerCase() === v.subject.toLowerCase() && (t.classIds || []).includes(cls.id));
  const sorted = [...teachers].sort((a, b) => Number(teachesIt(b)) - Number(teachesIt(a)) || Number(b.id === cls.teacherId) - Number(a.id === cls.teacherId));
  const [day, i] = cell.key.split('-');
  const busy = v.teacherId && teacherLessons({ ...db, timetables: (db.timetables || []).filter((t) => t.classId !== tt.classId) }, v.teacherId)
    .find((l) => l.day === day && l.period.start < cell.period.end && cell.period.start < l.period.end);
  return (
    <Modal open onClose={onClose} title={`${DAYS.find(([d]) => d === day)[1]} ${cell.period.start}–${cell.period.end}`} footer={<>
      {cell.subject && <Button variant="ghost" icon={Trash2} onClick={() => onSave({ subject: '' })}>Clear</Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={() => onSave(v)}>Set lesson</Button>
    </>}>
      <div className="space-y-4">
        <Field label="Subject"><Select value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="— Free period —" options={classSubjects(cls).map((s) => s.name)} /></Field>
        <Field label="Teacher" hint={sorted[0] && teachesIt(sorted[0]) ? 'Teachers who take this subject in this class are listed first.' : undefined}>
          <Select value={v.teacherId} onChange={(e) => setV({ ...v, teacherId: e.target.value })} placeholder="— Not set —"
            options={sorted.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}${s.id === cls.teacherId ? ' (class teacher)' : teachesIt(s) ? ` (teaches ${v.subject})` : ''}` }))} />
        </Field>
        {busy && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{staffName(db, v.teacherId)} is already teaching {db.classes.find((c) => c.id === busy.classId)?.name} at this time.</p>}
        {i !== undefined && <span className="sr-only">Period {Number(i) + 1}</span>}
      </div>
    </Modal>
  );
}

function TeacherWeekPicker() {
  const { db } = useStore();
  const teachers = db.staff.filter((s) => s.status === 'active' && s.category === 'teaching').sort((a, b) => a.lastName.localeCompare(b.lastName));
  const [id, setId] = useState(teachers[0]?.id || '');
  if (!teachers.length) return <Card><Empty title="No teachers yet" /></Card>;
  return (
    <>
      <div className="mb-4 max-w-sm"><Field label="Teacher"><Select value={id} onChange={(e) => setId(e.target.value)} options={teachers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))} /></Field></div>
      <TeacherWeek staffId={id} />
    </>
  );
}

function TeacherWeek({ staffId }) {
  const { db } = useStore();
  const lessons = teacherLessons(db, staffId);
  const name = staffName(db, staffId);
  if (!lessons.length) return <Card><Empty title="No lessons on the timetable yet" message="Lessons appear here once the office sets the class timetables." /></Card>;
  const pdf = () => exportTimetable(db, null, { staffId, name, lessons });
  return (
    <Card title={`${name} · ${lessons.length} lesson${lessons.length > 1 ? 's' : ''} a week`} actions={<Button size="sm" variant="secondary" icon={Copy} onClick={pdf}>PDF</Button>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {DAYS.map(([d, label]) => {
          const list = lessons.filter((l) => l.day === d);
          return (
            <div key={d}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
              {list.length ? (
                <ul className="space-y-2">
                  {list.map((l, k) => (
                    <li key={k} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">{l.subject}</p>
                      <p className="text-xs text-slate-500">{l.period.start}–{l.period.end} · {db.classes.find((c) => c.id === l.classId)?.name}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-400">No lessons</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
