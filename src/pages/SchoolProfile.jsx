import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CalendarDays, Layers, Pencil, Plus, Save, Settings2, Trash2, Upload, Warehouse } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { allTerms, currentTerm } from '../lib/finance';
import { fmtDate, readFileAsDataURL, today } from '../lib/utils';
import { Logo } from '../components/Layout';
import { Badge, Button, Card, Confirm, DataTable, Field, Info, Input, Modal, PageHeader, Select, StatCard, Tabs, Textarea, useToast } from '../components/ui';

export default function SchoolProfile() {
  const { db, user } = useStore();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'profile');
  const edit = can(user, 'school.edit');
  const tabs = [
    { id: 'profile', label: 'Profile', icon: Building2 },
    { id: 'classes', label: 'Classes', icon: Layers, count: db.classes.length },
    { id: 'facilities', label: 'Facilities', icon: Warehouse, count: db.facilities.length },
    { id: 'calendar', label: 'Sessions & Calendar', icon: CalendarDays },
    ...(user.role === 'superadmin' ? [{ id: 'settings', label: 'System Settings', icon: Settings2 }] : []),
  ];
  return (
    <>
      <PageHeader title="School Profile & Infrastructure" subtitle="Branding used on receipts, payslips and reports, plus classes, facilities and the academic calendar." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'profile' && <ProfileTab edit={edit} />}
      {tab === 'classes' && <ClassesTab edit={edit} />}
      {tab === 'facilities' && <FacilitiesTab edit={edit} />}
      {tab === 'calendar' && <CalendarTab edit={edit || can(user, 'calendar.edit')} />}
      {tab === 'settings' && user.role === 'superadmin' && <SettingsTab />}
    </>
  );
}

