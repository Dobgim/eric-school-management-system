import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { PAYMENT_METHODS, fmtDate, methodLabel, money, monthLabel, sum, thisMonth, today, uid } from '../lib/utils';
import { Badge, Button, Card, Confirm, DataTable, Empty, ExportButtons, Field, Input, Modal, PageHeader, Select, StatCard, useToast } from '../components/ui';

export const EXPENSE_CATEGORIES = [
  'Rent', 'Electricity & water', 'Stationery & teaching materials', 'Repairs & maintenance', 'Transport & fuel',
  'Food & canteen', 'Cleaning & sanitation', 'Internet & phone', 'Taxes & licences', 'Events & ceremonies',
  'Temporary staff & allowances', 'Furniture & equipment', 'Other',
];

const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/**
 * School spending (rent, electricity, materials…) and the month's money in against money out:
 * fees and sales received, minus spending and salaries paid.
 */
export default function Expenses() {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const cur = db.school.currency;
  const [month, setMonth] = useState(thisMonth());
  const [category, setCategory] = useState('');
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);

  const inMonth = (date, ym) => (date || '').slice(0, 7) === ym;
  const flows = (ym) => {
    const fees = sum(db.payments.filter((p) => inMonth(p.date, ym)), (p) => p.amount);
    const sales = sum(db.sales.filter((s) => inMonth(s.date, ym)), (s) => s.total);
    const spent = sum(db.expenses.filter((e) => inMonth(e.date, ym)), (e) => e.amount);
    const salaries = sum(db.payrollRuns.flatMap((r) => r.items).filter((i) => i.paid && inMonth(i.paidDate, ym)), (i) => i.net);
    return { fees, sales, spent, salaries, in: fees + sales, out: spent + salaries, balance: fees + sales - spent - salaries };
  };
  const now = flows(month);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -i)).map((ym) => ({ ym, label: monthLabel(ym), ...flows(ym) }));

  const rows = useMemo(() => db.expenses
    .filter((e) => inMonth(e.date, month) && (!category || e.category === category))
    .sort((a, b) => b.date.localeCompare(a.date)), [db.expenses, month, category]);
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ c, total: sum(db.expenses.filter((e) => inMonth(e.date, month) && e.category === c), (e) => e.amount) })).filter((x) => x.total).sort((a, b) => b.total - a.total);

  const save = () => {
    const amount = Math.round(Number(form.amount) || 0);
    if (!form.description.trim() || amount <= 0) return notify('Enter what it was for and the amount.');
    const e = { ...form, amount, description: form.description.trim(), paidTo: form.paidTo.trim(), reference: form.reference.trim() };
    if (e.id) api.update('expenses', e.id, e);
    else api.add('expenses', { ...e, id: uid('ex'), by: user.id, createdAt: new Date().toISOString() });
    api.log(e.id ? 'Edited expense' : 'Recorded expense', `${e.description} · ${money(amount, cur)}`);
    notify(e.id ? 'Expense updated.' : 'Expense recorded.');
    setForm(null);
  };

  const cols = [
    { key: 'date', label: 'Date', format: (v) => fmtDate(v) }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' },
    { key: 'paidTo', label: 'Paid to' }, { key: 'method', label: 'Method', format: (v) => methodLabel(v) }, { key: 'reference', label: 'Ref.' },
    { key: 'amount', label: 'Amount', align: 'right', format: (v) => money(v, '') },
  ];
  const summary = [['Month', monthLabel(month)], ['Spending listed', money(sum(rows, (r) => r.amount), cur)], ['Fees and sales received', money(now.in, cur)], ['Salaries paid', money(now.salaries, cur)], ['Balance for the month', money(now.balance, cur)]];

  return (
    <>
      {toast}
      <PageHeader title="Expenses & cash flow" subtitle="Record what the school spends, and see each month’s money in against money out."
        actions={<Button icon={Plus} onClick={() => setForm({ date: today(), category: EXPENSE_CATEGORIES[0], description: '', amount: '', method: 'cash', paidTo: '', reference: '' })}>Record expense</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Month"><input className="input w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} /></Field>
        <Field label="Category"><Select className="w-64" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={EXPENSE_CATEGORIES} /></Field>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Money in" value={money(now.in, cur)} tone="green" hint={`Fees ${money(now.fees, '')} · sales ${money(now.sales, '')}`} />
        <StatCard label="Spending" value={money(now.spent, cur)} tone="amber" hint={`${db.expenses.filter((e) => inMonth(e.date, month)).length} expenses`} />
        <StatCard label="Salaries paid" value={money(now.salaries, cur)} tone="purple" />
        <StatCard label="Balance" value={money(now.balance, cur)} tone={now.balance >= 0 ? 'blue' : 'red'} hint={now.balance >= 0 ? 'More came in than went out' : 'More went out than came in'} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card bodyClass="" title={`Spending · ${monthLabel(month)}`} actions={<ExportButtons
          onPdf={() => exportTablePDF({ school: db.school, title: 'School Expenses', subtitle: `${monthLabel(month)}${category ? ` · ${category}` : ''}`, columns: cols, rows, summary, landscape: true })}
          onExcel={() => exportExcel({ title: `Expenses ${month}`, columns: cols.map((c) => ({ ...c, format: c.key === 'method' ? c.format : undefined })), rows, summary })}
        />}>
          <DataTable
            rows={rows}
            empty={<Empty title="No spending recorded for this month" message="Record rent, electricity, materials and other costs as they are paid." />}
            columns={[
              { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) },
              { key: 'description', label: 'What for', render: (e) => <div><p className="font-semibold text-slate-800">{e.description}</p><p className="text-xs text-slate-500">{e.category}{e.paidTo ? ` · ${e.paidTo}` : ''}</p></div> },
              { key: 'method', label: 'Paid by', render: (e) => <div><p>{methodLabel(e.method)}</p>{e.reference && <p className="font-mono text-xs text-slate-500">{e.reference}</p>}</div> },
              { key: 'amount', label: 'Amount', align: 'right', render: (e) => <b className="tabular-nums">{money(e.amount, '')}</b> },
              { key: 'a', label: '', align: 'right', render: (e) => <span className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm({ ...e, amount: String(e.amount) })} aria-label="Edit" /><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(e)} aria-label="Delete" /></span> },
            ]}
          />
        </Card>
        <div className="space-y-6">
          <Card title="By category">
            {byCategory.length ? (
              <ul className="space-y-2 text-sm">
                {byCategory.map(({ c, total }) => (
                  <li key={c}>
                    <div className="flex justify-between gap-2"><span>{c}</span><b className="tabular-nums">{money(total, '')}</b></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-accent-500" style={{ width: `${Math.round((total / now.spent) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Nothing yet.</p>}
          </Card>
          <Card title="Last 6 months" bodyClass="">
            <table className="table-base">
              <thead><tr><th>Month</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.ym}>
                    <td className="whitespace-nowrap">{m.label}</td>
                    <td className="text-right tabular-nums">{money(m.in, '')}</td>
                    <td className="text-right tabular-nums">{money(m.out, '')}</td>
                    <td className="text-right"><Badge tone={m.balance >= 0 ? 'green' : 'red'}>{money(m.balance, '')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit expense' : 'Record expense'} footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What was it for? *" className="sm:col-span-2"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. ENEO electricity bill, October" /></Field>
            <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={EXPENSE_CATEGORIES} /></Field>
            <Field label={`Amount (${cur}) *`}><Input type="number" min="0" step="500" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Paid by"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))} /></Field>
            <Field label="Paid to"><Input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="Person or company" /></Field>
            <Field label="Receipt / reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title="Delete expense" message={`Delete “${del?.description}” (${money(del?.amount, cur)})?`} onConfirm={() => { api.remove('expenses', del.id); api.log('Deleted expense', del.description); }} />
    </>
  );
}
