import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, Settings2, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { feeStatus } from '../lib/finance';
import { recordPayment } from '../lib/payments';
import { fmtDate, fmtDateTime, fullName, methodLabel, money, sum, thisMonth } from '../lib/utils';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Modal, PageHeader, StatCard, Tabs, Textarea, useToast } from '../components/ui';
import { REQUEST_STATUS } from './ParentDashboard';

/** Bursar queue: payments parents made by USSD/bank and submitted for verification, plus portal payment history. */
export default function PaymentRequests() {
  const { db, api, user } = useStore();
  const [tab, setTab] = useState('pending');
  const [approve, setApprove] = useState(null);
  const [reject, setReject] = useState(null);
  const [toast, notify] = useToast();
  const cur = db.school.currency;
  const all = [...db.paymentRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = all.filter((r) => r.status === 'pending');
  const rows = tab === 'pending' ? pending : all.filter((r) => r.status !== 'pending');
  const guardianName = (id) => db.guardians.find((g) => g.id === id)?.name || '—';
  const kid = (id) => db.students.find((s) => s.id === id);
  const onlineMonth = sum(db.payments.filter((p) => p.channel === 'online' && p.date.slice(0, 7) === thisMonth()), (p) => p.amount);

  const doApprove = () => {
    const items = approve.items.map((i) => ({ ...i, amount: Math.round(Number(i.amount) || 0) })).filter((i) => i.amount > 0);
    if (!items.length) return notify('Enter the amount actually received.');
    const created = items.flatMap((i) => recordPayment(db, api, {
      studentId: i.studentId, amount: i.amount, method: approve.request.method, reference: approve.request.reference,
      date: approve.date, receivedBy: user.id, channel: 'portal', requestId: approve.request.id,
      note: `Submitted by ${guardianName(approve.request.guardianId)} via parent portal`,
    }));
    api.update('paymentRequests', approve.request.id, { status: 'approved', reviewedBy: user.id, reviewedAt: new Date().toISOString(), paymentIds: created.map((p) => p.id), approvedAmount: sum(items, (i) => i.amount), reviewNote: approve.note });
    api.log('Verified parent payment', `${approve.request.ref} — ${money(sum(items, (i) => i.amount), cur)} (${approve.request.reference})`);
    notify(`Confirmed. ${created.length} receipt(s) issued: ${created.map((p) => p.receiptNo).join(', ')}`);
    setApprove(null);
  };

  const doReject = () => {
    if (!reject.reason.trim()) return notify('Tell the parent why, so they can fix it.');
    api.update('paymentRequests', reject.request.id, { status: 'rejected', reviewedBy: user.id, reviewedAt: new Date().toISOString(), reviewNote: reject.reason.trim() });
    api.log('Rejected parent payment', `${reject.request.ref} — ${reject.reason.trim()}`);
    notify('Rejected. The parent sees your reason in their portal.');
    setReject(null);
  };

  const openProof = (r) => {
    const w = window.open();
    if (w) w.document.write(`<title>${r.ref} proof</title><iframe src="${r.proof}" style="border:0;width:100%;height:100vh"></iframe>`);
  };

  return (
    <>
      {toast}
      <PageHeader
        title="Parent Payments"
        subtitle="Check each MoMo / bank transaction against the school's statement, then confirm it to issue receipts."
        actions={user.role === 'superadmin' && <Link to="/school?tab=settings"><Button variant="secondary" icon={Settings2}>Payment accounts</Button></Link>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting verification" value={pending.length} tone={pending.length ? 'amber' : 'green'} hint={money(sum(pending, (r) => r.amount), cur)} />
        <StatCard label="Paid online this month" value={money(onlineMonth, cur)} tone="blue" hint="Phone-prompt payments, receipted automatically" />
        <StatCard label="Rejected (all time)" value={all.filter((r) => r.status === 'rejected').length} tone="red" />
      </div>
      <Tabs tabs={[{ id: 'pending', label: 'To verify', count: pending.length }, { id: 'history', label: 'History' }]} value={tab} onChange={setTab} />
      <Card bodyClass="">
        <DataTable
          rows={rows}
          pageSize={20}
          empty={<Empty title={tab === 'pending' ? 'Nothing to verify' : 'No history yet'} message={tab === 'pending' ? 'Payments parents submit from the portal appear here.' : undefined} />}
          columns={[
            { key: 'createdAt', label: 'Submitted', render: (r) => <div><p className="whitespace-nowrap">{fmtDate(r.createdAt)}</p><p className="font-mono text-xs text-slate-500">{r.ref}</p></div> },
            { key: 'parent', label: 'Parent', render: (r) => <div><p className="font-semibold text-slate-800">{guardianName(r.guardianId)}</p><p className="text-xs text-slate-500">{r.payerPhone}</p></div> },
            { key: 'for', label: 'For', render: (r) => <ul className="text-sm">{r.items.map((i) => <li key={i.studentId}><Link to={`/students/${i.studentId}`} className="hover:text-brand-700">{fullName(kid(i.studentId))}</Link> <span className="text-slate-500">{money(i.amount, '')}</span></li>)}</ul> },
            { key: 'tx', label: 'Transaction', render: (r) => <div><p>{methodLabel(r.method)}{r.channel === 'online' && <Badge tone="blue" className="ml-1.5">Phone prompt</Badge>}</p><p className="font-mono text-xs text-slate-600">{r.reference}</p><p className="text-xs text-slate-500">Paid {fmtDate(r.paidOn)}</p></div> },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => <b>{money(r.approvedAmount ?? r.amount, '')}</b> },
            { key: 'status', label: 'Status', render: (r) => <div><Badge tone={REQUEST_STATUS[r.status][0]}>{REQUEST_STATUS[r.status][1]}</Badge>{r.reviewedAt && <p className="mt-0.5 text-xs text-slate-500">{db.users.find((u) => u.id === r.reviewedBy)?.name || 'Automatic'} · {fmtDateTime(r.reviewedAt)}</p>}{r.reviewNote && <p className="max-w-48 text-xs text-slate-500">{r.reviewNote}</p>}</div> },
            { key: 'a', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                {r.proof && <Button size="sm" variant="ghost" icon={Eye} onClick={() => openProof(r)}>Proof</Button>}
                {r.status === 'pending' && <>
                  <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setReject({ request: r, reason: '' })}>Reject</Button>
                  <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setApprove({ request: r, date: r.paidOn, note: '', items: r.items.map((i) => ({ ...i, amount: String(i.amount) })) })}>Confirm</Button>
                </>}
              </div>
            ) },
          ]}
        />
      </Card>

      <Modal open={!!approve} onClose={() => setApprove(null)} title={`Confirm ${approve?.request.ref}`} footer={<><Button variant="secondary" onClick={() => setApprove(null)}>Cancel</Button><Button variant="success" icon={CheckCircle2} onClick={doApprove}>Confirm & issue receipts</Button></>}>
        {approve && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p><b>{methodLabel(approve.request.method)}</b> · transaction <span className="font-mono">{approve.request.reference}</span> · from {approve.request.payerPhone}</p>
              {approve.request.note && <p className="mt-1 text-slate-600">“{approve.request.note}”</p>}
              <p className="mt-1 text-xs text-slate-500">Check this transaction ID on the school’s {approve.request.method === 'bank' ? 'bank statement' : 'MoMo merchant account'} before confirming.</p>
            </div>
            {approve.items.map((i, idx) => {
              const s = kid(i.studentId);
              return (
                <Field key={i.studentId} label={`${fullName(s)} — owes ${money(feeStatus(db, s).totalDue, '')}`}>
                  <Input type="number" min="0" value={i.amount} onChange={(e) => setApprove({ ...approve, items: approve.items.map((x, j) => (j === idx ? { ...x, amount: e.target.value } : x)) })} />
                </Field>
              );
            })}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date received"><Input type="date" value={approve.date} onChange={(e) => setApprove({ ...approve, date: e.target.value })} /></Field>
              <Field label="Note (optional)"><Input value={approve.note} onChange={(e) => setApprove({ ...approve, note: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-slate-500">Each amount is applied to the pupil’s oldest unpaid term first.</p>
          </div>
        )}
      </Modal>
      <Modal open={!!reject} onClose={() => setReject(null)} size="sm" title={`Reject ${reject?.request.ref}`} footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" onClick={doReject}>Reject</Button></>}>
        {reject && (
          <Field label="Reason (shown to the parent)">
            <Textarea value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} placeholder="e.g. Transaction ID not found on the MTN merchant statement — please check the SMS and resubmit." />
          </Field>
        )}
      </Modal>
    </>
  );
}