function ProfileTab({ edit }) {
  const { db, api } = useStore();
  const [form, setForm] = useState(db.school);
  const [toast, notify] = useToast();
  const active = db.students.filter((s) => s.status === 'active');
  const staff = db.staff.filter((s) => s.status === 'active');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 400_000) return notify('Logo must be smaller than 400 KB.');
    setForm({ ...form, logo: await readFileAsDataURL(f) });
  };
  const save = () => {
    api.setSchool(form);
    api.log('Updated school profile');
    notify('School profile saved.');
  };

  return (
    <div className="space-y-6">
      {toast}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Pupils enrolled" value={active.length} hint={`${active.filter((s) => db.classes.find((c) => c.id === s.classId)?.level === 'nursery').length} nursery · ${active.filter((s) => db.classes.find((c) => c.id === s.classId)?.level === 'primary').length} primary`} />
        <StatCard label="Staff strength" value={staff.length} tone="purple" hint={`${staff.filter((s) => s.category === 'teaching').length} teaching · ${staff.filter((s) => s.category !== 'teaching').length} non-teaching`} />
        <StatCard label="Classes offered" value={db.classes.length} tone="green" hint={`${db.classes.filter((c) => c.level === 'nursery').length} nursery · ${db.classes.filter((c) => c.level === 'primary').length} primary`} />
        <StatCard label="Classrooms" value={db.facilities.filter((f) => f.type === 'Classroom').length} tone="amber" hint={`${db.facilities.length} facilities in total`} />
      </div>

      <Card title="Identity & contact" actions={edit && <Button icon={Save} onClick={save}>Save changes</Button>}>
        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-slate-50 p-4 text-center">
            <Logo school={form} size="lg" />
            <p className="text-xs text-slate-500">Official logo — printed on every receipt, payslip and report. PNG or JPG, under 400 KB.</p>
            {edit && (
              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Upload className="size-3.5" /> Upload
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} />
                </label>
                {form.logo && <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, logo: '' })}>Remove</Button>}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" className="sm:col-span-2"><Input value={form.name} onChange={set('name')} disabled={!edit} /></Field>
            <Field label="Short name (sidebar)"><Input value={form.shortName} onChange={set('shortName')} disabled={!edit} /></Field>
            <Field label="Motto"><Input value={form.motto} onChange={set('motto')} disabled={!edit} /></Field>
            <Field label="Address"><Input value={form.address} onChange={set('address')} disabled={!edit} /></Field>
            <Field label="Region / Country"><Input value={form.region} onChange={set('region')} disabled={!edit} /></Field>
            <Field label="Main phone"><Input value={form.phone} onChange={set('phone')} disabled={!edit} /></Field>
            <Field label="Alternative phone"><Input value={form.altPhone} onChange={set('altPhone')} disabled={!edit} /></Field>
            <Field label="WhatsApp"><Input value={form.whatsapp} onChange={set('whatsapp')} disabled={!edit} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} disabled={!edit} /></Field>
            <Field label="Website"><Input value={form.website} onChange={set('website')} disabled={!edit} /></Field>
            <Field label="Year founded"><Input value={form.founded} onChange={set('founded')} disabled={!edit} /></Field>
            <Field label="Authorization number"><Input value={form.authorization} onChange={set('authorization')} disabled={!edit} /></Field>
            <Field label="Currency"><Input value={form.currency} onChange={set('currency')} disabled={!edit} /></Field>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ClassesTab({ edit }) {
  const { db, api } = useStore();
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [toast, notify] = useToast();
  const teachers = db.staff.filter((s) => s.category === 'teaching' && s.status === 'active');
  const rows = [...db.classes].sort((a, b) => a.order - b.order).map((c) => {
    const pupils = db.students.filter((s) => s.status === 'active' && s.classId === c.id);
    return { ...c, pupils: pupils.length, boys: pupils.filter((p) => p.gender === 'M').length };
  });

  const save = () => {
    const c = editing;
    if (!c.name.trim()) return;
    if (c.teacherId) db.classes.filter((x) => x.teacherId === c.teacherId && x.id !== c.id).forEach((x) => api.update('classes', x.id, { teacherId: null }));
    const { pupils, boys, ...fields } = c;
    const id = c.id || api.add('classes', { ...fields, order: Math.max(-1, ...db.classes.map((x) => x.order)) + 1 }).id;
    if (c.id) api.update('classes', c.id, fields);
    db.staff.forEach((s) => {
      if (s.classId === id && s.id !== c.teacherId) api.update('staff', s.id, { classId: null });
    });
    if (c.teacherId) api.update('staff', c.teacherId, { classId: id });
    api.log(c.id ? 'Updated class' : 'Created class', c.name);
    setEditing(null);
  };

  return (
    <Card title="Nursery & primary classes" bodyClass="" actions={edit && <Button icon={Plus} onClick={() => setEditing({ name: '', level: 'primary', capacity: 40, facilityId: '', teacherId: '', section: 'A' })}>Add class</Button>}>
      {toast}
      <DataTable
        rows={rows}
        columns={[
          { key: 'name', label: 'Class', render: (c) => <span className="font-semibold text-slate-800">{c.name}</span> },
          { key: 'level', label: 'Level', render: (c) => <Badge tone={c.level === 'nursery' ? 'purple' : 'blue'}>{c.level === 'nursery' ? 'Nursery' : 'Primary'}</Badge> },
          { key: 'teacher', label: 'Class teacher', render: (c) => { const t = db.staff.find((s) => s.id === c.teacherId); return t ? `${t.firstName} ${t.lastName}` : <span className="text-slate-400">Unassigned</span>; } },
          { key: 'room', label: 'Classroom', render: (c) => db.facilities.find((f) => f.id === c.facilityId)?.name || '—' },
          { key: 'pupils', label: 'Pupils', align: 'right', render: (c) => <span className={c.pupils > c.capacity ? 'font-bold text-rose-600' : ''}>{c.pupils} / {c.capacity}</span> },
          { key: 'gender', label: 'Boys / Girls', align: 'right', render: (c) => `${c.boys} / ${c.pupils - c.boys}` },
          ...(edit ? [{ key: 'actions', label: '', align: 'right', render: (c) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...c })} aria-label="Edit" />
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => (c.pupils ? notify('Move the pupils out of this class before deleting it.') : setDel(c))} aria-label="Delete" />
            </div>
          ) }] : []),
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit class' : 'Add class'} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Class 4" /></Field>
            <Field label="Level"><Select value={editing.level} onChange={(e) => setEditing({ ...editing, level: e.target.value })} options={[{ value: 'nursery', label: 'Nursery' }, { value: 'primary', label: 'Primary' }]} /></Field>
            <Field label="Capacity"><Input type="number" min="1" value={editing.capacity} onChange={(e) => setEditing({ ...editing, capacity: Number(e.target.value) })} /></Field>
            <Field label="Section / Stream"><Input value={editing.section} onChange={(e) => setEditing({ ...editing, section: e.target.value })} /></Field>
            <Field label="Class teacher"><Select value={editing.teacherId || ''} onChange={(e) => setEditing({ ...editing, teacherId: e.target.value || null })} placeholder="— Unassigned —" options={teachers.map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))} /></Field>
            <Field label="Classroom"><Select value={editing.facilityId || ''} onChange={(e) => setEditing({ ...editing, facilityId: e.target.value })} placeholder="— None —" options={db.facilities.filter((f) => f.type === 'Classroom').map((f) => ({ value: f.id, label: f.name }))} /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title="Delete class" message={`Delete ${del?.name}? Its fee structure lines will also be removed.`} onConfirm={() => {
        api.mutate((d) => { d.classes = d.classes.filter((c) => c.id !== del.id); d.feeItems = d.feeItems.filter((f) => f.classId !== del.id); return d; });
        api.log('Deleted class', del.name);
      }} />
    </Card>
  );
}

