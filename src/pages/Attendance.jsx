import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentTerm } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { fmtDate, fmtDateTime, fullName, today } from '../lib/utils';
import { Badge, Button, Card, Empty, ExportButtons, Field, PageHeader, Select, StatCard, useToast } from '../components/ui';

const STATES = [['present', 'Present', 'bg-emerald-600 text-white border-emerald-600'], ['absent', 'Absent', 'bg-rose-600 text-white border-rose-600'], ['late', 'Late', 'bg-amber-500 text-white border-amber-500']];

/**
 * Daily register: the class teacher (own class) or the office marks who is absent or late.
 * Parents of absent pupils are notified straight away, in the app and on their phone.
 */
export default function Attendance() {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const myClass = user.role === 'teacher' ? db.classes.find((c) => c.teacherId === user.staffId)?.id : null;
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const [classId, setClassId] = useState(myClass || classes[0]?.id);
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);
  const cls = db.classes.find((c) => c.id === classId);
  const term = currentTerm(db);

  const pupils = useMemo(() => db.students.filter((s) => s.classId === classId && s.status === 'active').sort((a, b) => a.lastName.localeCompare(b.lastName)), [db.students, classId]);
  const existing = (db.attendance || []).find((a) => a.classId === classId && a.date === date);
  useEffect(() => {
    setMarks(Object.fromEntries(pupils.map((p) => [p.id, existing?.absent?.includes(p.id) ? 'absent' : existing?.late?.includes(p.id) ? 'late' : 'present'])));
    // Reload when the class, the date or the saved register changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, existing?.takenAt, pupils.length]);

  if (user.role === 'teacher' && !myClass) return <Empty title="No class assigned" message="Ask the administrator to assign you a class." />;

  const count = (k) => pupils.filter((p) => marks[p.id] === k).length;
  const save = async () => {
    setBusy(true);
    try {
      const register = { id: `att-${classId}-${date}`, classId, date, absent: pupils.filter((p) => marks[p.id] === 'absent').map((p) => p.id), late: pupils.filter((p) => marks[p.id] === 'late').map((p) => p.id) };
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'attendance', v: register }] } });
      await api.reload();
      api.log('Took the register', `${cls?.name} · ${fmtDate(date)} · ${register.absent.length} absent`);
      // Only pupils newly marked absent trigger a message to their parents.
      const told = register.absent.filter((id) => !(existing?.absent || []).includes(id)).length;
      notify(`Register saved: ${count('present') + count('late')} present, ${register.absent.length} absent.${told ? ` The parents of ${told} absent pupil${told > 1 ? 's' : ''} have been notified.` : ''}`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Term summary per pupil, from every register taken this term.
  const days = (db.attendance || []).filter((a) => a.classId === classId && term && a.date >= term.start && (!term.end || a.date <= term.end));
  const summary = pupils.map((p) => {
    const absent = days.filter((a) => (a.absent || []).includes(p.id)).length;
    const late = days.filter((a) => (a.late || []).includes(p.id)).length;
    return { id: p.id, name: fullName(p), regNo: p.regNo, present: days.length - absent, absent, late, rate: days.length ? Math.round(((days.length - absent) / days.length) * 100) : 100 };
  }).sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name));
  const cols = [{ key: 'regNo', label: 'Reg. No' }, { key: 'name', label: 'Pupil' }, { key: 'present', label: 'Days present', align: 'right' }, { key: 'absent', label: 'Days absent', align: 'right' }, { key: 'late', label: 'Days late', align: 'right' }, { key: 'rate', label: 'Attendance %', align: 'right', format: (v) => `${v}%` }];

  return (
    <>
      {toast}
      <PageHeader title="Daily attendance" subtitle="Mark who is absent or late each morning. Parents of absent pupils get a notification on their phone straight away." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card
          bodyClass=""
          title={`${cls?.name || ''} · ${fmtDate(date)}`}
          actions={<>
            <Button variant="secondary" icon={CheckCheck} onClick={() => setMarks(Object.fromEntries(pupils.map((p) => [p.id, 'present'])))}>All present</Button>
            <Button icon={Save} disabled={busy || !pupils.length} onClick={save}>{busy ? 'Saving…' : existing ? 'Update register' : 'Save register'}</Button>
          </>}
        >
          <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
            <Field label="Class"><Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!!myClass} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Date"><input className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          {existing && <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">Register already taken by {db.users.find((u) => u.id === existing.takenBy)?.name || 'staff'} · {fmtDateTime(existing.takenAt)}. Changes update it, and only newly absent pupils' parents are notified.</p>}
          {!pupils.length ? <Empty title="No pupils in this class" /> : (
            <ul className="divide-y divide-slate-100">
              {pupils.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div><p className="font-semibold text-slate-800">{fullName(p)}</p><p className="font-mono text-xs text-slate-500">{p.regNo}</p></div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${fullName(p)}`}>
                    {STATES.map(([k, label, on]) => (
                      <button key={k} type="button" role="radio" aria-checked={marks[p.id] === k} onClick={() => setMarks({ ...marks, [p.id]: k })}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${marks[p.id] === k ? on : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-4 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
            <span><b className="text-emerald-700">{count('present')}</b> present</span>
            <span><b className="text-rose-600">{count('absent')}</b> absent</span>
            <span><b className="text-amber-700">{count('late')}</b> late</span>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Days recorded this term" value={days.length} tone="blue" />
            <StatCard label="Average attendance" value={`${summary.length ? Math.round(summary.reduce((t, s) => t + s.rate, 0) / summary.length) : 100}%`} tone="green" />
          </div>
          <Card title="This term" bodyClass="" actions={<ExportButtons
            onPdf={() => exportTablePDF({ school: db.school, title: 'Attendance Summary', subtitle: `${cls?.name} · ${term?.label} · ${days.length} school days`, columns: cols, rows: summary })}
            onExcel={() => exportExcel({ title: `Attendance ${cls?.name}`, columns: cols.map((c) => ({ ...c, format: undefined })), rows: summary })}
          />}>
            {!days.length ? <p className="px-5 py-6 text-sm text-slate-500">No register taken yet this term.</p> : (
              <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto text-sm">
                {summary.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-5 py-2">
                    <span className="truncate">{s.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {s.absent > 0 && <Badge tone="red">{s.absent} absent</Badge>}
                      {s.late > 0 && <Badge tone="amber">{s.late} late</Badge>}
                      {!s.absent && !s.late && <Badge tone="green">Always present</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
