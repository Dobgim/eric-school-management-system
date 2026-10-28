import { useState } from 'react';
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { fmtDate, fullName, today, uid } from '../lib/utils';
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, useToast } from '../components/ui';

export const AUDIENCE = { all: ['blue', 'Everyone'], parents: ['green', 'All parents'], staff: ['purple', 'Staff'], personal: ['amber', 'Personal'] };

export function visibleAnnouncements(db, user) {
  return db.announcements
    .filter((a) => a.audience === 'all' || (user.role === 'parent'
      ? a.audience === 'parents' || (a.audience === 'personal' && (a.guardianIds || []).includes(user.guardianId))
      : a.audience === 'staff' || can(user, 'announcements.edit') || user.role === 'superadmin'))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date));
}

export function AnnouncementList({ items, onEdit, onDelete }) {
  const { db } = useStore();
  if (!items.length) return <Empty title="No announcements" />;
  return (
    <div className="space-y-4">
      {items.map((a) => (
        <article key={a.id} className={`card p-5 ${a.pinned ? 'border-accent-400 ring-1 ring-accent-400/40' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-900">{a.pinned && <Pin className="size-4 text-accent-500" />}{a.title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{fmtDate(a.date)} · {db.users.find((u) => u.id === a.by)?.name || 'School office'}</p>
            </div>
            <div className="flex items-center gap-1">
              <Badge tone={(AUDIENCE[a.audience] || AUDIENCE.all)[0]}>{(AUDIENCE[a.audience] || AUDIENCE.all)[1]}</Badge>
              {onEdit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(a)} aria-label="Edit" />}
              {onDelete && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDelete(a)} aria-label="Delete" />}
            </div>
          </div>
          {a.audience === 'personal' && onEdit && <p className="mt-1 text-xs text-slate-500">To: {(a.guardianIds || []).map((id) => db.guardians.find((g) => g.id === id)?.name).filter(Boolean).join(', ')}</p>}
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">{a.body}</p>
        </article>
      ))}
    </div>
  );
}

export default function Announcements() {
  const { db, api, user } = useStore();
  const edit = can(user, 'announcements.edit') || user.role === 'superadmin';
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [toast, notify] = useToast();
  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return notify('Write a title and a message.');
    if (form.audience === 'personal' && !(form.guardianIds || []).length) return notify('Choose at least one parent.');
    const a = { ...form, guardianIds: form.audience === 'personal' ? form.guardianIds : [] };
    // Sent straight to the server, which notifies the parents (in the app and on their phones).
    try {
      await api.request('/api/ops', { method: 'POST', body: { ops: [{ t: 'put', c: 'announcements', v: form.id ? a : { ...a, id: uid('an'), by: user.id } }] } });
      await api.reload();
    } catch (e) { return notify(e.message); }
    api.log(form.id ? 'Edited announcement' : 'Posted announcement', form.title);
    notify(form.id ? 'Announcement saved.' : form.audience === 'personal' ? 'Message sent. The parent is notified on their phone.' : 'Posted. Everyone it is for has been notified.');
    setForm(null);
  };
  return (
    <>
      {toast}
      <PageHeader title="Announcements" subtitle="Notices for parents (shown in the parents portal) and staff." actions={edit && <Button icon={Plus} onClick={() => setForm({ title: '', body: '', audience: 'all', guardianIds: [], date: today(), pinned: false })}>New announcement</Button>} />
      <div className="max-w-3xl">
        <AnnouncementList items={visibleAnnouncements(db, user)} onEdit={edit ? (a) => setForm({ ...a }) : null} onDelete={edit ? setDel : null} />
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit announcement' : 'New announcement'} footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button icon={Megaphone} onClick={save}>{form?.id ? 'Save' : 'Post'}</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Message"><Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Send to"><Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} options={Object.entries(AUDIENCE).map(([value, [, label]]) => ({ value, label }))} /></Field>
              <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to top</label>
            </div>
            {form.audience === 'personal' && <ParentPicker value={form.guardianIds || []} onChange={(guardianIds) => setForm({ ...form, guardianIds })} />}
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title="Delete announcement" message={`Delete “${del?.title}”?`} onConfirm={() => { api.remove('announcements', del.id); api.log('Deleted announcement', del.title); }} />
    </>
  );
}

/** Choose the families a personal message goes to (search by parent, pupil or phone). */
function ParentPicker({ value, onChange }) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const families = db.guardians
    .map((g) => ({ ...g, kids: db.students.filter((s) => (s.guardianIds || []).includes(g.id) && s.status === 'active') }))
    .filter((g) => !needle || `${g.name} ${g.phone} ${g.kids.map((k) => fullName(k)).join(' ')}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)) || a.name.localeCompare(b.name));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-2">
        <SearchInput value={q} onChange={setQ} placeholder="Parent, pupil or phone…" className="flex-1" />
        <span className="shrink-0 px-2 text-xs font-semibold text-slate-600">{value.length} chosen</span>
      </div>
      <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
        {families.slice(0, 100).map((g) => (
          <li key={g.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
              <input type="checkbox" checked={value.includes(g.id)} onChange={() => toggle(g.id)} />
              <span className="min-w-0 flex-1 text-sm"><span className="font-semibold text-slate-800">{g.name}</span> <span className="text-slate-500">{g.phone}</span>
                {g.kids.length > 0 && <span className="block truncate text-xs text-slate-500">Parent of {g.kids.map((k) => fullName(k)).join(', ')}</span>}</span>
            </label>
          </li>
        ))}
        {!families.length && <li className="px-3 py-4 text-center text-sm text-slate-500">No parent found.</li>}
      </ul>
    </div>
  );
}
