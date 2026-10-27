import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { ROLES, fmtDateTime } from '../lib/utils';
import { Button, Card, Field, Info, Input, PageHeader, useToast } from '../components/ui';

export default function Account() {
  const { user, api } = useStore();
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
  return (
    <>
      {toast}
      <PageHeader title="My Account" />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card title="Profile">
          <dl className="grid gap-4">
            <Info label="Name">{user.name}</Info>
            <Info label="Username">@{user.username}</Info>
            <Info label="Role">{ROLES[user.role]}</Info>
            <Info label="Last sign-in">{fmtDateTime(user.lastLogin)}</Info>
          </dl>
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
