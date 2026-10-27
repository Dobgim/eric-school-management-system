import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentTerm, feeStatus } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { fullName, money, sum } from '../lib/utils';
import { Card, DataTable, Empty, ExportButtons, Field, Input, PageHeader, SearchInput, Select, StatCard } from '../components/ui';
import { Progress } from '../components/Charts';

export default function Debtors() {
  const { db } = useStore();
  const term = currentTerm(db);
  const cur = db.school.currency;
  const [f, setF] = useState({ q: '', classId: '', min: '', scope: 'active', kind: '' });

  const all = useMemo(() => db.students
    .filter((s) => (f.scope === 'active' ? s.status === 'active' : s.status !== 'active'))
    .map((s) => {
      const st = feeStatus(db, s, term.id);
      const g = db.guardians.find((x) => x.id === s.guardianIds[0]);
      return { ...s, ...st, name: fullName(s), className: db.classes.find((c) => c.id === s.classId)?.name || '', guardian: g?.name || '', phone: g?.phone || '' };
    })
    .filter((s) => s.totalDue > 0), [db, term.id, f.scope]);

  const rows = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return all
      .filter((s) => !f.classId || s.classId === f.classId)
      .filter((s) => !f.min || s.totalDue >= Number(f.min))
      .filter((s) => (f.kind === 'arrears' ? s.arrears > 0 : f.kind === 'unpaid' ? s.paid === 0 : true))
      .filter((s) => !needle || `${s.name} ${s.regNo} ${s.guardian} ${s.phone}`.toLowerCase().includes(needle))
      .sort((a, b) => b.totalDue - a.totalDue);
  }, [all, f]);

  const totals = { balance: sum(rows, (r) => r.balance), arrears: sum(rows, (r) => r.arrears), due: sum(rows, (r) => r.totalDue) };
  const cols = [
    { key: 'regNo', label: 'Reg. No' },
    { key: 'name', label: 'Pupil' },
    { key: 'className', label: 'Class' },
    { key: 'guardian', label: 'Parent' },
    { key: 'phone', label: 'Phone' },
    { key: 'billed', label: 'Term bill', align: 'right', format: (v) => money(v, '') },
    { key: 'paid', label: 'Paid', align: 'right', format: (v) => money(v, '') },
    { key: 'balance', label: 'Term balance', align: 'right', format: (v) => money(v, '') },
    { key: 'arrears', label: 'Arrears', align: 'right', format: (v) => money(v, '') },
    { key: 'totalDue', label: 'Total owing', align: 'right', format: (v) => money(v, '') },
  ];
  const summary = [['Debtors', String(rows.length)], ['Term balances', money(totals.balance, cur)], ['Arrears', money(totals.arrears, cur)], ['Total owing', money(totals.due, cur)]];

  const whatsapp = (s) => {
    const msg = `Dear ${s.guardian}, this is a reminder from ${db.school.name} that ${s.firstName} ${s.lastName} (${s.className}) has an outstanding balance of ${money(s.totalDue, cur)} for ${term.label}${s.arrears ? ` (including ${money(s.arrears, cur)} arrears)` : ''}. Kindly pay at the bursary or by Mobile Money. Thank you.`;
    const num = s.phone.replace(/\D/g, '');
    return `https://wa.me/${num.startsWith('237') ? num : `237${num}`}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <>
      <PageHeader title="Debtors & Arrears" subtitle={`Pupils with unpaid fees for ${term.label} or earlier terms.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Debtors" value={rows.length} tone="red" hint={`of ${db.students.filter((s) => s.status === 'active').length} active pupils`} />
        <StatCard label="Current term balances" value={money(totals.balance, cur)} tone="amber" />
        <StatCard label="Arrears" value={money(totals.arrears, cur)} tone="red" hint={`${rows.filter((r) => r.arrears).length} pupils`} />
        <StatCard label="Total owing" value={money(totals.due, cur)} tone="purple" />
      </div>
      <Card bodyClass="">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Pupil, parent or phone…" />
          <Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })} placeholder="All classes" options={[...db.classes].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name }))} />
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} placeholder="All debtors" options={[{ value: 'unpaid', label: 'Paid nothing this term' }, { value: 'arrears', label: 'Has arrears' }]} />
          <Field><Input type="number" min="0" step="5000" placeholder={`Owing at least (${cur})`} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <Select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} options={[{ value: 'active', label: 'Current pupils' }, { value: 'left', label: 'Past pupils (bad debt)' }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm text-slate-500">{rows.length} debtors · <b className="text-rose-600">{money(totals.due, cur)}</b></p>
          <div className="flex gap-2">
            <ExportButtons
              onPdf={() => exportTablePDF({ school: db.school, title: 'Debtors List', subtitle: term.label, columns: cols, rows, summary, landscape: true })}
              onExcel={() => exportExcel({ title: 'Debtors List', columns: cols.map((c) => ({ ...c, format: undefined })), rows, summary: [['Total owing', totals.due]] })}
            />
          </div>
        </div>
        <DataTable
          rows={rows}
          pageSize={25}
          empty={<Empty title="No debtors" message="Every pupil matching these filters is fully paid." />}
          columns={[
            { key: 'name', label: 'Pupil', render: (s) => <div><Link to={`/students/${s.id}`} className="font-semibold text-slate-800 hover:text-brand-700">{s.name}</Link><p className="text-xs text-slate-500">{s.className} · <span className="font-mono">{s.regNo}</span></p></div> },
            { key: 'guardian', label: 'Parent', render: (s) => <div><p>{s.guardian}</p><p className="text-xs text-slate-500">{s.phone}</p></div> },
            { key: 'progress', label: 'Term paid', render: (s) => <div className="w-28"><Progress value={s.paid} max={s.billed} tone={s.paid ? 'bg-amber-500' : 'bg-rose-500'} /><p className="mt-1 text-xs text-slate-500">{money(s.paid, '')} / {money(s.billed, '')}</p></div> },
            { key: 'balance', label: 'Term balance', align: 'right', render: (s) => money(s.balance, '') },
            { key: 'arrears', label: 'Arrears', align: 'right', render: (s) => (s.arrears ? <span className="text-rose-600">{money(s.arrears, '')}</span> : '—') },
            { key: 'totalDue', label: 'Total owing', align: 'right', render: (s) => <span className="font-bold text-rose-600">{money(s.totalDue, '')}</span> },
            { key: 'a', label: '', align: 'right', render: (s) => s.phone && <a href={whatsapp(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><MessageCircle className="size-3.5" />Remind</a> },
          ]}
        />
      </Card>
    </>
  );
}
