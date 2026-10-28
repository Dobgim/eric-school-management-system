import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { ROLES, fmtDateTime, uid } from '../lib/utils';
import StaffInvites from './StaffInvites';
import { Avatar, Badge, Button, Card, DataTable, ExportButtons, Field, Input, Modal, PageHeader, SearchInput, Select, Tabs, useToast } from '../components/ui';

const ROLE_TONE = { superadmin: 'red', admin: 'blue', bursar: 'amber', teacher: 'green', parent: 'purple' };
const ACCESS = {
  superadmin: 'Everything: all modules, finance, payroll, reports, users and settings.',
  admin: 'Admissions, students, parents, classes, promotion, term results, staff records, announcements, academic reports.',
  bursar: 'Fee collection & structure, debtors, payroll, uniforms & materials, financial and academic reports.',
  teacher: 'Own class list, pupil profiles, term results and promotion recommendations.',
  parent: 'Own children only: profile, class, fees, receipts, purchases, announcements and calendar.',
};

export default function Users() {
  const [tab, setTab] = useState('users');
  return (
    <>
      <PageHeader title="Users & Activity" subtitle="Role-based accounts and an audit trail of everything done in the system." />
      <Tabs tabs={[{ id: 'users', label: 'User accounts', icon: ShieldCheck }, { id: 'invites', label: 'Staff invitations', icon: UserPlus }, { id: 'log', label: 'Activity log' }, { id: 'roles', label: 'Roles & access' }]} value={tab} onChange={setTab} />
      {tab === 'users' && <UserList />}
      {tab === 'invites' && <StaffInvites />}
      {tab === 'log' && <ActivityLog />}
      {tab === 'roles' && (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(ROLES).map(([k, v]) => <Card key={k} title={v} actions={<Badge tone={ROLE_TONE[k]}>{k}</Badge>}><p className="text-sm text-slate-600">{ACCESS[k]}</p></Card>)}
        </div>
      )}
    </>
  );
}

