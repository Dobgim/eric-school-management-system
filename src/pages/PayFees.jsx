import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, Download, FileUp, Info as InfoIcon, Landmark, Loader2, Smartphone, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { feeStatus, pendingFor } from '../lib/finance';
import { downloadReceipt } from '../lib/documents';
import { OPERATORS, detectOperator, normalizePhone } from '../lib/momo';
import { nextRequestRef } from '../lib/payments';
import { fmtDate, fullName, methodLabel, money, readFileAsDataURL, sum, today, uid } from '../lib/utils';
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import { myChildren } from './Portal';

export default function PayFees() {
  const { db, user } = useStore();
  const [params] = useSearchParams();
  const cur = db.school.currency;
  const kids = myChildren(db, user).filter((k) => k.status === 'active');
  const guardian = db.guardians.find((g) => g.id === user.guardianId);

  const rows = useMemo(() => kids.map((k) => {
    const st = feeStatus(db, k);
    const pending = pendingFor(db, k.id);
    return { k, st, pending, due: Math.max(0, st.totalDue - pending) };
  }), [db, kids.map((k) => k.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const preselect = params.get('child');
  // Prefill each child's outstanding balance (only the chosen child when arriving from "Pay" on a card).
  const defaults = () => Object.fromEntries(rows.map((r) => [r.k.id, (!preselect || preselect === r.k.id) && r.due > 0 ? String(r.due) : '']));
  const [amounts, setAmounts] = useState(defaults);
  const [mode, setMode] = useState('prompt');
  const [done, setDone] = useState(null);
  // Opening Pay Fees again (e.g. from the sidebar) starts a fresh payment with current balances.
  const location = useLocation();
  useEffect(() => {
    setDone(null);
    setAmounts(defaults());
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = rows.map((r) => ({ studentId: r.k.id, amount: Math.round(Number(amounts[r.k.id]) || 0) })).filter((i) => i.amount > 0);
  const total = sum(items, (i) => i.amount);

  if (!kids.length) return <><PageHeader title="Pay School Fees" /><Card><Empty title="No children currently enrolled" /></Card></>;
  if (done) return <Done result={done} onAgain={() => { setDone(null); setAmounts(defaults()); }} />;

  return (
    <>
      <PageHeader title="Pay School Fees" subtitle="Pay for one or several children at once. Each payment clears the oldest unpaid term first." />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card title="1. How much are you paying?" bodyClass="">
          <ul className="divide-y divide-slate-100">
            {rows.map(({ k, st, pending, due }) => (
              <li key={k.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <Avatar name={`${k.firstName} ${k.lastName}`} src={k.photo} size="sm" />
                <div className="min-w-48 flex-1">
                  <p className="font-semibold text-slate-800">{fullName(k)}</p>
                  <p className="text-xs text-slate-500">
                    {db.classes.find((c) => c.id === k.classId)?.name} · owing {money(st.totalDue, cur)}
                    {st.arrears > 0 && <> (incl. {money(st.arrears, '')} arrears)</>}
                  </p>
                  {pending > 0 && <p className="text-xs text-amber-700">{money(pending, cur)} awaiting verification</p>}
                </div>
                <div className="w-44">
                  <div className="relative">
                    <input
                      className="input pr-12 text-right font-semibold tabular-nums"
                      type="number" min="0" step="500" placeholder="0"
                      value={amounts[k.id] ?? ''}
                      onChange={(e) => setAmounts({ ...amounts, [k.id]: e.target.value })}
                      aria-label={`Amount for ${k.firstName}`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{cur}</span>
                  </div>
                  {due > 0 && String(due) !== amounts[k.id] && <button type="button" className="mt-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setAmounts({ ...amounts, [k.id]: String(due) })}>Pay full {money(due, '')}</button>}
                  {due === 0 && <p className="mt-1 text-xs text-emerald-700">Nothing owing</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-4">
            <span className="font-semibold text-slate-600">Total to pay</span>
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{money(total, cur)}</span>
          </div>
        </Card>

        <Card title="2. How do you want to pay?" className="h-fit xl:sticky xl:top-20">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button type="button" onClick={() => setMode('prompt')} className={`rounded-lg px-2 py-2 ${mode === 'prompt' ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>Pay now (MoMo)</button>
            <button type="button" onClick={() => setMode('manual')} className={`rounded-lg px-2 py-2 ${mode === 'manual' ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>I’ve already paid</button>
          </div>
          {mode === 'prompt'
            ? <PromptPay items={items} total={total} defaultPhone={guardian?.phone || ''} onDone={setDone} />
            : <ManualPay items={items} total={total} defaultPhone={guardian?.phone || ''} onDone={setDone} />}
        </Card>
      </div>
    </>
  );
}

function PromptPay({ items, total, defaultPhone, onDone }) {
  const { db, api, user } = useStore();
  const cur = db.school.currency;
  const [phone, setPhone] = useState(normalizePhone(defaultPhone));
  const [operator, setOperator] = useState(detectOperator(defaultPhone) || 'mtn');
  const [state, setState] = useState('idle'); // idle | sending | prompted | failed
  const [error, setError] = useState('');
  const demo = db.settings.momo?.gateway !== 'live';

  const onPhone = (v) => {
    setPhone(v);
    const op = detectOperator(v);
    if (op) setOperator(op);
  };

  const pay = async () => {
    setError('');
    if (!total) return setError('Enter an amount for at least one child.');
    if (detectOperator(phone) !== operator) return setError(`Enter a valid ${OPERATORS[operator].label} number (9 digits, e.g. ${operator === 'mtn' ? '677 12 34 56' : '699 12 34 56'}).`);
    setState('sending');
    // The server asks the operator to collect, records the payments and tells the bursar.
    const prompted = setTimeout(() => setState((s) => (s === 'sending' ? 'prompted' : s)), 900);
    try {
      const res = await api.request('/api/payments/online', { method: 'POST', body: { items, operator, phone: normalizePhone(phone) } });
      await api.reload();
      onDone({ kind: 'online', payments: res.payments, transactionId: res.transactionId, total: res.total, operator });
    } catch (e) {
      setState('failed');
      setError(e.message);
    } finally {
      clearTimeout(prompted);
    }
  };

  if (state === 'sending' || state === 'prompted') {
    return (
      <div className="py-6 text-center">
        <Loader2 className="mx-auto size-10 animate-spin text-brand-600" />
        <p className="mt-4 font-bold text-slate-900">{state === 'sending' ? 'Contacting ' + OPERATORS[operator].label + '…' : 'Check your phone'}</p>
        {state === 'prompted' && <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">A payment request of <b>{money(total, cur)}</b> was sent to <b>{phone}</b>. Enter your {OPERATORS[operator].short} PIN to approve it.</p>}
        <p className="mt-4 text-xs text-slate-400">Don’t close this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(OPERATORS).map(([id, op]) => (
          <button key={id} type="button" onClick={() => setOperator(id)} className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold ${operator === id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <span className={`grid size-6 place-items-center rounded-full text-[10px] ${op.color}`}>{id === 'mtn' ? 'M' : 'O'}</span>{op.short}
          </button>
        ))}
      </div>
      <Field label={`${OPERATORS[operator].short} number`} hint="The phone that will receive the payment prompt.">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">+237</span>
          <Input className="pl-14 tabular-nums" inputMode="numeric" value={phone} onChange={(e) => onPhone(e.target.value)} placeholder={operator === 'mtn' ? '677123456' : '699123456'} />
        </div>
      </Field>
      {error && <p className="flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      <Button className="w-full py-3" icon={Smartphone} disabled={!total} onClick={pay}>{state === 'failed' ? 'Try again' : `Pay ${money(total, cur)}`}</Button>
      {demo && (
        <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span><b>Demo mode</b> — no real money is taken. The phone prompt is simulated and the payment is recorded with a receipt. A number ending in 000 simulates a declined payment.</span>
        </p>
      )}
      <p className="text-center text-xs text-slate-500">You get an official receipt as soon as the payment is approved.</p>
    </div>
  );
}

function ManualPay({ items, total, defaultPhone, onDone }) {
  const { db, api, user } = useStore();
  const m = db.settings.momo || {};
  const cur = db.school.currency;
  const [f, setF] = useState({ method: 'mtn', reference: '', paidOn: today(), payerPhone: normalizePhone(defaultPhone), note: '', proof: '', proofName: '' });
  const [error, setError] = useState('');

  const onProof = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/pdf|image\//.test(file.type)) return setError('Upload a screenshot (image) or PDF.');
    if (file.size > 1_000_000) return setError('The file must be under 1 MB.');
    setF({ ...f, proof: await readFileAsDataURL(file), proofName: file.name });
  };

  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError('');
    if (!total) return setError('Enter an amount for at least one child.');
    if (f.reference.trim().length < 4) return setError(f.method === 'bank' ? 'Enter the bank slip / transfer reference.' : 'Enter the transaction ID from your confirmation SMS.');
    const ref = f.reference.trim().toLowerCase();
    if (db.payments.some((p) => p.reference?.toLowerCase() === ref) || db.paymentRequests.some((r) => r.status !== 'rejected' && r.reference?.toLowerCase() === ref)) return setError('This transaction ID has already been used.');
    setBusy(true);
    let request;
    try {
      request = {
        id: uid('rq'), ref: await nextRequestRef(api), channel: 'manual', status: 'pending', method: f.method,
        guardianId: user.guardianId, userId: user.id, payerPhone: f.payerPhone, reference: f.reference.trim(), paidOn: f.paidOn,
        proof: f.proof, proofName: f.proofName, note: f.note, items, amount: total, createdAt: new Date().toISOString(),
      };
      // Saved straight away (not queued) so the parent sees any problem; the server also alerts the bursar.
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'paymentRequests', v: request }] } });
      await api.reload();
    } catch (e) {
      setBusy(false);
      return setError(e.message);
    }
    setBusy(false);
    api.log('Submitted payment for verification', `${user.name} — ${money(total, cur)} via ${methodLabel(f.method)} (${request.reference})`);
    onDone({ kind: 'manual', request });
  };

  const account = f.method === 'mtn'
    ? [['MTN MoMo number', m.mtnNumber], ['Account name', m.mtnName], ['Dial', `${OPERATORS.mtn.ussd} → Transfer money`]]
    : f.method === 'orange'
      ? [['Orange Money number', m.orangeNumber], ['Account name', m.orangeName], ['Dial', `${OPERATORS.orange.ussd} → Transfer money`]]
      : [['Bank', m.bankName], ['Account number', m.bankAccount], ['Account name', m.bankAccountName]];

  return (
    <div className="space-y-4">
      <Field label="Paid by"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={[{ value: 'mtn', label: 'MTN Mobile Money' }, { value: 'orange', label: 'Orange Money' }, { value: 'bank', label: 'Bank transfer / deposit' }]} /></Field>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">{f.method === 'bank' ? <Landmark className="size-3.5" /> : <Building2 className="size-3.5" />}Pay the school here</p>
        <dl className="space-y-1">
          {account.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-semibold text-slate-800">{v}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs text-slate-500">Use the pupil’s name as the reason/description if asked.</p>
      </div>
      <Field label={f.method === 'bank' ? 'Bank reference / slip number *' : 'Transaction ID (from the SMS) *'}><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={f.method === 'bank' ? 'e.g. AFB123456' : 'e.g. MP261027.1432.B77120'} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date paid"><Input type="date" max={today()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></Field>
        <Field label="Paid from number"><Input value={f.payerPhone} onChange={(e) => setF({ ...f, payerPhone: e.target.value })} /></Field>
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
        <FileUp className="size-4" /> {f.proofName || 'Attach SMS screenshot or bank slip (optional)'}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onProof} />
      </label>
      <Textarea rows={2} placeholder="Note for the bursar (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      {error && <p className="flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      <Button className="w-full py-3" disabled={!total || busy} onClick={submit}>{busy ? 'Sending…' : `Submit ${money(total, cur)} for verification`}</Button>
      <p className="text-center text-xs text-slate-500">The bursar checks the transaction and your official receipt appears under Payments & Receipts.</p>
    </div>
  );
}

function Done({ result, onAgain }) {
  const { db } = useStore();
  const cur = db.school.currency;
  const online = result.kind === 'online';
  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-8 text-center">
        <div className={`mx-auto grid size-16 place-items-center rounded-full ${online ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}><CheckCircle2 className="size-9" /></div>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">{online ? 'Payment successful' : 'Payment submitted'}</h1>
        <p className="mt-1 text-slate-600">
          {online
            ? <>{money(result.total, cur)} paid with {OPERATORS[result.operator].label}. Transaction <span className="font-mono">{result.transactionId}</span>.</>
            : <>{money(result.request.amount, cur)} is awaiting verification by the bursar (reference {result.request.ref}). Your receipt will appear once it’s confirmed.</>}
        </p>
        {online && (
          <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 text-left">
            {result.payments.map((p) => {
              const k = db.students.find((s) => s.id === p.studentId);
              const live = db.payments.find((x) => x.id === p.id) || p;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div><p className="font-semibold text-slate-800">{k?.firstName} {k?.lastName} · {money(p.amount, '')}</p><p className="text-xs text-slate-500">{p.receiptNo} · {fmtDate(p.date)}</p></div>
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadReceipt({ ...db, payments: db.payments.some((x) => x.id === p.id) ? db.payments : [...db.payments, live] }, live)}>Receipt</Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/portal"><Button variant="secondary">Back to dashboard</Button></Link>
          <Link to="/portal/payments"><Button variant="secondary">Payments & receipts</Button></Link>
          <Button onClick={onAgain}>Make another payment</Button>
        </div>
        {!online && <p className="mt-4"><Badge tone="amber">Awaiting verification</Badge></p>}
      </div>
    </div>
  );
}
