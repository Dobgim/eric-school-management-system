import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { feeStatus } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { money, uid } from '../lib/utils';
import { Badge, Button, Card, DataTable, ExportButtons, Field, Input, Modal, PageHeader, SearchInput, Select, useToast } from '../components/ui';

export default function Guardians() {
  const { db, api } = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [account, setAccount] = useState(null);
  const [toast, notify] = useToast();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.guardians
      .map((g) => {
        const kids = db.students.filter((s) => s.guardianIds.includes(g.id));
        const active = kids.filter((k) => k.status === 'active');
        return { ...g, kids, active, owing: active.reduce((t, k) => t + feeStatus(db, k).totalDue, 0), user: db.users.find((u) => u.guardianId === g.id) };
      })
      .filter((g) => !needle || [g.name, g.phone, g.email, ...g.kids.map((k) => `${k.firstName} ${k.lastName} ${k.regNo}`)].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.active.length - a.active.length || a.name.localeCompare(b.name));
  }, [db, q]);

  const save = () => {
    if (!editing.name.trim() || !editing.phone.trim()) return notify('Name and phone are required.');
    const { kids, active, owing, user, ...g } = editing;
    if (g.id) api.update('guardians', g.id, g);
    else api.add('guardians', { ...g, id: uid('g') });
    api.log(g.id ? 'Updated parent record' : 'Added parent', g.name);
    setEditing(null);
  };

  const saveAccount = async () => {
    const { g, username, password } = account;
    if (!username.trim() || password.length < 6) return notify('Username and a password of at least 6 characters are required.');
    if (db.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.guardianId !== g.id)) return notify('That username is taken.');
    const v = { id: g.user?.id || uid('u'), name: g.user?.name || g.name, username: username.trim(), role: 'parent', guardianId: g.id, staffId: null, active: true, password };
    try {
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'users', v }] } });
      await api.reload();
    } catch (e) { return notify(e.message); }
    api.log(g.user ? 'Reset parent portal password' : 'Created parent portal account', g.name);
    notify(`Portal login for ${g.name}: ${username.trim()} / ${password}`);
    setAccount(null);
  };

  const cols = [{ key: 'name', label: 'Name' }, { key: 'relationship', label: 'Relationship' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'children', label: 'Children' }];
  const exportRows = () => rows.map((g) => ({ ...g, children: g.kids.map((k) => `${k.firstName} ${k.lastName}`).join(', ') }));

  return (
    <>
      {toast}
      <PageHeader title="Parents & Guardians" subtitle="Contact details, linked children and parent-portal access." actions={<Button icon={Plus} onClick={() => setEditing({ name: '', relationship: 'Father', phone: '', altPhone: '', email: '', occupation: '', address: '' })}>Add parent</Button>} />
      <Card bodyClass="">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Parent, phone or child…" className="w-full sm:w-80" />
          <div className="flex gap-2"><ExportButtons onPdf={() => exportTablePDF({ school: db.school, title: 'Parents & Guardians', columns: cols, rows: exportRows() })} onExcel={() => exportExcel({ title: 'Parents & Guardians', columns: cols, rows: exportRows() })} /></div>
        </div>
        <DataTable
          rows={rows}
          pageSize={20}
          columns={[
            { key: 'name', label: 'Parent / Guardian', render: (g) => <div><p className="font-semibold text-slate-800">{g.name}</p><p className="text-xs text-slate-500">{g.relationship} · {g.occupation || '—'}</p></div> },
            { key: 'phone', label: 'Contact', render: (g) => <div><p>{g.phone}</p><p className="text-xs text-slate-500">{g.email || g.altPhone}</p></div> },
            { key: 'kids', label: 'Children', render: (g) => (
              <div className="flex flex-wrap gap-1">
                {g.kids.map((k) => <Link key={k.id} to={`/students/${k.id}`} className={`rounded-md px-2 py-0.5 text-xs font-medium ${k.status === 'active' ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'bg-slate-100 text-slate-500'}`}>{k.firstName} · {db.classes.find((c) => c.id === k.classId)?.name}</Link>)}
              </div>
            ) },
            { key: 'owing', label: 'Family owing', align: 'right', render: (g) => (g.owing ? <span className="font-semibold text-rose-600">{money(g.owing, '')}</span> : '—') },
            { key: 'portal', label: 'Portal', render: (g) => (g.user ? <Badge tone={g.user.active ? 'green' : 'slate'}>@{g.user.username}</Badge> : <Badge>None</Badge>) },
            { key: 'a', label: '', align: 'right', render: (g) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setAccount({ g, username: g.user?.username || g.phone.replace(/\s/g, ''), password: Math.random().toString(36).slice(2, 10) })}>{g.user ? 'Reset' : 'Portal'}</Button>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...g })} aria-label="Edit" />
              </div>
            ) },
          ]}
        />
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit parent' : 'Add parent'} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Relationship"><Select value={editing.relationship} onChange={(e) => setEditing({ ...editing, relationship: e.target.value })} options={['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling']} /></Field>
            <Field label="Phone *"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="Alt. phone"><Input value={editing.altPhone} onChange={(e) => setEditing({ ...editing, altPhone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Occupation"><Input value={editing.occupation} onChange={(e) => setEditing({ ...editing, occupation: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!account} onClose={() => setAccount(null)} title={account?.g.user ? 'Reset portal login' : 'Create portal login'} size="sm" footer={<><Button variant="secondary" onClick={() => setAccount(null)}>Cancel</Button><Button onClick={saveAccount}>Save login</Button></>}>
        {account && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{account.g.name} will be able to see their children’s profiles, fees, receipts, purchases and school announcements.</p>
            <Field label="Username"><Input value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} /></Field>
            <Field label="Password" hint="Share it with the parent privately; they can change it under My Account."><Input value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