function UserList() {
  const { db, api, user: me } = useStore();
  const [form, setForm] = useState(null);
  const [toast, notify] = useToast();
  const [role, setRole] = useState('');
  const rows = db.users.filter((u) => !role || u.role === role).sort((a, b) => Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role) || a.name.localeCompare(b.name));

  const save = async () => {
    const f = form;
    if (!f.name.trim() || !f.username.trim()) return notify('Name and username are required.');
    if (db.users.some((u) => u.id !== f.id && u.username.toLowerCase() === f.username.trim().toLowerCase())) return notify('That username is taken.');
    if (!f.id && (f.password || '').length < 6) return notify('Password must be at least 6 characters.');
    if (f.id === me.id && (f.role !== 'superadmin' || !f.active)) return notify('You cannot demote or deactivate your own account.');
    const patch = { name: f.name.trim(), username: f.username.trim(), role: f.role, active: f.active, staffId: f.staffId || null, guardianId: f.guardianId || null, email: (f.email || '').trim() };
    // Sent straight to the server, which hashes the password; it is never kept in the browser.
    try {
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'users', v: { ...patch, id: f.id || uid('u'), ...(f.password ? { password: f.password } : {}) } }] } });
      await api.reload();
    } catch (e) { return notify(e.message); }
    api.log(f.id ? 'Updated user' : 'Created user', `${patch.username} (${ROLES[patch.role]})`);
    notify(f.password ? `Saved. Login: ${patch.username} / ${f.password}` : 'User saved.');
    setForm(null);
  };

  return (
    <Card bodyClass="">
      {toast}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Select value={role} onChange={(e) => setRole(e.target.value)} placeholder="All roles" options={Object.entries(ROLES).map(([value, label]) => ({ value, label }))} className="sm:w-60" />
        <Button className="ml-auto" size="sm" icon={UserPlus} onClick={() => setForm({ name: '', username: '', email: '', role: 'teacher', active: true, password: '', staffId: '', guardianId: '' })}>New user</Button>
      </div>
      <DataTable
        rows={rows}
        columns={[
          { key: 'name', label: 'User', render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div><p className="font-semibold text-slate-800">{u.name}</p><p className="font-mono text-xs text-slate-500">@{u.username}</p></div></div> },
          { key: 'role', label: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]}>{ROLES[u.role]}</Badge> },
          { key: 'link', label: 'Linked to', render: (u) => { const s = db.staff.find((x) => x.id === u.staffId); const g = db.guardians.find((x) => x.id === u.guardianId); return s ? `${s.firstName} ${s.lastName} (staff)` : g ? `${g.name} (parent)` : '—'; } },
          { key: 'lastLogin', label: 'Last sign-in', render: (u) => fmtDateTime(u.lastLogin) },
          { key: 'active', label: 'Status', render: (u) => (u.status === 'pending' ? <Badge tone="amber">Waiting approval</Badge> : u.status === 'rejected' ? <Badge tone="red">Rejected</Badge> : u.active ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>) },
          { key: 'a', label: '', align: 'right', render: (u) => (u.status !== 'active' ? (u.status === 'pending' && <Link to="/signups" className="text-sm font-semibold text-brand-700 hover:underline">Review</Link>) : (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setForm({ ...u, password: Math.random().toString(36).slice(2, 10) })}>Reset</Button>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm({ ...u, password: '' })} aria-label="Edit" />
            </div>
          )) },
        ]}
      />
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit @${form.username}` : 'New user'} footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" className="sm:col-span-2"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={Object.entries(ROLES).map(([value, label]) => ({ value, label }))} /></Field>
            {form.role === 'parent' ? (
              <Field label="Parent record" className="sm:col-span-2"><Select value={form.guardianId || ''} onChange={(e) => { const g = db.guardians.find((x) => x.id === e.target.value); setForm({ ...form, guardianId: e.target.value, name: g?.name || form.name }); }} placeholder="— Choose parent —" options={db.guardians.map((g) => ({ value: g.id, label: `${g.name} · ${g.phone}` }))} /></Field>
            ) : (
              <Field label="Staff record" className="sm:col-span-2" hint={form.role === 'teacher' ? 'The teacher sees the class they are assigned to under School Profile → Classes.' : undefined}><Select value={form.staffId || ''} onChange={(e) => { const s = db.staff.find((x) => x.id === e.target.value); setForm({ ...form, staffId: e.target.value, name: s ? `${s.firstName} ${s.lastName}` : form.name }); }} placeholder="— Not linked —" options={db.staff.filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} · ${s.position}` }))} /></Field>
            )}
            <Field label="Display name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Username"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Email (optional)" className="sm:col-span-2" hint="Can be used to sign in instead of the username."><Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={form.id ? 'New password (leave blank to keep)' : 'Password'}><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Account active</label>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2"><b>Access:</b> {ACCESS[form.role]}</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function ActivityLog() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const rows = useMemo(() => db.activityLog
    .map((l) => ({ ...l, who: db.users.find((u) => u.id === l.userId)?.name || 'System' }))
    .filter((l) => !userId || l.userId === userId)
    .filter((l) => !q.trim() || `${l.action} ${l.details} ${l.who}`.toLowerCase().includes(q.trim().toLowerCase())), [db, q, userId]);
  const cols = [{ key: 'at', label: 'When', format: fmtDateTime }, { key: 'who', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'details', label: 'Details' }];
  return (
    <Card bodyClass="">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search actions…" className="w-full sm:w-72" />
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="All users" options={db.users.map((u) => ({ value: u.id, label: u.name }))} className="sm:w-56" />
        <div className="ml-auto flex gap-2"><ExportButtons onPdf={() => exportTablePDF({ school: db.school, title: 'Activity Log', columns: cols, rows })} onExcel={() => exportExcel({ title: 'Activity Log', columns: cols, rows })} /></div>
      </div>
      <DataTable
        rows={rows}
        pageSize={30}
        columns={[
          { key: 'at', label: 'When', render: (l) => <span className="whitespace-nowrap text-slate-500 tabular-nums">{fmtDateTime(l.at)}</span> },
          { key: 'who', label: 'User', render: (l) => <span className="font-semibold text-slate-800">{l.who}</span> },
          { key: 'action', label: 'Action' },
          { key: 'details', label: 'Details', className: 'text-slate-600' },
        ]}
      />
    </Card>
  );
}
