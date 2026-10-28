import { useState } from 'react';
import { AtSign, KeyRound } from 'lucide-react';
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
