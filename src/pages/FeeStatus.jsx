import { useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms, scopeLabel, scopeStatus, sessionTerms } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { fullName, money, sum } from '../lib/utils';
import { Card, DataTable, Empty, ExportButtons, PageHeader, SearchInput, Select, StatCard } from '../components/ui';
import { Progress } from '../components/Charts';

/**
 * Who has finished paying and who hasn't, for a term or the whole year. Updates by itself whenever a payment
 * is recorded (at the bursary or by a parent's phone): a pupil moves to "Completed" as soon as the fees are covered.
 */
export default function FeeStatus({ completed }) {
  const { db } = useStore();
  const cur = db.school.currency;
  const [scope, setScope] = useState(db.settings.currentTermId);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');

  const pupils = useMemo(() => db.students
    .filter((s) => s.status === 'active')
    .map((s) => {
      const st = scopeStatus(db, s, scope);
      const g = db.guardians.find((x) => x.id === s.guardianIds?.[0]);
      return { ...s, ...st, name: fullName(s), className: db.classes.find((c) => c.id === s.classId)?.name || '', classOrder: db.classes.find((c) => c.id === s.classId)?.order ?? 99, guardian: g?.name || '', phone: g?.phone || '' };
    })
    .filter((s) => s.billed > 0), [db, scope]);

  const done = pupils.filter((s) => s.complete);
  const notDone = pupils.filter((s) => !s.complete);
  const needle = q.trim().toLowerCase();
  const rows = (completed ? done : notDone)
    .filter((s) => !classId || s.classId === classId)
    .filter((s) => !needle || `${s.name} ${s.regNo} ${s.guardian} ${s.phone}`.toLowerCase().includes(needle))
    .sort((a, b) => a.classOrder - b.classOrder || a.name.localeCompare(b.name));

  const label = scopeLabel(db, scope);
  const className = db.classes.find((c) => c.id === classId)?.name;
  const title = completed ? 'Fees Completed' : 'Fees Not Completed';
  const cols = [
    { key: 'regNo', label: 'Reg. No' },
    { key: 'name', label: 'Pupil' },
    { key: 'className', label: 'Class' },
    { key: 'guardian', label: 'Parent' },
    { key: 'phone', label: 'Phone' },
    { key: 'billed', label: 'Fees', align: 'right', format: (v) => money(v, '') },
    { key: 'paid', label: 'Paid', align: 'right', format: (v) => money(v, '') },
    ...(completed ? [] : [{ key: 'left', label: 'Left to pay', align: 'right', format: (v) => money(v, '') }]),
  ];
  const summary = [
    ['Period', label], ...(className ? [['Class', className]] : []), ['Pupils', String(rows.length)],
    ['Paid', money(sum(rows, (r) => r.paid), cur)], ...(completed ? [] : [['Left to pay', money(sum(rows, (r) => r.left), cur)]]),
  ];
  const filename = `${title} - ${className ? `${className} - ` : ''}${label}`;

  const whatsapp = (s) => {
    const msg = `Dear ${s.guardian}, ${s.firstName} ${s.lastName} (${s.className}) has paid ${money(s.paid, cur)} of ${money(s.billed, cur)} for ${label} at ${db.school.name}. ${money(s.left, cur)} is left to pay. You can pay from the school app with Mobile Money. Thank you.`;
    const num = s.phone.replace(/\D/g, '');
    return `https://wa.me/${num.startsWith('237') ? num : `237${num}`}?text=${encodeURIComponent(msg)}`;
  };

  const terms = allTerms(db);
  return (
    <>
      <PageHeader title={completed ? 'Fees completed' : 'Fees not completed'} subtitle={completed ? 'Pupils who have paid all their fees. Names move here automatically once the last payment is recorded.' : 'Pupils who still owe, with what they have paid and what is left. Updated automatically with every payment.'} />
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {[['/fees/completed', 'Completed', done.length], ['/fees/not-completed', 'Not completed', notDone.length]].map(([to, text, n]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${isActive ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {text} <span className="ml-1 rounded-sm bg-slate-100 px-1.5 text-xs text-slate-600">{n}</span>
          </NavLink>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Completed" value={done.length} tone="green" hint={`of ${pupils.length} pupils billed`} />
        <StatCard label="Not completed" value={notDone.length} tone="red" />
        <StatCard label="Paid so far" value={money(sum(pupils, (p) => p.paid), cur)} tone="blue" hint={label} />
        <StatCard label="Left to collect" value={money(sum(notDone, (p) => p.left), cur)} tone="amber" />
      </div>
      <Card bodyClass="">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <SearchInput value={q} onChange={setQ} placeholder="Pupil, parent or phone…" />
          <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Term"
            options={[...terms.map((t) => ({ value: t.id, label: t.label })), { value: 'year', label: `Whole year (${sessionTerms(db).length} terms)` }]} />
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} placeholder="All classes" aria-label="Class" options={[...db.classes].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm text-slate-500">{rows.length} pupils · {label}{className ? ` · ${className}` : ''}</p>
          <div className="flex gap-2">
            <ExportButtons
              onPdf={() => exportTablePDF({ school: db.school, title, subtitle: `${label}${className ? ` · ${className}` : ''}`, columns: cols, rows, summary, filename, landscape: true })}
              onExcel={() => exportExcel({ title, columns: cols.map((c) => ({ ...c, format: undefined })), rows, filename, summary })}
            />
          </div>
        </div>
        <DataTable
          rows={rows}
          pageSize={30}
          empty={<Empty title={completed ? 'No pupil has completed yet' : 'Everyone has paid'} message={completed ? 'Pupils appear here as soon as their fees are fully paid.' : 'Every pupil matching these filters has paid all their fees.'} />}
          columns={[
            { key: 'name', label: 'Pupil', render: (s) => <div><Link to={`/students/${s.id}`} className="font-semibold text-slate-800 hover:text-brand-700">{s.name}</Link><p className="text-xs text-slate-500">{s.className} · <span className="font-mono">{s.regNo}</span></p></div> },
            { key: 'guardian', label: 'Parent', render: (s) => <div><p>{s.guardian || '—'}</p><p className="text-xs text-slate-500">{s.phone}</p></div> },
            { key: 'progress', label: 'Paid', render: (s) => <div className="w-32"><Progress value={s.paid} max={s.billed} tone={s.complete ? 'bg-emerald-500' : s.paid ? 'bg-amber-500' : 'bg-rose-500'} /><p className="mt-1 text-xs text-slate-500">{money(s.paid, '')} / {money(s.billed, '')}</p></div> },
            completed
              ? { key: 'billed', label: 'Fees', align: 'right', render: (s) => <span className="font-semibold text-emerald-700">{money(s.billed, '')}</span> }
              : { key: 'left', label: 'Left to pay', align: 'right', render: (s) => <span className="font-bold text-rose-600">{money(s.left, '')}</span> },
            ...(completed ? [] : [{ key: 'a', label: '', align: 'right', render: (s) => s.phone && <a href={whatsapp(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><MessageCircle className="size-3.5" />Remind</a> }]),
          ]}
        />
      </Card>
    </>
  );
}
