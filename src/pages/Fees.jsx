import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banknote, Download, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { allTerms, billLines, currentTerm, feeStatus, termPaid, termsUpTo } from '../lib/finance';
import { downloadReceipt } from '../lib/documents';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { PAYMENT_METHODS, feeTypeLabel, fmtDate, fullName, methodLabel, money, pad, sum, today, uid } from '../lib/utils';
import { Badge, Button, Card, Confirm, DataTable, ExportButtons, FeeBadge, Field, Input, Modal, PageHeader, SearchInput, Select, StatCard, Textarea, useToast } from '../components/ui';

export default function Fees() {
  const { db, user, api } = useStore();
  const [params, setParams] = useSearchParams();
  const [toast, notify] = useToast();
  const term = currentTerm(db);
  const [filters, setFilters] = useState({ q: '', from: '', to: '', method: '', termId: term.id });
  const [del, setDel] = useState(null);
  const payFor = params.get('student');
  const [open, setOpen] = useState(!!payFor);
  const cur = db.school.currency;
  const pendingRequests = db.paymentRequests.filter((r) => r.status === 'pending');

  const rows = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    return db.payments
      .filter((p) => !filters.termId || p.termId === filters.termId)
      .filter((p) => !filters.method || p.method === filters.method)
      .filter((p) => (!filters.from || p.date >= filters.from) && (!filters.to || p.date <= filters.to))
      .map((p) => ({ ...p, student: db.students.find((s) => s.id === p.studentId) }))
      .filter((p) => !needle || `${p.receiptNo} ${p.reference} ${fullName(p.student)} ${p.student?.regNo}`.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo));
  }, [db, filters]);

  const todays = db.payments.filter((p) => p.date === today());
  const termTotal = sum(db.payments.filter((p) => p.termId === term.id), (p) => p.amount);
  const momo = sum(db.payments.filter((p) => p.termId === term.id && (p.method === 'mtn' || p.method === 'orange')), (p) => p.amount);
  const total = sum(rows, (p) => p.amount);

  const cols = [
    { key: 'receiptNo', label: 'Receipt' },
    { key: 'date', label: 'Date', format: fmtDate },
    { key: 'name', label: 'Pupil' },
    { key: 'regNo', label: 'Reg. No' },
    { key: 'className', label: 'Class' },
    { key: 'method', label: 'Method', format: methodLabel },
    { key: 'reference', label: 'Reference' },
    { key: 'amount', label: 'Amount', align: 'right', format: (v) => money(v, '') },
  ];
  const exportRows = () => rows.map((p) => ({ ...p, name: fullName(p.student), regNo: p.student?.regNo, className: db.classes.find((c) => c.id === p.student?.classId)?.name }));
  const title = 'Fee Payments';
  const subtitle = [filters.termId && allTerms(db).find((t) => t.id === filters.termId)?.label, filters.from && `from ${fmtDate(filters.from)}`, filters.to && `to ${fmtDate(filters.to)}`, filters.method && methodLabel(filters.method)].filter(Boolean).join(' · ');

  return (
    <>
      {toast}
      <PageHeader
        title="Fee Collection"
        subtitle="Record school fees paid in cash, MTN Mobile Money, Orange Money or by bank transfer."
        actions={can(user, 'fees.collect') && <Button icon={Plus} onClick={() => setOpen(true)}>Record payment</Button>}
      />
      {pendingRequests.length > 0 && can(user, 'fees.collect') && (
        <Link to="/fees/online" className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span><b>{pendingRequests.length} parent payment(s)</b> ({money(sum(pendingRequests, (r) => r.amount), cur)}) waiting for you to verify.</span>
          <span className="font-semibold">Review now →</span>
        </Link>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected today" value={money(sum(todays, (p) => p.amount), cur)} icon={Banknote} tone="green" hint={`${todays.length} payment(s)`} />
        <StatCard label={`Collected · ${term.name}`} value={money(termTotal, cur)} icon={Banknote} />
        <StatCard label="Via Mobile Money" value={money(momo, cur)} tone="amber" hint={`${termTotal ? Math.round((momo / termTotal) * 100) : 0}% of this term`} />
        <StatCard label="Shown below" value={money(total, cur)} tone="purple" hint={`${rows.length} payment(s)`} />
      </div>
      <Card bodyClass="">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput value={filters.q} onChange={(q) => setFilters({ ...filters, q })} placeholder="Receipt, pupil or reference…" className="lg:col-span-2" />
          <Select value={filters.termId} onChange={(e) => setFilters({ ...filters, termId: e.target.value })} placeholder="All terms" options={allTerms(db).map((t) => ({ value: t.id, label: t.label }))} />
          <Select value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })} placeholder="All methods" options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))} />
          <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="To date" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm text-slate-500">{rows.length} payments · <b className="text-slate-800">{money(total, cur)}</b></p>
          <div className="flex gap-2">
            <ExportButtons
              onPdf={() => exportTablePDF({ school: db.school, title, subtitle, columns: cols, rows: exportRows(), summary: [['Number of payments', String(rows.length)], ['Total collected', money(total, cur)]] })}
              onExcel={() => exportExcel({ title, columns: cols, rows: exportRows(), summary: [['Total collected', total]] })}
            />
          </div>
        </div>
        <DataTable
          rows={rows}
          pageSize={20}
          columns={[
            { key: 'receiptNo', label: 'Receipt', render: (p) => <span className="font-mono text-xs">{p.receiptNo}</span> },
            { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
            { key: 'student', label: 'Pupil', render: (p) => <Link to={`/students/${p.studentId}`} className="font-semibold text-slate-800 hover:text-brand-700">{fullName(p.student)}</Link> },
            { key: 'term', label: 'Term', render: (p) => allTerms(db).find((t) => t.id === p.termId)?.label },
            { key: 'method', label: 'Method', render: (p) => <div><Badge tone={p.method === 'mtn' ? 'amber' : p.method === 'orange' ? 'red' : p.method === 'bank' ? 'blue' : 'green'}>{methodLabel(p.method)}</Badge>{p.channel === 'online' && <Badge tone='blue' className='ml-1'>Online</Badge>}{p.channel === 'portal' && <Badge className='ml-1'>Via portal</Badge>}{p.reference && <p className="mt-0.5 font-mono text-xs text-slate-500">{p.reference}</p>}</div> },
            { key: 'amount', label: 'Amount', align: 'right', render: (p) => <span className="font-semibold">{money(p.amount, '')}</span> },
            { key: 'a', label: '', align: 'right', render: (p) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadReceipt(db, p)}>Receipt</Button>
                {user.role === 'superadmin' && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(p)} aria-label="Void payment" />}
              </div>
            ) },
          ]}
        />
      </Card>
      <PaymentModal
        open={open}
        initialStudent={payFor}
        onClose={() => { setOpen(false); if (payFor) setParams({}, { replace: true }); }}
        onSaved={(p) => notify(`Payment ${p.receiptNo} recorded.`)}
      />
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Void payment" title="Void payment" message={del && `Delete receipt ${del.receiptNo} (${money(del.amount, cur)}) for ${fullName(del.student)}? The pupil's balance will go back up. This is recorded in the activity log.`} onConfirm={() => {
        api.remove('payments', del.id);
        api.log('Voided payment', `${del.receiptNo} — ${money(del.amount, cur)} — ${fullName(del.student)}`);
      }} />
    </>
  );
}

