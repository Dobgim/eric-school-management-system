import { useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, Download, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { computePayrollItem, payrollTotals } from '../lib/finance';
import { downloadPayslip } from '../lib/documents';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { PAYMENT_METHODS, fmtDate, methodLabel, money, monthLabel, thisMonth, today, uid } from '../lib/utils';
import { Badge, Button, Card, Confirm, DataTable, Empty, ExportButtons, Field, Input, Modal, PageHeader, Select, StatCard, Tabs, useToast } from '../components/ui';

const RUN_TONE = { draft: ['slate', 'Draft'], approved: ['amber', 'Approved — paying'], paid: ['green', 'Fully paid'] };

export default function Payroll() {
  const [tab, setTab] = useState('run');
  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly salaries with advances, deductions, bonuses and CNPS — plus one-click payslips." />
      <Tabs tabs={[{ id: 'run', label: 'Monthly payroll', icon: Wallet }, { id: 'adj', label: 'Advances, deductions & bonuses' }, { id: 'history', label: 'Payment history' }]} value={tab} onChange={setTab} />
      {tab === 'run' && <MonthRun />}
      {tab === 'adj' && <Adjustments />}
      {tab === 'history' && <History />}
    </>
  );
}

function MonthRun() {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const runs = [...db.payrollRuns].sort((a, b) => b.month.localeCompare(a.month));
  const [month, setMonth] = useState(runs[0]?.month || thisMonth());
  const [pay, setPay] = useState(null);
  const [regen, setRegen] = useState(false);
  const run = db.payrollRuns.find((r) => r.month === month);
  const t = payrollTotals(run);
  const cur = db.school.currency;
  const staffName = (id) => { const s = db.staff.find((x) => x.id === id); return s ? `${s.firstName} ${s.lastName}` : '—'; };

  const generate = () => {
    const items = db.staff.filter((s) => s.status === 'active').map((s) => computePayrollItem(db, s, month));
    api.mutate((d) => {
      d.payrollRuns = d.payrollRuns.filter((r) => r.month !== month);
      d.payrollRuns.push({ id: `pr-${month}`, month, status: 'draft', createdAt: new Date().toISOString(), createdBy: user.id, items });
      return d;
    });
    api.log(run ? 'Recomputed payroll' : 'Generated payroll', monthLabel(month));
    notify(`Payroll for ${monthLabel(month)} computed for ${items.length} staff.`);
  };

  const setRun = (patch) => api.mutate((d) => {
    const r = d.payrollRuns.find((x) => x.month === month);
    Object.assign(r, typeof patch === 'function' ? patch(r) : patch);
    if (r.items.length && r.items.every((i) => i.paid)) r.status = 'paid';
    return d;
  });

  const markPaid = () => {
    const ids = pay.ids;
    setRun((r) => ({ status: 'approved', items: r.items.map((i) => (ids.includes(i.staffId) ? { ...i, paid: true, paidDate: pay.date, method: pay.method || i.method } : i)) }));
    api.log('Paid salaries', `${monthLabel(month)} — ${ids.length} staff`);
    notify(`${ids.length} salary payment(s) recorded.`);
    setPay(null);
  };

  const cols = [
    { key: 'name', label: 'Staff' }, { key: 'basic', label: 'Basic', align: 'right' }, { key: 'allow', label: 'Allowances', align: 'right' },
    { key: 'bonus', label: 'Bonus', align: 'right' }, { key: 'advance', label: 'Advance', align: 'right' }, { key: 'cnps', label: 'CNPS', align: 'right' },
    { key: 'otherDeductions', label: 'Other ded.', align: 'right' }, { key: 'net', label: 'Net pay', align: 'right' }, { key: 'status', label: 'Status' },
  ].map((c) => (c.align ? { ...c, format: (v) => money(v, '') } : c));
  const exportRows = () => (run?.items || []).map((i) => ({ ...i, name: staffName(i.staffId), allow: i.housing + i.transport, status: i.paid ? `Paid ${fmtDate(i.paidDate)}` : 'Pending' }));
  const summary = [['Staff', String(t.count)], ['Gross', money(t.gross, cur)], ['Deductions', money(t.deductions, cur)], ['Net payroll', money(t.net, cur)], ['Paid', money(t.paid, cur)], ['Outstanding', money(t.unpaid, cur)]];

  return (
    <>
      {toast}
      <Card bodyClass="">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          {run && <Badge tone={RUN_TONE[run.status][0]} className="mb-2.5">{RUN_TONE[run.status][1]}</Badge>}
          <div className="ml-auto flex flex-wrap gap-2">
            {!run && <Button icon={Plus} onClick={generate}>Compute payroll for {monthLabel(month)}</Button>}
            {run && run.status === 'draft' && <><Button variant="secondary" icon={RefreshCw} onClick={generate}>Recompute</Button><Button icon={BadgeCheck} onClick={() => { setRun({ status: 'approved', approvedBy: user.id }); api.log('Approved payroll', monthLabel(month)); }}>Approve</Button></>}
            {run && run.status !== 'draft' && t.unpaid > 0 && <Button variant="success" icon={CheckCircle2} onClick={() => setPay({ ids: run.items.filter((i) => !i.paid).map((i) => i.staffId), date: today(), method: '' })}>Pay all pending ({run.items.filter((i) => !i.paid).length})</Button>}
            {run && run.status !== 'draft' && !run.items.some((i) => i.paid) && <Button variant="ghost" icon={RefreshCw} onClick={() => setRegen(true)}>Recompute</Button>}
            {run && <ExportButtons
              onPdf={() => exportTablePDF({ school: db.school, title: `Payroll - ${monthLabel(month)}`, columns: cols, rows: exportRows(), summary, landscape: true })}
              onExcel={() => exportExcel({ title: `Payroll ${monthLabel(month)}`, columns: cols.map((c) => ({ ...c, format: undefined })), rows: exportRows(), summary: [['Net payroll', t.net], ['Paid', t.paid]] })}
            />}
          </div>
        </div>
        {run ? (
          <>
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Gross pay" value={money(t.gross, cur)} />
              <StatCard label="Deductions" value={money(t.deductions, cur)} tone="red" hint="Advances, CNPS & others" />
              <StatCard label="Net payroll" value={money(t.net, cur)} tone="purple" />
              <StatCard label="Paid" value={`${t.paidCount} / ${t.count}`} tone="green" hint={`${money(t.paid, cur)} · ${money(t.unpaid, cur)} pending`} />
            </div>
            <DataTable
              rows={run.items}
              pageSize={50}
              columns={[
                { key: 'name', label: 'Staff', render: (i) => <div><p className="font-semibold text-slate-800">{staffName(i.staffId)}</p><p className="text-xs text-slate-500">{db.staff.find((s) => s.id === i.staffId)?.position}</p></div> },
                { key: 'basic', label: 'Basic', align: 'right', render: (i) => money(i.basic, '') },
                { key: 'allow', label: 'Allowances', align: 'right', render: (i) => money(i.housing + i.transport, '') },
                { key: 'bonus', label: 'Bonus', align: 'right', render: (i) => (i.bonus ? <span className="text-emerald-700">+{money(i.bonus, '')}</span> : '—') },
                { key: 'ded', label: 'Deductions', align: 'right', render: (i) => <span className="text-rose-600" title={`CNPS ${i.cnps} · Advance ${i.advance} · Other ${i.otherDeductions}`}>−{money(i.cnps + i.advance + i.otherDeductions, '')}</span> },
                { key: 'net', label: 'Net pay', align: 'right', render: (i) => <b>{money(i.net, '')}</b> },
                { key: 'status', label: 'Status', render: (i) => (i.paid ? <div><Badge tone="green">Paid</Badge><p className="mt-0.5 text-xs text-slate-500">{fmtDate(i.paidDate)} · {methodLabel(i.method)}</p></div> : <Badge tone="amber">Pending</Badge>) },
                { key: 'a', label: '', align: 'right', render: (i) => (
                  <div className="flex justify-end gap-1">
                    {!i.paid && run.status !== 'draft' && <Button size="sm" variant="secondary" onClick={() => setPay({ ids: [i.staffId], date: today(), method: i.method })}>Pay</Button>}
                    <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadPayslip(db, run, i)}>Payslip</Button>
                  </div>
                ) },
              ]}
            />
            {run.status === 'draft' && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Draft — add any advances, deductions or bonuses for {monthLabel(month)}, click Recompute, then Approve to start paying.</p>}
          </>
        ) : (
          <Empty title={`No payroll for ${monthLabel(month)} yet`} message={`Computes salaries for ${db.staff.filter((s) => s.status === 'active').length} active staff from their salary scales, plus that month’s advances, deductions and bonuses, and CNPS at ${db.settings.cnpsRate}%.`} />
        )}
      </Card>
      <Modal open={!!pay} onClose={() => setPay(null)} title={`Pay ${pay?.ids.length} staff`} size="sm" footer={<><Button variant="secondary" onClick={() => setPay(null)}>Cancel</Button><Button variant="success" onClick={markPaid}>Confirm payment</Button></>}>
        {pay && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Total: <b>{money((run?.items || []).filter((i) => pay.ids.includes(i.staffId)).reduce((x, i) => x + i.net, 0), cur)}</b></p>
            <Field label="Payment date"><Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
            <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} placeholder="Each staff’s usual method" options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))} /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={regen} onClose={() => setRegen(false)} title="Recompute approved payroll" confirmLabel="Recompute" message="Nothing has been paid yet, so the run can be recomputed. It will return to Draft." onConfirm={generate} />
    </>
  );
}

