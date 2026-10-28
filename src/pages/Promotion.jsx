import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpCircle, CheckCircle2, LogOut, RotateCcw } from 'lucide-react';
import { useStore } from '../lib/store';
import { feeStatus } from '../lib/finance';
import { STUDENT_STATUS, fmtDate, fullName, money, today } from '../lib/utils';
import { Badge, Button, Card, Confirm, DataTable, Empty, Field, Input, Modal, PageHeader, SearchInput, Select, Tabs, Textarea, useToast } from '../components/ui';

const ACTIONS = {
  promote: 'Promote',
  repeat: 'Repeat class',
  graduate: 'Graduate',
  transfer: 'Transfer out',
  withdraw: 'Withdraw',
};

export default function Promotion() {
  const [tab, setTab] = useState('promote');
  return (
    <>
      <PageHeader title="Promotion & Exits" subtitle="Move pupils into the next session, and record graduations, transfers and withdrawals." />
      <Tabs tabs={[{ id: 'promote', label: 'End-of-session promotion', icon: ArrowUpCircle }, { id: 'exits', label: 'Transfers & withdrawals', icon: LogOut }]} value={tab} onChange={setTab} />
      {tab === 'promote' ? <Promote /> : <Exits />}
    </>
  );
}

function sessionAverage(db, studentId, sessionId) {
  const recs = db.academicRecords.filter((r) => r.studentId === studentId && r.sessionId === sessionId);
  return recs.length ? recs.reduce((t, r) => t + r.average, 0) / recs.length : null;
}