export function PaymentModal({ open, onClose, onSaved, initialStudent }) {
  const { db, api, user } = useStore();
  const [q, setQ] = useState('');
  const [studentId, setStudentId] = useState(initialStudent || '');
  const [form, setForm] = useState({ termId: '', amount: '', method: 'cash', reference: '', date: today(), note: '' });
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const student = db.students.find((s) => s.id === studentId);
  const cur = db.school.currency;

  const outstanding = student ? termsUpTo(db, db.settings.currentTermId)
    .map((t) => ({ ...t, billed: billLines(db, student, t.id).reduce((x, l) => x + l.amount, 0), paid: termPaid(db, student.id, t.id) }))
    .filter((t) => t.billed > 0) : [];
  const defaultTerm = outstanding.find((t) => t.paid < t.billed)?.id || db.settings.currentTermId;
  const termId = form.termId || defaultTerm;
  const sel = outstanding.find((t) => t.id === termId);
  const status = student ? feeStatus(db, student) : null;
  const matches = q.trim().length >= 2 ? db.students.filter((s) => `${fullName(s)} ${s.regNo}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  const reset = () => { setQ(''); setStudentId(''); setForm({ termId: '', amount: '', method: 'cash', reference: '', date: today(), note: '' }); setSaved(null); setError(''); };
  const close = () => { reset(); onClose(); };

  const save = () => {
    const amount = Number(form.amount);
    if (!student) return setError('Choose a pupil.');
    if (!amount || amount <= 0) return setError('Enter the amount received.');
    if (form.method !== 'cash' && !form.reference.trim()) return setError('Enter the transaction ID / bank reference.');
    const dup = form.reference.trim() && db.payments.find((p) => p.reference && p.reference.toLowerCase() === form.reference.trim().toLowerCase());
    if (dup) return setError(`Reference already used on receipt ${dup.receiptNo}.`);
    const t = allTerms(db).find((x) => x.id === termId);
    const receiptNo = `RCT-${form.date.slice(0, 4)}-${pad(api.nextCounter('receipt'), 5)}`;
    const p = api.add('payments', { id: uid('pay'), receiptNo, studentId: student.id, sessionId: t.sessionId, termId, date: form.date, amount, method: form.method, reference: form.reference.trim(), note: form.note, receivedBy: user.id });
    api.log('Recorded payment', `${receiptNo} — ${money(amount, cur)} — ${fullName(student)} (${methodLabel(form.method)})`);
    setSaved(p);
    onSaved?.(p);
  };

  return (
    <Modal open={open} onClose={close} title="Record fee payment" size="lg" footer={saved
      ? <><Button variant="secondary" onClick={reset}>Record another</Button><Button icon={Download} onClick={() => downloadReceipt({ ...db, payments: db.payments.some((x) => x.id === saved.id) ? db.payments : [...db.payments, saved] }, saved)}>Download receipt</Button></>
      : <><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={save}>Save payment</Button></>}>
      {saved ? (
        <div className="py-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Banknote className="size-7" /></div>
          <p className="mt-3 text-lg font-bold text-slate-900">{money(saved.amount, cur)} received</p>
          <p className="text-sm text-slate-500">Receipt {saved.receiptNo} · {fullName(student)}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {!student ? (
              <Field label="Pupil">
                <SearchInput value={q} onChange={setQ} placeholder="Type a name or reg. no…" />
                {matches.length > 0 && (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {matches.map((s) => (
                      <li key={s.id}><button type="button" onClick={() => setStudentId(s.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span><b>{fullName(s)}</b> <span className="text-slate-500">· {db.classes.find((c) => c.id === s.classId)?.name}</span></span>
                        <span className="font-mono text-xs text-slate-500">{s.regNo}</span>
                      </button></li>
                    ))}
                  </ul>
                )}
              </Field>
            ) : (
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
                <div><p className="font-bold text-brand-900">{fullName(student)}</p><p className="text-xs text-brand-700">{student.regNo} · {db.classes.find((c) => c.id === student.classId)?.name}</p></div>
                <Button size="sm" variant="ghost" onClick={() => { setStudentId(''); setForm({ ...form, termId: '' }); }}>Change</Button>
              </div>
            )}
            <Field label="Paying for term"><Select value={termId} onChange={(e) => setForm({ ...form, termId: e.target.value })} options={(outstanding.length ? outstanding : allTerms(db)).map((t) => ({ value: t.id, label: `${t.label}${t.billed !== undefined ? ` — balance ${money(Math.max(0, t.billed - t.paid), '')}` : ''}` }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Amount (${cur})`}><Input type="number" min="0" step="500" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Date"><Input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            </div>
            {sel && sel.billed > sel.paid && <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setForm({ ...form, amount: String(sel.billed - sel.paid) })}>Pay full balance ({money(sel.billed - sel.paid, cur)})</button>}
            <Field label="Payment method">
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m.id} type="button" onClick={() => setForm({ ...form, method: m.id })} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${form.method === m.id ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{m.label}</button>
                ))}
              </div>
            </Field>
            {form.method !== 'cash' && <Field label={form.method === 'bank' ? 'Bank reference / slip number' : 'MoMo transaction ID'}><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder={form.method === 'bank' ? 'e.g. AFB123456' : 'e.g. MP240915.1234.A12345'} /></Field>}
            <Field label="Note (optional)"><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          </div>
          <div>
            {student && status ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between"><p className="label mb-0">{sel?.label || 'Term'}</p>{sel && <FeeBadge state={sel.paid >= sel.billed ? 'paid' : sel.paid ? 'partial' : 'unpaid'} />}</div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {billLines(db, student, termId).map((l) => (
                      <li key={l.feeType} className="flex justify-between"><span className="text-slate-600">{feeTypeLabel(l.feeType)}{l.discount ? <span className="text-xs text-emerald-600"> (−{money(l.discount, '')})</span> : ''}</span><span className="tabular-nums">{money(l.amount, '')}</span></li>
                    ))}
                    <li className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold"><span>Billed</span><span className="tabular-nums">{money(sel?.billed, '')}</span></li>
                    <li className="flex justify-between text-emerald-700"><span>Paid so far</span><span className="tabular-nums">{money(sel?.paid, '')}</span></li>
                    <li className="flex justify-between font-bold text-rose-600"><span>Balance</span><span className="tabular-nums">{money(Math.max(0, (sel?.billed || 0) - (sel?.paid || 0)), '')}</span></li>
                  </ul>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Current term balance</span><b className="tabular-nums">{money(status.balance, cur)}</b></div>
                  <div className="mt-1 flex justify-between"><span className="text-slate-600">Arrears (earlier terms)</span><b className="text-rose-600 tabular-nums">{money(status.arrears, cur)}</b></div>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold">Total owing</span><b className="tabular-nums">{money(status.totalDue, cur)}</b></div>
                </div>
              </div>
            ) : (
              <div className="grid h-full min-h-48 place-items-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Choose a pupil to see their bill, payments so far and arrears.</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
