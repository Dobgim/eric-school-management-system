import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, Download, FileUp, Info as InfoIcon, Landmark, Loader2, Smartphone, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentSession, dueForScope, pendingFor, scopeLabel, scopeStatus, sessionTerms, termById } from '../lib/finance';
import { downloadReceipt } from '../lib/documents';
import { OPERATORS, detectOperator, normalizePhone } from '../lib/momo';
import { fmtDate, fullName, methodLabel, money, readFileAsDataURL, sum, today, uid } from '../lib/utils';
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import { myChildren } from './Portal';

export default function PayFees() {
  const { db, user } = useStore();
  const [params] = useSearchParams();
  const cur = db.school.currency;
  const kids = myChildren(db, user).filter((k) => k.status === 'active');
  const guardian = db.guardians.find((g) => g.id === user.guardianId);
  const terms = sessionTerms(db);
  const [scope, setScope] = useState(db.settings.currentTermId || terms[0]?.id || 'year');

  const rows = useMemo(() => kids.map((k) => ({
    k, st: scopeStatus(db, k, scope), pending: pendingFor(db, k.id), due: dueForScope(db, k, scope),
  })), [db, scope, kids.map((k) => k.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const preselect = params.get('child');
  // Prefill what is left for the chosen term (only the chosen child when arriving from "Pay" on a card).
  const defaults = () => Object.fromEntries(rows.map((r) => [r.k.id, (!preselect || preselect === r.k.id) && r.due > 0 ? String(r.due) : '']));
  const [amounts, setAmounts] = useState(defaults);
  const [mode, setMode] = useState('prompt');
  const [done, setDone] = useState(null);
  // Opening Pay Fees again (e.g. from the sidebar), or choosing another term, starts again with current balances.
  const location = useLocation();
  useEffect(() => {
    setDone(null);
    setAmounts(defaults());
  }, [location.key, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = rows.map((r) => ({ studentId: r.k.id, amount: Math.round(Number(amounts[r.k.id]) || 0) })).filter((i) => i.amount > 0);
  const total = sum(items, (i) => i.amount);
  const tooMuch = rows.find((r) => Math.round(Number(amounts[r.k.id]) || 0) > r.due);
  // What is left for each choice, across all the parent's children.
  const leftFor = (sc) => sum(kids, (k) => dueForScope(db, k, sc));
  const termOptions = terms.map((t) => ({ id: t.id, label: t.name, current: t.id === db.settings.currentTermId, left: leftFor(t.id) }));
  const fullLeft = leftFor('year');

  if (!kids.length) return <><PageHeader title="Pay School Fees" /><Card><Empty title="No children currently enrolled" /></Card></>;
  if (done) return <Done result={done} onAgain={() => { setDone(null); setAmounts(defaults()); }} />;

  return (
    <>
      <PageHeader title="Pay School Fees" subtitle="Pay the full fees at once or one term at a time, then approve the payment on your phone." />
      <Card title="1. What are you paying for?" className="mb-6">
        <div role="radiogroup" aria-label="What are you paying for?" className="space-y-2">
          {/* Paying everything at once: the whole year's fees for every child in one payment. */}
          <button type="button" role="radio" aria-checked={scope === 'year'} onClick={() => setScope('year')}
            className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border-2 px-4 py-3 text-left ${scope === 'year' ? 'border-accent-500 bg-accent-400/15' : 'border-accent-400/60 bg-accent-400/5 hover:border-accent-500'}`}>
            <span>
              <span className="block font-semibold text-slate-900">Pay full fees at once</span>
              <span className="block text-xs text-slate-600">All {terms.length} terms of {currentSession(db)?.name || 'this school year'} in one payment</span>
            </span>
            <span className={`text-right text-sm font-bold tabular-nums ${fullLeft ? 'text-slate-900' : 'text-emerald-700'}`}>{fullLeft ? money(fullLeft, cur) : 'All paid'}</span>
          </button>
          <p className="pt-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Or pay one term</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {termOptions.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={scope === o.id} onClick={() => setScope(o.id)}
                className={`flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2.5 text-left ${scope === o.id ? 'border-brand-700 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                  {o.current && <span className="block text-xs text-slate-500">Current term</span>}
                </span>
                <span className={`text-xs font-semibold tabular-nums ${o.left ? 'text-slate-700' : 'text-emerald-700'}`}>{o.left ? money(o.left, cur) : 'Paid'}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card title={`2. How much are you paying for ${scopeLabel(db, scope)}?`} bodyClass="">
          <ul className="divide-y divide-slate-100">
            {rows.map(({ k, st, pending, due }) => (
              <li key={k.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <Avatar name={`${k.firstName} ${k.lastName}`} src={k.photo} size="sm" />
                <div className="min-w-48 flex-1">
                  <p className="font-semibold text-slate-800">{fullName(k)}</p>
                  <p className="text-xs text-slate-500">{db.classes.find((c) => c.id === k.classId)?.name} · fees {money(st.billed, cur)} · paid {money(st.paid, cur)}</p>
                  <p className={`text-xs font-semibold ${due ? 'text-rose-700' : 'text-emerald-700'}`}>{due ? `Left to pay: ${money(due, cur)}` : st.billed ? 'Fully paid' : 'Fees not set for this term yet'}</p>
                  {pending > 0 && <p className="text-xs text-amber-700">{money(pending, cur)} awaiting verification</p>}
                </div>
                <div className="w-44">
                  <div className="relative">
                    <input
                      className="input pr-12 text-right font-semibold tabular-nums"
                      type="number" min="0" step="500" max={due} placeholder="0" disabled={!due}
                      value={amounts[k.id] ?? ''}
                      onChange={(e) => setAmounts({ ...amounts, [k.id]: e.target.value })}
                      aria-label={`Amount for ${k.firstName}`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{cur}</span>
                  </div>
                  {due > 0 && String(due) !== amounts[k.id] && <button type="button" className="mt-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setAmounts({ ...amounts, [k.id]: String(due) })}>Pay all {money(due, '')}</button>}
                </div>
              </li>
            ))}
          </ul>
          {tooMuch && <p className="mx-5 mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{tooMuch.k.firstName} only owes {money(tooMuch.due, cur)} for {scopeLabel(db, scope)}.</p>}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-4">
            <span className="font-semibold text-slate-600">Total to pay</span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{money(total, cur)}</span>
          </div>
        </Card>

        <Card title="3. Pay" className="h-fit xl:sticky xl:top-20">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button type="button" onClick={() => setMode('prompt')} className={`rounded-lg px-2 py-2 ${mode === 'prompt' ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>Pay now (MoMo)</button>
            <button type="button" onClick={() => setMode('manual')} className={`rounded-lg px-2 py-2 ${mode === 'manual' ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'}`}>I’ve already paid</button>
          </div>
          {mode === 'prompt'
            ? <PromptPay items={items} total={total} scope={scope} blocked={!!tooMuch} defaultPhone={guardian?.phone || ''} onDone={setDone} />
            : <ManualPay items={items} total={total} scope={scope} blocked={!!tooMuch} defaultPhone={guardian?.phone || ''} onDone={setDone} />}
        </Card>
      </div>
    </>
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function PromptPay({ items, total, scope, blocked, defaultPhone, onDone }) {
  const { db, api, offline } = useStore();
  const cur = db.school.currency;
  const [phone, setPhone] = useState(normalizePhone(defaultPhone));
  const [state, setState] = useState('idle'); // idle | sending | prompted | failed
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const operator = detectOperator(phone);

  const pay = async () => {
    setError('');
    if (!total) return setError('Enter an amount for at least one child.');
    if (!operator) return setError('Enter a valid MTN or Orange Mobile Money number (9 digits, e.g. 677 12 34 56).');
    setState('sending');
    try {
      // The server asks Fapshi to send the approval request to this phone; then we wait for the answer.
      const start = await api.request('/api/payments/online', { method: 'POST', body: { items, scope, phone: normalizePhone(phone) } });
      setDemo(start.demo);
      setState('prompted');
      for (let i = 0; i < 200; i++) {
        await sleep(i < 5 ? 2000 : 3000);
        let r;
        try { r = await api.request(`/api/payments/online/${start.id}`); } catch (e) { if (e.status) throw e; continue; } // keep waiting through a network blip
        if (r.status === 'pending') continue;
        if (r.status === 'failed') throw new Error(r.reason || 'The payment was not completed.');
        await api.reload();
        return onDone({ kind: 'online', paymentIds: r.paymentIds, transactionId: r.reference, total: start.total, operator, scope });
      }
      throw new Error('No answer from the phone yet. If you approved it, the receipt will appear under Payments & Receipts.');
    } catch (e) {
      setState('failed');
      setError(e.message);
    }
  };

  if (state === 'sending' || state === 'prompted') {
    return (
      <div className="py-6 text-center" role="status">
        <Loader2 className="mx-auto size-10 animate-spin text-brand-600" />
        <p className="mt-4 font-bold text-slate-900">{state === 'sending' ? 'Sending the request to your phone…' : 'Check your phone'}</p>
        {state === 'prompted' && (
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">
            A request to pay <b>{money(total, cur)}</b> to <b>{db.school.name}</b> was sent to <b>{phone}</b>. Enter your {OPERATORS[operator].short} PIN to approve it.
            {operator === 'orange' ? ' If no prompt appears, dial #150*50#.' : ' If no prompt appears, dial *126#.'}
          </p>
        )}
        {demo && state === 'prompted' && <p className="mx-auto mt-3 max-w-xs rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo mode: no request is really sent. It is approved automatically in a few seconds.</p>}
        <p className="mt-4 text-xs text-slate-400">Keep this page open until it is confirmed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Mobile Money number" hint="MTN MoMo or Orange Money. The approval request is sent to this phone.">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">+237</span>
          <Input className="pr-20 pl-14 tabular-nums" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="677123456" />
          {operator && <span className={`absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] font-bold ${OPERATORS[operator].color}`}>{OPERATORS[operator].short}</span>}
        </div>
      </Field>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        You pay <b className="text-slate-900">{db.school.name}</b> directly. You don’t need the school’s account number: just approve the request on your phone.
      </p>
      {error && <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      {offline && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Paying by phone prompt needs internet. You’re offline: if you already paid with *126# / #150#, use <b>“I’ve already paid”</b>. It will be sent when you’re back online.</p>}
      <Button className="w-full py-3" icon={Smartphone} disabled={!total || offline || blocked} onClick={pay}>{state === 'failed' ? 'Try again' : `Pay ${money(total, cur)}`}</Button>
      <p className="text-center text-xs text-slate-500">You get an official receipt as soon as the payment is approved.</p>
    </div>
  );
}

function ManualPay({ items, total, scope, blocked, defaultPhone, onDone }) {
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
    // The server numbers the request; offline, it is kept on the phone and sent when the connection returns.
    const request = {
      id: uid('rq'), channel: 'manual', status: 'pending', method: f.method,
      guardianId: user.guardianId, userId: user.id, payerPhone: f.payerPhone, reference: f.reference.trim(), paidOn: f.paidOn,
      proof: f.proof, proofName: f.proofName, note: f.note, items, amount: total, scope, scopeLabel: scopeLabel(db, scope), createdAt: new Date().toISOString(),
    };
    let result;
    try {
      result = await api.submit('/api/ops', { ops: [{ t: 'put', c: 'paymentRequests', v: request }] }, `${money(total, cur)} paid by ${methodLabel(f.method)} (${request.reference})`);
      if (result.sent) await api.reload();
    } catch (e) {
      setBusy(false);
      return setError(e.message);
    }
    setBusy(false);
    if (result.sent) api.log('Submitted payment for verification', `${user.name} — ${money(total, cur)} via ${methodLabel(f.method)} (${request.reference})`);
    onDone({ kind: 'manual', request, queued: !!result.queued });
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
      <Button className="w-full py-3" disabled={!total || busy || blocked} onClick={submit}>{busy ? 'Sending…' : `Submit ${money(total, cur)} for verification`}</Button>
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
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{online ? 'Payment successful' : result.queued ? 'Saved on your phone' : 'Payment submitted'}</h1>
        <p className="mt-1 text-slate-600">
          {online
            ? <>{money(result.total, cur)} paid to {db.school.name} with {OPERATORS[result.operator].label} for {scopeLabel(db, result.scope)}. Transaction <span className="font-mono">{result.transactionId}</span>.</>
            : result.queued
              ? <>You’re offline, so the {money(result.request.amount, cur)} payment (transaction {result.request.reference}) is kept on this phone. It will be sent to the school automatically as soon as you’re back online.</>
              : <>{money(result.request.amount, cur)} is awaiting verification by the bursar (reference {db.paymentRequests.find((r) => r.id === result.request.id)?.ref || result.request.reference}). Your receipt will appear once it’s confirmed.</>}
        </p>
        {online && (
          <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 text-left">
            {db.payments.filter((p) => (result.paymentIds || []).includes(p.id)).sort((a, b) => (termById(db, a.termId)?.start || '').localeCompare(termById(db, b.termId)?.start || '')).map((p) => {
              const k = db.students.find((s) => s.id === p.studentId);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div><p className="font-semibold text-slate-800">{k?.firstName} {k?.lastName} · {money(p.amount, '')}</p><p className="text-xs text-slate-500">{p.receiptNo} · {termById(db, p.termId)?.label} · {fmtDate(p.date)}</p></div>
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadReceipt(db, p)}>Receipt</Button>
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
        {!online && <p className="mt-4"><Badge tone="amber">{result.queued ? 'Waiting for internet' : 'Awaiting verification'}</Badge></p>}
      </div>
    </div>
  );
}
