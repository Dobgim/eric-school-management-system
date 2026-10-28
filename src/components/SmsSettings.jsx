import { useEffect, useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { Badge, Button, Card, Field, Input, Select } from './ui';

const KINDS = [
  ['absence', 'A child is marked absent'],
  ['personal', 'Personal messages to a parent'],
  ['payment', 'Payment received (receipt)'],
  ['announcement', 'General announcements (when “also by SMS” is ticked)'],
];

/** SMS provider for parents with basic phones (super admin). Keys are sent once and stored encrypted. */
export default function SmsSettings() {
  const { db, api, user } = useStore();
  const opts = db.settings.sms || { enabled: false, onlyWithoutApp: true, for: { absence: true, personal: true, payment: true, announcement: false } };
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ provider: 'custom', sender: '', url: '', username: '', apiKey: '', accountSid: '', authToken: '' });
  const [choices, setChoices] = useState({ onlyWithoutApp: opts.onlyWithoutApp !== false, for: { ...opts.for } });
  const [testTo, setTestTo] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.request('/api/sms/config').then(setInfo).catch(() => {});
  useEffect(() => { if (user.role === 'superadmin') load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (user.role !== 'superadmin') return null;

  const call = async (path, body, ok) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.request(path, { method: 'POST', body });
      setMsg({ ok });
      await load();
      await api.reload();
    } catch (e) { setMsg({ error: e.message }); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card title="SMS for parents" actions={<Badge tone={opts.enabled ? 'green' : 'slate'}>{opts.enabled ? `On · ${info?.provider || ''}` : 'Off'}</Badge>}>
      <p className="text-sm text-slate-600">For parents with basic phones, or who haven’t turned on notifications in the app. Each SMS is charged by your provider.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Provider"><Select value={form.provider} onChange={set('provider')} options={[{ value: 'custom', label: 'Local bulk-SMS provider (web link)' }, { value: 'africastalking', label: 'Africa’s Talking' }, { value: 'twilio', label: 'Twilio' }]} /></Field>
        <Field label="Sender name" hint="Up to 11 letters, as approved by your provider."><Input value={form.sender} onChange={set('sender')} placeholder={info?.sender || 'MYSCHOOL'} maxLength={11} /></Field>
        {form.provider === 'custom' && (
          <Field label="Web link to send one SMS" className="sm:col-span-2" hint="From your provider’s documentation. Put {to} (or {to_local} for 6XXXXXXXX) and {message} where they go, and {sender} if needed.">
            <Input value={form.url} onChange={set('url')} placeholder={info?.url || 'https://api.provider.cm/send?user=…&password=…&to={to}&sender={sender}&text={message}'} />
          </Field>
        )}
        {form.provider === 'africastalking' && <>
          <Field label="Username"><Input value={form.username} onChange={set('username')} placeholder={info?.username || 'Your app username (or sandbox)'} /></Field>
          <Field label="API key"><Input type="password" value={form.apiKey} onChange={set('apiKey')} autoComplete="new-password" /></Field>
        </>}
        {form.provider === 'twilio' && <>
          <Field label="Account SID"><Input value={form.accountSid} onChange={set('accountSid')} placeholder={info?.accountSid || 'AC…'} /></Field>
          <Field label="Auth token"><Input type="password" value={form.authToken} onChange={set('authToken')} autoComplete="new-password" /></Field>
        </>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={MessageSquare} disabled={busy} onClick={() => call('/api/sms/config', { ...form, ...choices }, 'SMS provider saved. The keys are stored encrypted.')}>Save provider</Button>
        {info?.configured && <Button variant="ghost" icon={Trash2} disabled={busy} onClick={() => call('/api/sms/config', { remove: true }, 'SMS turned off and provider removed.')}>Remove</Button>}
      </div>

      {info?.configured && (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-800">Send an SMS when…</p>
          {KINDS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-brand-700" checked={!!choices.for[k]} onChange={(e) => setChoices({ ...choices, for: { ...choices.for, [k]: e.target.checked } })} />{label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-brand-700" checked={choices.onlyWithoutApp} onChange={(e) => setChoices({ ...choices, onlyWithoutApp: e.target.checked })} />
            Only to parents who haven’t turned on app notifications (saves money)
          </label>
          <Button variant="secondary" disabled={busy} onClick={() => call('/api/sms/config', { ...choices }, 'SMS choices saved.')}>Save choices</Button>
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <Field label="Send a test SMS to"><Input className="w-44" inputMode="tel" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="6XX XXX XXX" /></Field>
            <Button variant="secondary" icon={Send} disabled={busy || !testTo} onClick={() => call('/api/sms/test', { phone: testTo }, `Test SMS sent to ${testTo}.`)}>Send test</Button>
          </div>
        </div>
      )}
      {msg?.ok && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>}
      {msg?.error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg.error}</p>}
    </Card>
  );
}
