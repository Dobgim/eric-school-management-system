import { useState } from 'react';
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { fmtDate, today } from '../lib/utils';
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui';

export const AUDIENCE = { all: ['blue', 'Everyone'], parents: ['green', 'Parents'], staff: ['purple', 'Staff'] };

export function visibleAnnouncements(db, user) {
  return db.announcements
    .filter((a) => a.audience === 'all' || (user.role === 'parent' ? a.audience === 'parents' : a.audience === 'staff' || can(user, 'announcements.edit')))
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
              <Badge tone={AUDIENCE[a.audience][0]}>{AUDIENCE[a.audience][1]}</Badge>
              {onEdit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(a)} aria-label="Edit" />}
              {onDelete && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDelete(a)} aria-label="Delete" />}
            </div>
          </div>
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
  const save = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    if (form.id) api.update('announcements', form.id, form);
    else api.add('announcements', { ...form, by: user.id });
    api.log(form.id ? 'Edited announcement' : 'Posted announcement', form.title);
    setForm(null);
  };
  return (
    <>
      <PageHeader title="Announcements" subtitle="Notices for parents (shown in the parents portal) and staff." actions={edit && <Button icon={Plus} onClick={() => setForm({ title: '', body: '', audience: 'all', date: today(), pinned: false })}>New announcement</Button>} />
      <div className="max-w-3xl">
        <AnnouncementList items={visibleAnnouncements(db, user)} onEdit={edit ? (a) => setForm({ ...a }) : null} onDelete={edit ? setDel : null} />
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit announcement' : 'New announcement'} footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button icon={Megaphone} onClick={save}>{form?.id ? 'Save' : 'Post'}</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Message"><Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Audience"><Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} options={Object.entries(AUDIENCE).map(([value, [, label]]) => ({ value, label }))} /></Field>
              <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to top</label>
            </div>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title="Delete announcement" message={`Delete “${del?.title}”?`} onConfirm={() => { api.remove('announcements', del.id); api.log('Deleted announcement', del.title); }} />
    </>
  );
}