function Promote() {
  const { db, api } = useStore();
  const [toast, notify] = useToast();
  const sessions = [...db.sessions].sort((a, b) => a.start.localeCompare(b.start));
  const fromIdx = sessions.findIndex((s) => s.id === db.settings.currentSessionId);
  const [fromId, setFromId] = useState(sessions[fromIdx]?.id);
  const from = sessions.find((s) => s.id === fromId);
  const to = sessions[sessions.findIndex((s) => s.id === fromId) + 1];
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const [classId, setClassId] = useState(classes[0]?.id);
  const cls = classes.find((c) => c.id === classId);
  const nextClass = classes[classes.findIndex((c) => c.id === classId) + 1];
  const [choices, setChoices] = useState({});
  const [confirm, setConfirm] = useState(false);

  const pupils = useMemo(() => db.students
    .filter((s) => s.enrollments?.[fromId] === classId && s.status === 'active')
    .map((s) => {
      const avg = sessionAverage(db, s.id, fromId);
      const rec = db.promotionRecommendations.find((r) => r.studentId === s.id && r.sessionId === fromId);
      const suggested = rec?.recommendation || (avg !== null && avg < 10 ? 'repeat' : nextClass ? 'promote' : 'graduate');
      return { ...s, avg, rec, suggested, done: to && s.enrollments[to.id] };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName)), [db, fromId, classId, nextClass, to]);

  const pending = pupils.filter((p) => !p.done);
  const choice = (p) => choices[p.id] || p.suggested;

  const apply = () => {
    const date = today();
    const summary = {};
    api.mutate((d) => {
      pending.forEach((p) => {
        const s = d.students.find((x) => x.id === p.id);
        const a = choice(p);
        summary[a] = (summary[a] || 0) + 1;
        if (a === 'promote' || a === 'repeat') {
          const target = a === 'promote' ? nextClass.id : classId;
          s.enrollments = { ...s.enrollments, [to.id]: target };
          s.classId = target;
          s.history.push({ sessionId: to.id, classId: target, action: a === 'promote' ? 'promoted' : 'repeated', date });
        } else {
          s.status = a === 'graduate' ? 'graduated' : a === 'transfer' ? 'transferred' : 'withdrawn';
          s.exitDate = date;
          s.exitNote = a === 'graduate' ? `Completed ${cls.name}, ${from.name}` : `End of ${from.name}`;
          s.history.push({ sessionId: fromId, classId, action: s.status, date });
        }
      });
      return d;
    });
    api.log('Processed promotion', `${cls.name} ${from.name} → ${to?.name}: ${Object.entries(summary).map(([k, v]) => `${v} ${ACTIONS[k].toLowerCase()}`).join(', ')}`);
    notify(`Done: ${Object.entries(summary).map(([k, v]) => `${v} ${ACTIONS[k].toLowerCase()}`).join(', ')}.`);
    setChoices({});
  };

  const options = (p) => Object.entries(ACTIONS)
    // Graduating is possible from any class: the end of a cycle (Class 6, Form 5, 3e…) as well as the last class.
    .filter(([k]) => (k === 'promote' ? !!nextClass : true))
    .map(([value, label]) => ({ value, label: value === 'promote' ? `Promote → ${nextClass.name}` : label }));

  return (
    <>
      {toast}
      <Card bodyClass="">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Field label="From session"><Select value={fromId} onChange={(e) => { setFromId(e.target.value); setChoices({}); }} options={sessions.map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Into session"><input className="input" disabled value={to ? to.name : 'No next session — create it first'} /></Field>
          <Field label="Class"><Select value={classId} onChange={(e) => { setClassId(e.target.value); setChoices({}); }} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        </div>
        {!to ? (
          <Empty title="Create the next session first" message="Promotion moves pupils into the next academic session. Create it under School Profile → Sessions & Calendar." action={<Link to="/school"><Button>Go to School Profile</Button></Link>} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <p className="text-slate-500">{pending.length} to process · {pupils.length - pending.length} already moved into {to.name}. Suggestions use the teacher’s recommendation, otherwise the session average (below 10/20 → repeat).</p>
              <Button icon={CheckCircle2} disabled={!pending.length} onClick={() => setConfirm(true)}>Apply to {pending.length} pupil(s)</Button>
            </div>
            <DataTable
              rows={pupils}
              pageSize={50}
              empty={<Empty title={`No active pupils were in ${cls?.name} during ${from?.name}`} />}
              columns={[
                { key: 'name', label: 'Pupil', render: (p) => <div><Link to={`/students/${p.id}`} className="font-semibold text-slate-800 hover:text-brand-700">{fullName(p)}</Link><p className="font-mono text-xs text-slate-500">{p.regNo}</p></div> },
                { key: 'avg', label: 'Session avg', align: 'right', render: (p) => (p.avg === null ? '—' : <span className={p.avg >= 10 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-600'}>{p.avg.toFixed(2)}</span>) },
                { key: 'rec', label: 'Teacher says', render: (p) => (p.rec ? <div><Badge tone={p.rec.recommendation === 'promote' ? 'green' : 'amber'}>{p.rec.recommendation === 'promote' ? 'Promote' : 'Repeat'}</Badge>{p.rec.remark && <p className="mt-0.5 max-w-48 truncate text-xs text-slate-500">{p.rec.remark}</p>}</div> : <span className="text-slate-400">—</span>) },
                { key: 'owing', label: 'Owing', align: 'right', render: (p) => { const due = feeStatus(db, p).totalDue; return due ? <span className="text-rose-600">{money(due, '')}</span> : '—'; } },
                { key: 'action', label: 'Decision', render: (p) => (p.done
                  ? <Badge tone="green">In {db.classes.find((c) => c.id === p.enrollments[to.id])?.name}</Badge>
                  : <Select value={choice(p)} onChange={(e) => setChoices({ ...choices, [p.id]: e.target.value })} options={options(p)} className="min-w-44" />) },
              ]}
            />
          </>
        )}
      </Card>
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={apply} confirmLabel="Apply" title="Apply promotion decisions" message={`This moves ${pending.length} pupil(s) from ${cls?.name} (${from?.name}) into ${to?.name}. Promoted and repeating pupils appear in their new class straight away; graduations, transfers and withdrawals are recorded as exits.`} />
    </>
  );
}

function Exits() {
  const { db, api } = useStore();
  const [toast, notify] = useToast();
  const [q, setQ] = useState('');
  const [exit, setExit] = useState(null);
  const [reactivate, setReactivate] = useState(null);
  const needle = q.trim().toLowerCase();
  const active = needle.length >= 2 ? db.students.filter((s) => s.status === 'active' && `${fullName(s)} ${s.regNo}`.toLowerCase().includes(needle)).slice(0, 8) : [];
  const exited = db.students.filter((s) => s.status !== 'active').sort((a, b) => (b.exitDate || '').localeCompare(a.exitDate || ''));

  const save = () => {
    if (!exit.note.trim()) return notify('Add a reason or destination school.');
    api.mutate((d) => {
      const s = d.students.find((x) => x.id === exit.s.id);
      s.status = exit.type;
      s.exitDate = exit.date;
      s.exitNote = exit.note;
      s.history.push({ sessionId: d.settings.currentSessionId, classId: s.classId, action: exit.type, date: exit.date, note: exit.note });
      return d;
    });
    api.log(exit.type === 'transferred' ? 'Transferred pupil' : 'Withdrew pupil', `${fullName(exit.s)} (${exit.s.regNo}) — ${exit.note}`);
    notify(`${fullName(exit.s)} marked as ${exit.type}.`);
    setExit(null);
    setQ('');
  };

  return (
    <div className="space-y-6">
      {toast}
      <Card title="Record a transfer or withdrawal">
        <SearchInput value={q} onChange={setQ} placeholder="Type a pupil’s name or reg. no…" className="max-w-md" />
        {active.length > 0 && (
          <ul className="mt-3 max-w-md divide-y divide-slate-100 rounded-xl border border-slate-200">
            {active.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span><b>{fullName(s)}</b> <span className="text-slate-500">· {db.classes.find((c) => c.id === s.classId)?.name}</span></span>
                <span className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setExit({ s, type: 'transferred', date: today(), note: '' })}>Transfer</Button>
                  <Button size="sm" variant="secondary" onClick={() => setExit({ s, type: 'withdrawn', date: today(), note: '' })}>Withdraw</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Past pupils" bodyClass="">
        <DataTable
          rows={exited}
          columns={[
            { key: 'name', label: 'Pupil', render: (s) => <Link to={`/students/${s.id}`} className="font-semibold text-slate-800 hover:text-brand-700">{fullName(s)}</Link> },
            { key: 'regNo', label: 'Reg. No', render: (s) => <span className="font-mono text-xs">{s.regNo}</span> },
            { key: 'class', label: 'Last class', render: (s) => db.classes.find((c) => c.id === s.classId)?.name },
            { key: 'status', label: 'Status', render: (s) => <Badge tone={STUDENT_STATUS[s.status][0]}>{STUDENT_STATUS[s.status][1]}</Badge> },
            { key: 'exitDate', label: 'Date', render: (s) => fmtDate(s.exitDate) },
            { key: 'exitNote', label: 'Note', className: 'max-w-xs text-slate-600' },
            { key: 'a', label: '', align: 'right', render: (s) => <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setReactivate(s)}>Re-admit</Button> },
          ]}
        />
      </Card>
      <Modal open={!!exit} onClose={() => setExit(null)} title={exit?.type === 'transferred' ? `Transfer ${exit && fullName(exit.s)}` : `Withdraw ${exit && fullName(exit.s)}`} size="sm" footer={<><Button variant="secondary" onClick={() => setExit(null)}>Cancel</Button><Button variant="danger" onClick={save}>Confirm</Button></>}>
        {exit && (
          <div className="space-y-4">
            <Field label="Effective date"><Input type="date" value={exit.date} onChange={(e) => setExit({ ...exit, date: e.target.value })} /></Field>
            <Field label={exit.type === 'transferred' ? 'Destination school & reason' : 'Reason'}><Textarea value={exit.note} onChange={(e) => setExit({ ...exit, note: e.target.value })} /></Field>
            {feeStatus(db, exit.s).totalDue > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This pupil still owes {money(feeStatus(db, exit.s).totalDue, db.school.currency)}. The debt stays on record.</p>}
          </div>
        )}
      </Modal>
      <Confirm open={!!reactivate} onClose={() => setReactivate(null)} title="Re-admit pupil" confirmLabel="Re-admit" message={reactivate && `Make ${fullName(reactivate)} active again in ${db.classes.find((c) => c.id === reactivate.classId)?.name} for the current session?`} onConfirm={() => {
        api.mutate((d) => {
          const s = d.students.find((x) => x.id === reactivate.id);
          s.status = 'active';
          s.enrollments = { ...s.enrollments, [d.settings.currentSessionId]: s.classId };
          delete s.exitDate;
          delete s.exitNote;
          s.history.push({ sessionId: d.settings.currentSessionId, classId: s.classId, action: 'admitted', date: today(), note: 'Re-admitted' });
          return d;
        });
        api.log('Re-admitted pupil', `${fullName(reactivate)} (${reactivate.regNo})`);
      }} />
    </div>
  );
}