const FACILITY_TYPES = ['Classroom', 'Laboratory', 'Library', 'Office', 'Hall', 'Playground', 'Health', 'Store', 'Sanitation', 'Kitchen', 'Other'];

function FacilitiesTab({ edit }) {
  const { db, api } = useStore();
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const byType = FACILITY_TYPES.map((t) => ({ t, n: db.facilities.filter((f) => f.type === t).length })).filter((x) => x.n);

  const save = () => {
    if (!editing.name.trim()) return;
    if (editing.id) api.update('facilities', editing.id, editing);
    else api.add('facilities', editing);
    api.log(editing.id ? 'Updated facility' : 'Added facility', editing.name);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {byType.map(({ t, n }) => <Badge key={t} tone="blue" className="px-3 py-1 text-sm">{t}: {n}</Badge>)}
        <Badge tone="red" className="px-3 py-1 text-sm">Needs repair: {db.facilities.filter((f) => f.condition === 'Needs repair').length}</Badge>
      </div>
      <Card title="Classrooms & facilities" bodyClass="" actions={edit && <Button icon={Plus} onClick={() => setEditing({ name: '', type: 'Classroom', block: '', capacity: 30, condition: 'Good', notes: '' })}>Add facility</Button>}>
        <DataTable
          rows={[...db.facilities].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))}
          columns={[
            { key: 'name', label: 'Name', render: (f) => <span className="font-semibold text-slate-800">{f.name}</span> },
            { key: 'type', label: 'Category' },
            { key: 'block', label: 'Block' },
            { key: 'capacity', label: 'Capacity', align: 'right', render: (f) => f.capacity || '—' },
            { key: 'condition', label: 'Condition', render: (f) => <Badge tone={f.condition === 'Good' ? 'green' : f.condition === 'Fair' ? 'amber' : 'red'}>{f.condition}</Badge> },
            { key: 'notes', label: 'Notes', className: 'max-w-xs truncate text-slate-500' },
            ...(edit ? [{ key: 'a', label: '', align: 'right', render: (f) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...f })} aria-label="Edit" />
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(f)} aria-label="Delete" />
              </div>
            ) }] : []),
          ]}
        />
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit facility' : 'Add facility'} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Category"><Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} options={FACILITY_TYPES} /></Field>
            <Field label="Block / Location"><Input value={editing.block} onChange={(e) => setEditing({ ...editing, block: e.target.value })} /></Field>
            <Field label="Capacity"><Input type="number" min="0" value={editing.capacity} onChange={(e) => setEditing({ ...editing, capacity: Number(e.target.value) })} /></Field>
            <Field label="Condition"><Select value={editing.condition} onChange={(e) => setEditing({ ...editing, condition: e.target.value })} options={['Good', 'Fair', 'Needs repair']} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title="Delete facility" message={`Delete ${del?.name}?`} onConfirm={() => { api.remove('facilities', del.id); api.log('Deleted facility', del.name); }} />
    </div>
  );
}

const EVENT_TONES = { holiday: 'green', exam: 'red', event: 'purple', meeting: 'amber', term: 'blue' };

