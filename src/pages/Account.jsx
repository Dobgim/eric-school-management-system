import { useEffect, useState } from 'react';
import { AtSign, BellRing, KeyRound } from 'lucide-react';
import { enablePush, pushState } from '../lib/push';
import { useStore } from '../lib/store';
import { ROLES, fmtDateTime } from '../lib/utils';
import { Button, Card, Field, Info, Input, PageHeader, useToast } from '../components/ui';

export default function Account() {
  const { user, api, enter } = useStore();
  const [email, setEmail] = useState(user.email || '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast();
  const save = async (e) => {
    e.preventDefault();
    if (f.next.length < 6) return notify('New password must be at least 6 characters.');
    if (f.next !== f.confirm) return notify('The new passwords do not match.');
    setBusy(true);
    try {
      await api.request('/api/auth/password', { method: 'POST', body: { current: f.current, next: f.next } });
      api.log('Changed own password');
      setF({ current: '', next: '', confirm: '' });
      notify('Password changed.');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };
  const saveEmail = async (e) => {
    e.preventDefault();
    setSavingEmail(true);
    try {
      const res = await api.request('/api/auth/email', { method: 'POST', body: { email } });
      await enter({ ...user, email: res.email });
      notify(res.email ? `You can now sign in with ${res.email}.` : 'Email removed.');
    } catch (err) {
      notify(err.message);
    } finally {
      setSavingEmail(false);
    }
  };
  return (
    <>
      {toast}
      <PageHeader title="My Account" />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card title="Profile">
          <dl className="grid gap-4">
            <Info label="Name">{user.name}</Info>
            <Info label={user.role === 'parent' ? 'Sign-in name' : 'Username'}>{user.role === 'parent' ? user.username : `@${user.username}`}</Info>
            <Info label="Role">{ROLES[user.role]}</Info>
            <Info label="Last sign-in">{fmtDateTime(user.lastLogin)}</Info>
          </dl>
          <form onSubmit={saveEmail} className="mt-6 space-y-3 border-t border-slate-100 pt-5">
            <Field label="Email address" hint={`Optional. You can sign in with it instead of ${user.role === 'parent' ? 'your phone number' : 'your username'}.`}>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </Field>
            <Button type="submit" variant="secondary" icon={AtSign} disabled={savingEmail || email.trim().toLowerCase() === (user.email || '')}>{savingEmail ? 'Saving…' : 'Save email'}</Button>
          </form>
        </Card>
        <PhoneNotifications />
        <Card title="Change password">
          <form onSubmit={save} className="space-y-4">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></Field>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
            <Button type="submit" icon={KeyRound} disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

/** Turn phone notifications on for this device, and check they arrive. */
function PhoneNotifications() {
  const { api } = useStore();
  const [state, setState] = useState('loading');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  const test = async () => {
    setBusy(true);
    setMsg('');
    try {
      let s = state;
      if (s !== 'on') { s = await enablePush(); setState(s); }
      if (s !== 'on') return setMsg(s === 'denied' ? 'Notifications are blocked. Allow them in the browser’s site settings, then try again.' : 'Notifications were not allowed.');
      const r = await api.request('/api/push/test', { method: 'POST' });
      setMsg(r.sent ? `Sent. You should see “Notifications are working” now (${r.sent} device${r.sent > 1 ? 's' : ''}).` : `Could not deliver to this device${r.errors?.length ? `: ${r.errors[0]}` : ''}. Try turning it on again.`);
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const label = { on: 'On for this device', off: 'Off on this device', denied: 'Blocked in browser settings', 'ios-install': 'iPhone: add the app to the Home Screen first', unsupported: 'Not supported by this browser', loading: '…' }[state];
  return (
    <Card title="Phone notifications">
      <p className="text-sm text-slate-600">School announcements, payment receipts and personal messages arrive on this device even when the app is closed.</p>
      <p className="mt-3 text-sm"><span className="text-slate-500">Status: </span><b className={state === 'on' ? 'text-emerald-700' : 'text-slate-800'}>{label}</b></p>
      {state === 'ios-install' && <p className="mt-2 text-sm text-slate-600">In Safari, tap Share → <b>Add to Home Screen</b>, open the app from the new icon, and come back here.</p>}
      {['on', 'off'].includes(state) && <Button className="mt-4" icon={BellRing} disabled={busy} onClick={test}>{busy ? 'Sending…' : state === 'on' ? 'Send a test notification' : 'Turn on and test'}</Button>}
      {msg && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</p>}
    </Card>
  );
}
