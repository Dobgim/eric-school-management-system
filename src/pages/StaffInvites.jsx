import { useState } from 'react';
import { Ban, Copy, MessageCircle, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { ROLES, fmtDate, fmtDateTime } from '../lib/utils';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Modal, Select, useToast } from '../components/ui';

const STAFF_ROLES = ['teacher', 'admin', 'bursar', 'staff'];
const show = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const inviteLink = (code) => `${window.location.origin}/signup?invite=${show(code)}`;
const status = (i) => (i.usedBy ? ['green', `Used by ${i.usedByName || 'someone'}`] : i.revoked ? ['slate', 'Cancelled'] : i.expiresAt < new Date().toISOString() ? ['red', 'Expired'] : ['amber', 'Waiting']);

/** Staff can only create an account with an invitation made here (super admin). */
export default function StaffInvites() {
  const { db, api } = useStore();
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast();
  const rows = [...db.invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const freeStaff = db.staff.filter((s) => s.status === 'active' && !db.users.some((u) => u.staffId === s.id && u.status === 'active'));

  const create = async () => {
    setBusy(true);
    try {
      const { invite } = await api.request('/api/invites', { method: 'POST', body: form });
      await api.reload();
      setForm(null);
      setCreated(invite);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };
  const revoke = async (i) => {
    try { await api.request(`/api/invites/${i.id}/revoke`, { method: 'POST' }); await api.reload(); notify('Invitation cancelled.'); } catch (e) { notify(e.message); }
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); notify('Copied.'); } catch { notify(text); } };
  const message = (i) => `Hello${i.name ? ` ${i.name}` : ''}, you are invited to join ${db.school.name} on the school app as ${ROLES[i.role]}. Open ${inviteLink(i.code)} or use invitation code ${show(i.code)} (valid until ${fmtDate(i.expiresAt)}).`;

  return (
    <Card bodyClass="" title="Staff invitations" actions={<Button size="sm" icon={Plus} onClick={() => setForm({ role: 'teacher', name: '', position: '', staffId: '', days: 7 })}>Invite staff member</Button>}>
      {toast}
      <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">Staff can only create an account with an invitation code. The invitation sets their role, so nobody can sign up as staff on their own. Each code works once.</p>
      <DataTable
        rows={rows}
        empty={<Empty title="No invitations yet" message="Invite teachers, the secretary, the bursar or other staff — they get a code to create their own login." />}
        columns={[
          { key: 'code', label: 'Code', render: (i) => <span className="font-mono font-bold tracking-wider text-slate-900">{show(i.code)}</span> },
          { key: 'who', label: 'For', render: (i) => <div><p>{i.name || <span className="text-slate-400">Anyone with the code</span>}</p><p className="text-xs text-slate-500">{ROLES[i.role]}{i.position ? ` · ${i.position}` : ''}</p></div> },
          { key: 'expires', label: 'Valid until', render: (i) => fmtDate(i.expiresAt) },
          { key: 'status', label: 'Status', render: (i) => <div><Badge tone={status(i)[0]}>{status(i)[1]}</Badge>{i.usedAt && <p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(i.usedAt)}</p>}</div> },
          { key: 'a', label: '', align: 'right', render: (i) => status(i)[1] === 'Waiting' && (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(message(i))}>Copy</Button>
              <a href={`https://wa.me/?text=${encodeURIComponent(message(i))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><MessageCircle className="size-3.5" />WhatsApp</a>
              <Button size="sm" variant="ghost" icon={Ban} onClick={() => revoke(i)}>Cancel</Button>
            </div>
          ) },
        ]}
      />

      <Modal open={!!form} onClose={() => setForm(null)} title="Invite a staff member" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create invitation'}</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role (what they can access)"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={STAFF_ROLES.map((r) => ({ value: r, label: ROLES[r] }))} /></Field>
            <Field label="Valid for"><Select value={String(form.days)} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} options={[1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: `${d} day${d > 1 ? 's' : ''}` }))} /></Field>
            <Field label="Person’s name (optional)"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pre-fills their sign-up form" /></Field>
            <Field label="Job title (optional)"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. Class 4 Teacher" /></Field>
            <Field label="Existing staff record (optional)" className="sm:col-span-2" hint="Link to a record already under Staff. Leave empty and one is created when they join.">
              <Select value={form.staffId} onChange={(e) => { const s = freeStaff.find((x) => x.id === e.target.value); setForm({ ...form, staffId: e.target.value, name: form.name || (s ? `${s.firstName} ${s.lastName}` : ''), position: form.position || s?.position || '' }); }} placeholder="— Create a new staff record when they join —" options={freeStaff.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} · ${s.position}` }))} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} size="sm" title="Invitation ready" footer={<Button onClick={() => setCreated(null)}>Done</Button>}>
        {created && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">Send this to {created.name || 'the staff member'}. It works once, until {fmtDate(created.expiresAt)}.</p>
            <p className="rounded-xl bg-slate-50 py-4 font-mono text-3xl font-extrabold tracking-[0.2em] text-brand-900">{show(created.code)}</p>
            <p className="text-xs break-all text-slate-500">{inviteLink(created.code)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" icon={Copy} onClick={() => copy(message(created))}>Copy message</Button>
              <a href={`https://wa.me/?text=${encodeURIComponent(message(created))}`} target="_blank" rel="noreferrer"><Button variant="success" icon={MessageCircle}>Send by WhatsApp</Button></a>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
