import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { money } from '../lib/utils';
import { Badge, Button, Card, Field, Input, Select } from './ui';

const MODE = { demo: ['amber', 'Demo: no money moves'], sandbox: ['blue', 'Fapshi sandbox (test)'], live: ['green', 'Fapshi live'] };

/**
 * The school's Fapshi account, used for "Pay now" phone prompts. The keys are sent once to the server, which
 * stores them encrypted and never shows them again; parents only ever enter an amount.
 */
export default function PaymentAccount() {
  const { api, user } = useStore();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ apiUser: '', apiKey: '', mode: 'live' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = () => api.request('/api/payments/config').then(setInfo).catch((e) => setMsg({ error: e.message }));
  useEffect(() => { if (user.role === 'superadmin') load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (user.role !== 'superadmin') return null;

  const save = async (body) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.request('/api/payments/config', { method: 'POST', body });
      setForm({ apiUser: '', apiKey: '', mode: form.mode });
      setMsg({ ok: body.remove ? 'Keys removed. Payments are back in demo mode.' : `Connected. Parents will see “${r.account?.service || 'your Fapshi service'}” on their phone.` });
      api.log(body.remove ? 'Removed Fapshi payment keys' : 'Connected Fapshi payment account');
      await load();
    } catch (e) {
      setMsg({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const [tone, label] = MODE[info?.mode] || MODE.demo;
  return (
    <Card title="Mobile Money collection (Fapshi)" actions={info && <Badge tone={tone}>{label}</Badge>}>
      <p className="text-sm text-slate-600">
        When a parent taps <b>Pay now</b>, Fapshi sends an MTN MoMo or Orange Money approval request to their phone, and the money goes to the school’s Fapshi account. Parents only enter the amount.
      </p>
      {info?.account?.service && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-4" />Connected: {info.account.service}</p>
          <p className="mt-0.5 text-xs">This is the name parents see on their phone. Balance: {money(info.account.balance, info.account.currency)}. API user {info.apiUser}.</p>
        </div>
      )}
      {info?.account?.error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">The saved keys don’t work any more: {info.account.error}</p>}
      {info?.source === 'env' ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">The keys are set on the server (FAPSHI_API_USER / FAPSHI_API_KEY). Change them in your hosting settings.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="API user"><Input value={form.apiUser} onChange={(e) => setForm({ ...form, apiUser: e.target.value })} autoComplete="off" placeholder={info?.apiUser || 'From Fapshi dashboard → API keys'} /></Field>
          <Field label="API key"><Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} autoComplete="new-password" placeholder="FAK_…" /></Field>
          <Field label="Account"><Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} options={[{ value: 'live', label: 'Live (real money)' }, { value: 'sandbox', label: 'Sandbox (testing)' }]} /></Field>
          <div className="flex items-end gap-2">
            <Button icon={KeyRound} disabled={busy || !form.apiUser || !form.apiKey} onClick={() => save(form)}>{busy ? 'Checking…' : 'Save keys'}</Button>
            {info?.source === 'settings' && <Button variant="ghost" icon={Trash2} disabled={busy} onClick={() => save({ remove: true })}>Remove</Button>}
          </div>
        </div>
      )}
      {msg?.ok && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>}
      {msg?.error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg.error}</p>}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-500">
        <li>The keys are checked with Fapshi, stored encrypted on the server, and never shown again.</li>
        <li>In your Fapshi dashboard, set the webhook URL to <code className="break-all text-slate-700">{info?.webhook || '…/api/payments/fapshi/webhook'}</code> so payments are confirmed even if the parent closes the app.</li>
        <li>Ask Fapshi to enable <b>direct pay</b> on your live service; without it the phone request can’t be sent.</li>
      </ul>
    </Card>
  );
}