function Adjustments() {
  const { db, api } = useStore();
  const [month, setMonth] = useState(thisMonth());
  const [form, setForm] = useState(null);
  const [toast, notify] = useToast();
  const rows = db.salaryAdjustments.filter((a) => a.month === month);
  const run = db.payrollRuns.find((r) => r.month === month);
  const staffName = (id) => { const s = db.staff.find((x) => x.id === id); return s ? `${s.firstName} ${s.lastName}` : '—'; };
  const locked = run && run.status !== 'draft';

  const save = () => {
    if (!form.staffId || !(Number(form.amount) > 0) || !form.reason.trim()) return notify('Choose staff, amount and reason.');
    api.add('salaryAdjustments', { ...form, id: uid('adj'), amount: Number(form.amount), month });
    api.log(`Recorded salary ${form.type}`, `${staffName(form.staffId)} — ${money(form.amount, db.school.currency)} (${monthLabel(month)})`);
    notify(run ? 'Saved. Recompute the payroll to include it.' : 'Saved. It will be included when payroll is computed.');
    setForm(null);
  };

  return (
    <Card bodyClass="" title={<div className="flex items-center gap-2"><span>Adjustments for</span><input type="month" className="input w-auto py-1" value={month} onChange={(e) => setMonth(e.target.value)} /></div>} actions={<Button icon={Plus} disabled={locked} onClick={() => setForm({ staffId: '', type: 'advance', amount: '', reason: '' })}>Add</Button>}>
      {toast}
      {locked && <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">Payroll for {monthLabel(month)} is approved, so adjustments are locked. Record new ones against the next month.</p>}
      <DataTable
        rows={rows}
        empty={<Empty title="No adjustments this month" message="Salary advances are deducted in the month you record them for." />}
        columns={[
          { key: 'staff', label: 'Staff', render: (a) => staffName(a.staffId) },
          { key: 'type', label: 'Type', render: (a) => <Badge tone={a.type === 'bonus' ? 'green' : a.type === 'advance' ? 'amber' : 'red'} className="capitalize">{a.type}</Badge> },
          { key: 'amount', label: 'Amount', align: 'right', render: (a) => money(a.amount, '') },
          { key: 'reason', label: 'Reason', className: 'text-slate-600' },
          { key: 'x', label: '', align: 'right', render: (a) => !locked && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { api.remove('salaryAdjustments', a.id); api.log('Removed salary adjustment', `${staffName(a.staffId)} ${a.type}`); }} aria-label="Remove" /> },
        ]}
      />
      <Modal open={!!form} onClose={() => setForm(null)} title={`Add adjustment · ${monthLabel(month)}`} size="sm" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Staff"><Select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} placeholder="— Choose —" options={db.staff.filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))} /></Field>
            <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[{ value: 'advance', label: 'Salary advance (deducted)' }, { value: 'deduction', label: 'Other deduction' }, { value: 'bonus', label: 'Bonus (added)' }]} /></Field>
            <Field label="Amount"><Input type="number" min="0" step="500" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function History() {
  const { db } = useStore();
  const [staffId, setStaffId] = useState('');
  const cur = db.school.currency;
  const runs = [...db.payrollRuns].sort((a, b) => b.month.localeCompare(a.month));
  const staffRows = useMemo(() => (staffId ? runs.map((r) => ({ run: r, item: r.items.find((i) => i.staffId === staffId) })).filter((x) => x.item) : []), [runs, staffId]);
  return (
    <div className="space-y-6">
      <Card title="Monthly payroll summary" bodyClass="">
        <DataTable
          rows={runs.map((r) => ({ ...r, ...payrollTotals(r) }))}
          columns={[
            { key: 'month', label: 'Month', render: (r) => <b>{monthLabel(r.month)}</b> },
            { key: 'count', label: 'Staff', align: 'right' },
            { key: 'gross', label: 'Gross', align: 'right', render: (r) => money(r.gross, '') },
            { key: 'deductions', label: 'Deductions', align: 'right', render: (r) => money(r.deductions, '') },
            { key: 'net', label: 'Net', align: 'right', render: (r) => <b>{money(r.net, '')}</b> },
            { key: 'paid', label: 'Paid', align: 'right', render: (r) => money(r.paid, '') },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={RUN_TONE[r.status][0]}>{RUN_TONE[r.status][1]}</Badge> },
          ]}
        />
      </Card>
      <Card title="Salary history per staff" bodyClass="" actions={<Select value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="— Choose staff —" options={db.staff.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))} className="w-56" />}>
        {!staffId ? <Empty title="Choose a staff member" /> : (
          <DataTable
            rows={staffRows.map((x) => ({ id: x.run.id, ...x }))}
            columns={[
              { key: 'month', label: 'Month', render: (x) => monthLabel(x.run.month) },
              { key: 'gross', label: 'Gross', align: 'right', render: (x) => money(x.item.gross, '') },
              { key: 'ded', label: 'Deductions', align: 'right', render: (x) => money(x.item.cnps + x.item.advance + x.item.otherDeductions, '') },
              { key: 'net', label: 'Net', align: 'right', render: (x) => <b>{money(x.item.net, cur)}</b> },
              { key: 'status', label: 'Status', render: (x) => (x.item.paid ? <Badge tone="green">Paid {fmtDate(x.item.paidDate)}</Badge> : <Badge tone="amber">Pending</Badge>) },
              { key: 'a', label: '', align: 'right', render: (x) => <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadPayslip(db, x.run, x.item)}>Payslip</Button> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
