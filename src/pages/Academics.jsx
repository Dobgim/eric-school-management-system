import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms } from '../lib/finance';
import { fullName } from '../lib/utils';
import { Button, Card, Empty, Field, PageHeader, Select, useToast } from '../components/ui';

const CONDUCT = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const autoRemark = (avg) => (avg >= 16 ? 'Outstanding performance, keep it up.' : avg >= 12 ? 'Good work. Can do better.' : avg >= 10 ? 'Average. Needs more effort.' : 'Weak. Needs close follow-up at home.');

/** Term averages, conduct and attendance — entered by class teachers (own class) or the office. */
export default function Academics({ lockedClassId }) {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const myClass = lockedClassId || (user.role === 'teacher' ? db.classes.find((c) => c.teacherId === db.users.find((u) => u.id === user.id)?.staffId)?.id : null);
  const [classId, setClassId] = useState(myClass || [...db.classes].sort((a, b) => a.order - b.order)[0]?.id);
  const [termId, setTermId] = useState(db.settings.currentTermId);
  const term = allTerms(db).find((t) => t.id === termId);

  const pupils = useMemo(() => db.students
    .filter((s) => s.enrollments?.[term.sessionId] === classId && (s.status === 'active' || db.academicRecords.some((r) => r.studentId === s.id && r.termId === termId)))
    .sort((a, b) => a.lastName.localeCompare(b.lastName)), [db, classId, termId, term.sessionId]);

  const [rows, setRows] = useState({});
  const [daysOpen, setDaysOpen] = useState(60);
  useEffect(() => {
    const next = {};
    let open = 60;
    pupils.forEach((p) => {
      const r = db.academicRecords.find((x) => x.studentId === p.id && x.termId === termId);
      if (r?.daysOpen) open = r.daysOpen;
      next[p.id] = { average: r?.average ?? '', conduct: r?.conduct || 'Good', attendance: r?.attendance ?? '', remark: r?.remark || '' };
    });
    setRows(next);
    setDaysOpen(open);
    // Only reload when the class/term changes, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, termId]);

  if (user.role === 'teacher' && !myClass) return <Empty title="No class assigned" message="Ask the administrator to assign you a class." />;

  const setRow = (id, k, v) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));

  const save = () => {
    const bad = Object.values(rows).some((r) => r.average !== '' && (Number(r.average) < 0 || Number(r.average) > 20));
    if (bad) return notify('Averages must be between 0 and 20.');
    const entered = pupils.filter((p) => rows[p.id]?.average !== '' && rows[p.id]?.average !== undefined);
    const ranked = [...entered].sort((a, b) => Number(rows[b.id].average) - Number(rows[a.id].average));
    api.mutate((d) => {
      d.academicRecords = d.academicRecords.filter((r) => !(r.termId === termId && pupils.some((p) => p.id === r.studentId)));
      ranked.forEach((p, i) => {
        const r = rows[p.id];
        const avg = Number(r.average);
        // Ties share a position.
        const position = i > 0 && Number(rows[ranked[i - 1].id].average) === avg ? d.academicRecords.at(-1).position : i + 1;
        d.academicRecords.push({
          id: `ar-${termId}-${p.id}`, studentId: p.id, sessionId: term.sessionId, termId, classId,
          average: avg, position, outOf: ranked.length, conduct: r.conduct,
          remark: r.remark || autoRemark(avg), attendance: r.attendance === '' ? null : Number(r.attendance), daysOpen: Number(daysOpen) || null,
          enteredBy: user.id,
        });
      });
      return d;
    });
    api.log('Saved term results', `${db.classes.find((c) => c.id === classId)?.name} · ${term.label}`);
    notify(`Saved results for ${ranked.length} pupil(s).`);
  };

  return (
    <>
      {toast}
      {!lockedClassId && <PageHeader title="Term Results" subtitle="Enter each pupil’s term average (out of 20), attendance and conduct. Positions are calculated automatically." />}
      <Card
        title={lockedClassId ? 'Term results' : undefined}
        actions={<Button icon={Save} onClick={save} disabled={!pupils.length}>Save results</Button>}
        bodyClass=""
      >
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Field label="Class"><Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!!myClass} options={[...db.classes].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Term"><Select value={termId} onChange={(e) => setTermId(e.target.value)} options={allTerms(db).map((t) => ({ value: t.id, label: t.label }))} /></Field>
          <Field label="Days school opened"><input className="input" type="number" min="1" value={daysOpen} onChange={(e) => setDaysOpen(e.target.value)} /></Field>
        </div>
        {!pupils.length ? <Empty title="No pupils in this class for that session" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Pupil</th><th className="w-28">Average /20</th><th className="w-28">Days present</th><th className="w-36">Conduct</th><th>Remark (auto if blank)</th></tr></thead>
              <tbody>
                {pupils.map((p) => {
                  const r = rows[p.id] || {};
                  return (
                    <tr key={p.id}>
                      <td><p className="font-semibold text-slate-800">{fullName(p)}</p><p className="font-mono text-xs text-slate-500">{p.regNo}</p></td>
                      <td><input className="input tabular-nums" type="number" step="0.01" min="0" max="20" value={r.average ?? ''} onChange={(e) => setRow(p.id, 'average', e.target.value)} aria-label={`Average for ${fullName(p)}`} /></td>
                      <td><input className="input tabular-nums" type="number" min="0" max={daysOpen} value={r.attendance ?? ''} onChange={(e) => setRow(p.id, 'attendance', e.target.value)} aria-label="Days present" /></td>
                      <td><Select value={r.conduct || 'Good'} onChange={(e) => setRow(p.id, 'conduct', e.target.value)} options={CONDUCT} /></td>
                      <td><input className="input min-w-56" value={r.remark ?? ''} placeholder={r.average !== '' && r.average !== undefined ? autoRemark(Number(r.average)) : ''} onChange={(e) => setRow(p.id, 'remark', e.target.value)} aria-label="Remark" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
