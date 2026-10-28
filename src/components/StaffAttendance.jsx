import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save } from 'lucide-react';
import { useStore } from '../lib/store';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { fmtDate, fmtDateTime, monthLabel, thisMonth, today } from '../lib/utils';
import { Badge, Button, Card, Empty, ExportButtons, Field, StatCard, useToast } from './ui';

const STATES = [['present', 'Present', 'bg-emerald-600 text-white border-emerald-600'], ['absent', 'Absent', 'bg-rose-600 text-white border-rose-600'], ['late', 'Late', 'bg-amber-500 text-white border-amber-500']];

/** Daily register of teachers and staff, kept by the office, with a monthly summary. */
export default function StaffAttendance() {
  const { db, api } = useStore();
  const [toast, notify] = useToast();
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);
  const staff = useMemo(() => db.staff.filter((s) => s.status === 'active').sort((a, b) => (a.category === b.category ? a.lastName.localeCompare(b.lastName) : a.category === 'teaching' ? -1 : 1)), [db.staff]);
  const existing = (db.staffAttendance || []).find((a) => a.date === date);
  useEffect(() => {
    setMarks(Object.fromEntries(staff.map((s) => [s.id, existing?.absent?.includes(s.id) ? 'absent' : existing?.late?.includes(s.id) ? 'late' : 'present'])));
    // Reload when the date or the saved register changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.takenAt, staff.length]);

  const count = (k) => staff.filter((s) => marks[s.id] === k).length;
  const save = async () => {
    setBusy(true);
    try {
      const v = { id: `satt-${date}`, date, absent: staff.filter((s) => marks[s.id] === 'absent').map((s) => s.id), late: staff.filter((s) => marks[s.id] === 'late').map((s) => s.id), takenAt: new Date().toISOString() };
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'staffAttendance', v }] } });
      await api.reload();
      api.log('Took the staff register', `${fmtDate(date)} · ${v.absent.length} absent`);
      notify(`Staff register saved: ${count('present') + count('late')} present, ${count('absent')} absent, ${count('late')} late.`);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  // Monthly summary
  const [month, setMonth] = useState(thisMonth());
  const days = (db.staffAttendance || []).filter((a) => a.date.startsWith(month));
  const summary = staff.map((s) => {
    const absent = days.filter((a) => (a.absent || []).includes(s.id)).length;
    const late = days.filter((a) => (a.late || []).includes(s.id)).length;
    return { id: s.id, name: `${s.firstName} ${s.lastName}`, position: s.position, staffNo: s.staffNo, present: days.length - absent, absent, late, rate: days.length ? Math.round(((days.length - absent) / days.length) * 100) : 100 };
  }).sort((a, b) => b.absent - a.absent || b.late - a.late || a.name.localeCompare(b.name));
  const cols = [{ key: 'staffNo', label: 'Staff no' }, { key: 'name', label: 'Name' }, { key: 'position', label: 'Position' }, { key: 'present', label: 'Days present', align: 'right' }, { key: 'absent', label: 'Days absent', align: 'right' }, { key: 'late', label: 'Days late', align: 'right' }, { key: 'rate', label: 'Attendance %', align: 'right', format: (v) => `${v}%` }];

  return (
    <>
      {toast}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card bodyClass="" title={`Staff register · ${fmtDate(date)}`} actions={<>
          <Button variant="secondary" icon={CheckCheck} onClick={() => setMarks(Object.fromEntries(staff.map((s) => [s.id, 'present'])))}>All present</Button>
          <Button icon={Save} disabled={busy || !staff.length} onClick={save}>{busy ? 'Saving…' : existing ? 'Update register' : 'Save register'}</Button>
        </>}>
          <div className="border-b border-slate-100 p-4"><Field label="Date" className="max-w-xs"><input className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
          {existing && <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">Register already taken · {fmtDateTime(existing.takenAt)}. Saving again updates it.</p>}
          {!staff.length ? <Empty title="No staff yet" message="Add teachers and staff under Staff first." /> : (
            <ul className="divide-y divide-slate-100">
              {staff.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div><p className="font-semibold text-slate-800">{s.firstName} {s.lastName}</p><p className="text-xs text-slate-500">{s.position}{s.category === 'teaching' ? ' · Teacher' : ''}</p></div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.firstName} ${s.lastName}`}>
                    {STATES.map(([k, label, on]) => (
                      <button key={k} type="button" role="radio" aria-checked={marks[s.id] === k} onClick={() => setMarks({ ...marks, [s.id]: k })}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${marks[s.id] === k ? on : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
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
            <StatCard label="Days recorded" value={days.length} tone="blue" hint={monthLabel(month)} />
            <StatCard label="Average attendance" value={`${summary.length ? Math.round(summary.reduce((t, x) => t + x.rate, 0) / summary.length) : 100}%`} tone="green" />
          </div>
          <Card title="Monthly summary" bodyClass="" actions={<ExportButtons
            onPdf={() => exportTablePDF({ school: db.school, title: 'Staff Attendance', subtitle: `${monthLabel(month)} · ${days.length} working days recorded`, columns: cols, rows: summary })}
            onExcel={() => exportExcel({ title: `Staff attendance ${month}`, columns: cols.map((c) => ({ ...c, format: undefined })), rows: summary })} />}>
            <div className="border-b border-slate-100 px-5 py-3"><input className="input max-w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} aria-label="Month" /></div>
            {!days.length ? <p className="px-5 py-4 text-sm text-slate-500">No staff register taken this month.</p> : (
              <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto text-sm">
                {summary.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 px-5 py-2">
                    <span className="truncate">{x.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {x.absent > 0 && <Badge tone="red">{x.absent} absent</Badge>}
                      {x.late > 0 && <Badge tone="amber">{x.late} late</Badge>}
                      {!x.absent && !x.late && <Badge tone="green">Always present</Badge>}
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

/** A staff member's own attendance this month (from the office's staff register). */
export function MyAttendance() {
  const { db, user } = useStore();
  const month = thisMonth();
  const days = (db.staffAttendance || []).filter((a) => a.date.startsWith(month));
  if (!user.staffId || !days.length) return null;
  const absent = days.filter((a) => (a.absent || []).includes(user.staffId));
  const late = days.filter((a) => (a.late || []).includes(user.staffId));
  return (
    <Card title={`My attendance · ${monthLabel(month)}`}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-700">{days.length - absent.length}</p><p className="text-xs text-slate-600">days present</p></div>
        <div className="rounded-lg bg-rose-50 p-3"><p className="text-2xl font-bold text-rose-600">{absent.length}</p><p className="text-xs text-slate-600">days absent</p></div>
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-2xl font-bold text-amber-700">{late.length}</p><p className="text-xs text-slate-600">days late</p></div>
      </div>
      {(absent.length > 0 || late.length > 0) && <p className="mt-3 text-xs text-slate-500">{[...absent.map((a) => `${fmtDate(a.date)}: absent`), ...late.map((a) => `${fmtDate(a.date)}: late`)].join(' · ')}</p>}
    </Card>
  );
}