function CalendarTab({ edit }) {
  const { db, api } = useStore();
  const [ev, setEv] = useState(null);
  const [sess, setSess] = useState(null);
  const [toast, notify] = useToast();
  const term = currentTerm(db);

  const saveEvent = () => {
    if (!ev.title.trim() || !ev.date) return;
    if (ev.id) api.update('calendarEvents', ev.id, ev);
    else api.add('calendarEvents', ev);
    api.log('Updated academic calendar', ev.title);
    setEv(null);
  };
  const saveSession = () => {
    if (!/^\d{4}\/\d{4}$/.test(sess.name)) return notify('Session name must look like 2027/2028.');
    if (sess.id) api.update('sessions', sess.id, sess);
    else api.add('sessions', { ...sess, id: `s${sess.name.slice(2, 4)}${sess.name.slice(7, 9)}`, terms: sess.terms.map((t, i) => ({ ...t, id: `s${sess.name.slice(2, 4)}${sess.name.slice(7, 9)}-t${i + 1}` })) });
    api.log(sess.id ? 'Updated session' : 'Created session', sess.name);
    setSess(null);
  };
  const newSession = () => {
    const last = [...db.sessions].sort((a, b) => a.start.localeCompare(b.start)).at(-1);
    const y = Number(last.name.slice(5));
    const shift = (d) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
    setSess({ name: `${y}/${y + 1}`, start: shift(last.start), end: shift(last.end), terms: last.terms.map((t) => ({ name: t.name, start: shift(t.start), end: shift(t.end) })) });
  };
  const setCurrent = (termId) => {
    const t = allTerms(db).find((x) => x.id === termId);
    api.setSettings({ currentTermId: termId, currentSessionId: t.sessionId });
    api.log('Changed current term', t.label);
    notify(`Current term is now ${t.label}.`);
  };

  return (
    <div className="space-y-6">
      {toast}
      <Card title="Sessions & terms" actions={edit && <Button icon={Plus} onClick={newSession}>New session</Button>}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Current term (used for billing, dashboard and reports)" className="min-w-64">
            <Select value={db.settings.currentTermId} onChange={(e) => setCurrent(e.target.value)} disabled={!edit} options={allTerms(db).map((t) => ({ value: t.id, label: t.label }))} />
          </Field>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...db.sessions].sort((a, b) => b.start.localeCompare(a.start)).map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-800">{s.name} {s.id === term.sessionId && <Badge tone="green" className="ml-1">Current</Badge>}</p>
                {edit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setSess(structuredClone(s))}>Edit</Button>}
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {s.terms.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className={t.id === term.id ? 'font-semibold text-brand-700' : 'text-slate-600'}>{t.name}</span>
                    <span className="text-slate-500 tabular-nums">{fmtDate(t.start)} – {fmtDate(t.end)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Academic calendar" bodyClass="" actions={edit && <Button icon={Plus} onClick={() => setEv({ title: '', date: '', endDate: '', type: 'event' })}>Add event</Button>}>
        <DataTable
          rows={[...db.calendarEvents].sort((a, b) => a.date.localeCompare(b.date))}
          columns={[
            { key: 'date', label: 'Date', render: (e) => <span className="tabular-nums">{fmtDate(e.date)}{e.endDate ? ` – ${fmtDate(e.endDate)}` : ''}</span> },
            { key: 'title', label: 'Event', render: (e) => <span className="font-semibold text-slate-800">{e.title}</span> },
            { key: 'type', label: 'Type', render: (e) => <Badge tone={EVENT_TONES[e.type]} className="capitalize">{e.type}</Badge> },
            ...(edit ? [{ key: 'a', label: '', align: 'right', render: (e) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEv({ ...e })} aria-label="Edit" />
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { api.remove('calendarEvents', e.id); api.log('Removed calendar event', e.title); }} aria-label="Delete" />
              </div>
            ) }] : []),
          ]}
        />
      </Card>

      <Modal open={!!ev} onClose={() => setEv(null)} title={ev?.id ? 'Edit event' : 'Add event'} size="sm" footer={<><Button variant="secondary" onClick={() => setEv(null)}>Cancel</Button><Button onClick={saveEvent}>Save</Button></>}>
        {ev && (
          <div className="grid gap-4">
            <Field label="Title"><Input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></Field>
              <Field label="End date (optional)"><Input type="date" value={ev.endDate} onChange={(e) => setEv({ ...ev, endDate: e.target.value })} /></Field>
            </div>
            <Field label="Type"><Select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })} options={Object.keys(EVENT_TONES).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!sess} onClose={() => setSess(null)} title={sess?.id ? `Edit session ${sess.name}` : 'New session'} footer={<><Button variant="secondary" onClick={() => setSess(null)}>Cancel</Button><Button onClick={saveSession}>Save</Button></>}>
        {sess && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Session"><Input value={sess.name} onChange={(e) => setSess({ ...sess, name: e.target.value })} disabled={!!sess.id} /></Field>
              <Field label="Starts"><Input type="date" value={sess.start} onChange={(e) => setSess({ ...sess, start: e.target.value })} /></Field>
              <Field label="Ends"><Input type="date" value={sess.end} onChange={(e) => setSess({ ...sess, end: e.target.value })} /></Field>
            </div>
            {sess.terms.map((t, i) => (
              <div key={i} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
                <Field label={`Term ${i + 1}`}><Input value={t.name} onChange={(e) => setSess({ ...sess, terms: sess.terms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></Field>
                <Field label="Starts"><Input type="date" value={t.start} onChange={(e) => setSess({ ...sess, terms: sess.terms.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} /></Field>
                <Field label="Ends"><Input type="date" value={t.end} onChange={(e) => setSess({ ...sess, terms: sess.terms.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} /></Field>
              </div>
            ))}
            {!sess.id && <p className="text-xs text-slate-500">After creating the session, copy fees into it from <b>Fee Structure</b>, then promote pupils from <b>Promotion &amp; Exits</b>.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SettingsTab() {
  const { db, api } = useStore();
  const [cnps, setCnps] = useState(db.settings.cnpsRate);
  const [prefix, setPrefix] = useState(db.school.regPrefix);
  const [momo, setMomo] = useState(db.settings.momo);
  const setMomoField = (k) => (e) => setMomo({ ...momo, [k]: e.target.value });
  const [toast, notify] = useToast();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {toast}
      <Card title="Numbering & payroll">
        <div className="space-y-4">
          <Field label="Registration number prefix" hint={`New pupils get numbers like ${prefix}/${new Date().getFullYear()}/0001.`}><Input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
          <Field label="CNPS employee contribution (%)" hint="Deducted from basic salary on each payroll run. Set 0 to disable."><Input type="number" step="0.1" min="0" value={cnps} onChange={(e) => setCnps(e.target.value)} /></Field>
          <Button icon={Save} onClick={() => { api.setSettings({ cnpsRate: Number(cnps) }); api.setSchool({ regPrefix: prefix }); api.log('Updated system settings'); notify('Settings saved.'); }}>Save settings</Button>
        </div>
      </Card>
      <Card title="Parent payment accounts" className="lg:row-span-2">
        <p className="mb-4 text-sm text-slate-600">Shown to parents on the Pay Fees page when they pay by USSD or bank transfer and submit the transaction ID.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="MTN MoMo number"><Input value={momo.mtnNumber} onChange={setMomoField('mtnNumber')} /></Field>
          <Field label="MTN account name"><Input value={momo.mtnName} onChange={setMomoField('mtnName')} /></Field>
          <Field label="Orange Money number"><Input value={momo.orangeNumber} onChange={setMomoField('orangeNumber')} /></Field>
          <Field label="Orange account name"><Input value={momo.orangeName} onChange={setMomoField('orangeName')} /></Field>
          <Field label="Bank"><Input value={momo.bankName} onChange={setMomoField('bankName')} /></Field>
          <Field label="Account number"><Input value={momo.bankAccount} onChange={setMomoField('bankAccount')} /></Field>
          <Field label="Account name" className="sm:col-span-2"><Input value={momo.bankAccountName} onChange={setMomoField('bankAccountName')} /></Field>
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <b>“Pay now” phone prompts run in demo mode</b> — no money moves. To take real MoMo payments, open a merchant account with a payment provider (e.g. Campay, Notch Pay, Monetbil, or MTN/Orange directly) and connect it in <code>server/momo.js</code> and set <code>MOMO_MODE=live</code> on the server.
        </div>
        <Button className="mt-4" icon={Save} onClick={() => { api.setSettings({ momo }); api.log('Updated parent payment accounts'); notify('Payment accounts saved.'); }}>Save accounts</Button>
      </Card>
      <Card title="Data">
        <dl className="grid grid-cols-2 gap-4">
          <Info label="Pupils (all time)">{db.students.length}</Info>
          <Info label="Payments">{db.payments.length}</Info>
          <Info label="Payroll runs">{db.payrollRuns.length}</Info>
          <Info label="Activity log entries">{db.activityLog.length}</Info>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `sis-backup-${today()}.json`;
            a.click();
            api.log('Downloaded data backup');
          }}>Download backup (JSON)</Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Data is stored in the school database on the server. The backup is a JSON copy for your records; to wipe everything and start fresh, run <code>npm run db:reset -- --yes</code> on the server.</p>
      </Card>
    </div>
  );
}

