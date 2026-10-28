import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { fmtDate, money, pad, today, uid } from '../lib/utils';
import { SUBJECTS } from '../lib/subjects';
import { Avatar, Badge, Button, Card, DataTable, ExportButtons, Field, Input, Modal, PageHeader, SearchInput, Select, StatCard, Tabs, useToast } from '../components/ui';

const blank = { firstName: '', lastName: '', gender: 'F', category: 'teaching', position: '', qualification: '', phone: '', email: '', dateEmployed: '', dob: '', address: '', gradeId: '', bankName: '', accountNo: '', momoNumber: '', classId: null, status: 'active', teaching: [] };

export default function Staff() {
  const { db, user } = useStore();
  const [tab, setTab] = useState('staff');
  const canPay = can(user, 'payroll');
  return (
    <>
      <PageHeader title="Staff" subtitle="Teaching and non-teaching staff profiles, salary scales and payment details." />
      <Tabs tabs={[{ id: 'staff', label: 'Staff list', count: db.staff.filter((s) => s.status === 'active').length }, ...(canPay || user.role === 'superadmin' ? [{ id: 'scales', label: 'Salary scales', count: db.salaryScales.length }] : [])]} value={tab} onChange={setTab} />
      {tab === 'staff' ? <StaffList /> : <Scales />}
    </>
  );
}

function StaffList() {
  const { db, api, user } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null);
  const [toast, notify] = useToast();
  const edit = can(user, 'staff.edit') || can(user, 'payroll');
  const showPay = can(user, 'payroll');
  const grade = (id) => db.salaryScales.find((g) => g.id === id);
  const cur = db.school.currency;

  const rows = useMemo(() => db.staff
    .filter((s) => (status ? s.status === status : true))
    .filter((s) => !cat || s.category === cat)
    .filter((s) => !q.trim() || `${s.firstName} ${s.lastName} ${s.staffNo} ${s.position} ${s.phone}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.staffNo.localeCompare(b.staffNo)), [db.staff, q, cat, status]);

  const active = db.staff.filter((s) => s.status === 'active');
  const monthly = active.reduce((t, s) => { const g = grade(s.gradeId); return t + (g ? g.basic + g.housing + g.transport : 0); }, 0);

  const save = async () => {
    const s = { ...editing, teaching: (editing.teaching || []).map((t) => ({ subject: t.subject.trim(), classIds: t.classIds || [] })).filter((t) => t.subject) };
    if (!s.firstName.trim() || !s.lastName.trim() || !s.position.trim()) return notify('Name and position are required.');
    if (s.id) {
      api.update('staff', s.id, s);
      api.log('Updated staff record', `${s.firstName} ${s.lastName}`);
    } else {
      let staffNo;
      try { staffNo = `${db.school.regPrefix}-STF-${pad(await api.nextCounter('staff'), 3)}`; } catch (e) { return notify(e.message); }
      api.add('staff', { ...s, id: uid('st'), staffNo });
      api.log('Added staff', `${s.firstName} ${s.lastName} (${staffNo})`);
    }
    setEditing(null);
  };

  const cols = [
    { key: 'staffNo', label: 'Staff No' }, { key: 'name', label: 'Name' }, { key: 'position', label: 'Position' },
    { key: 'cat', label: 'Category' }, { key: 'phone', label: 'Phone' }, { key: 'employed', label: 'Employed' },
    ...(showPay ? [{ key: 'grade', label: 'Scale' }, { key: 'gross', label: 'Monthly gross', align: 'right', format: (v) => money(v, '') }] : []),
  ];
  const exportRows = () => rows.map((s) => { const g = grade(s.gradeId); return { ...s, name: `${s.firstName} ${s.lastName}`, cat: s.category === 'teaching' ? 'Teaching' : 'Non-teaching', employed: fmtDate(s.dateEmployed), grade: g?.name, gross: g ? g.basic + g.housing + g.transport : 0 }; });

  return (
    <>
      {toast}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active staff" value={active.length} />
        <StatCard label="Teaching" value={active.filter((s) => s.category === 'teaching').length} tone="green" />
        <StatCard label="Non-teaching" value={active.filter((s) => s.category !== 'teaching').length} tone="purple" />
        {showPay && <StatCard label="Monthly salary bill (gross)" value={money(monthly, cur)} tone="amber" />}
      </div>
      <Card bodyClass="">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Name, staff no, position…" className="w-full sm:w-72" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={[{ value: 'teaching', label: 'Teaching' }, { value: 'non-teaching', label: 'Non-teaching' }]} className="sm:w-44" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={[{ value: 'active', label: 'Active' }, { value: 'left', label: 'Left' }]} className="sm:w-36" />
          <div className="ml-auto flex gap-2">
            <ExportButtons onPdf={() => exportTablePDF({ school: db.school, title: 'Staff List', columns: cols, rows: exportRows() })} onExcel={() => exportExcel({ title: 'Staff List', columns: cols.map((c) => ({ ...c, format: undefined })), rows: exportRows() })} />
            {edit && <Button size="sm" icon={UserPlus} onClick={() => setEditing({ ...blank, dateEmployed: today(), gradeId: db.salaryScales[0]?.id })}>Add staff</Button>}
          </div>
        </div>
        <DataTable
          rows={rows}
          pageSize={20}
          columns={[
            { key: 'name', label: 'Staff', render: (s) => <div className="flex items-center gap-3"><Avatar name={`${s.firstName} ${s.lastName}`} src={s.photo} size="sm" /><div><p className="font-semibold text-slate-800">{s.firstName} {s.lastName}</p><p className="font-mono text-xs text-slate-500">{s.staffNo}</p></div></div> },
            { key: 'position', label: 'Position', render: (s) => <div><p>{s.position}</p>{s.classId && <p className="text-xs text-slate-500">{db.classes.find((c) => c.id === s.classId)?.name}</p>}</div> },
            { key: 'category', label: 'Category', render: (s) => <Badge tone={s.category === 'teaching' ? 'blue' : 'purple'}>{s.category === 'teaching' ? 'Teaching' : 'Non-teaching'}</Badge> },
            { key: 'phone', label: 'Phone' },
            { key: 'employed', label: 'Employed', render: (s) => fmtDate(s.dateEmployed) },
            ...(showPay ? [
              { key: 'grade', label: 'Salary scale', render: (s) => grade(s.gradeId)?.name || '—' },
              { key: 'gross', label: 'Gross / month', align: 'right', render: (s) => { const g = grade(s.gradeId); return g ? money(g.basic + g.housing + g.transport, '') : '—'; } },
            ] : []),
            ...(edit ? [{ key: 'a', label: '', align: 'right', render: (s) => <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...s })} aria-label="Edit" /> }] : []),
          ]}
        />
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.firstName} ${editing.lastName}` : 'Add staff member'} size="lg" footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {editing && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name *"><Input value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} /></Field>
              <Field label="Surname *"><Input value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} /></Field>
              <Field label="Sex"><Select value={editing.gender} onChange={(e) => setEditing({ ...editing, gender: e.target.value })} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} /></Field>
              <Field label="Category"><Select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} options={[{ value: 'teaching', label: 'Teaching' }, { value: 'non-teaching', label: 'Non-teaching' }]} /></Field>
              <Field label="Position *"><Input value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} placeholder="e.g. Class Teacher" /></Field>
              <Field label="Qualification"><Input value={editing.qualification} onChange={(e) => setEditing({ ...editing, qualification: e.target.value })} /></Field>
              <Field label="Phone"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Date of birth"><Input type="date" value={editing.dob} onChange={(e) => setEditing({ ...editing, dob: e.target.value })} /></Field>
              <Field label="Date employed"><Input type="date" value={editing.dateEmployed} onChange={(e) => setEditing({ ...editing, dateEmployed: e.target.value })} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            </div>
            {editing.category === 'teaching' && <Teaching value={editing.teaching || []} onChange={(teaching) => setEditing({ ...editing, teaching })} />}
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <Field label="Salary scale"><Select value={editing.gradeId} onChange={(e) => setEditing({ ...editing, gradeId: e.target.value })} options={db.salaryScales.map((g) => ({ value: g.id, label: `${g.name} (${money(g.basic + g.housing + g.transport, '')})` }))} /></Field>
              <Field label="Paid via"><Select value={editing.bankName} onChange={(e) => setEditing({ ...editing, bankName: e.target.value })} placeholder="Cash" options={['Afriland First Bank', 'CCA Bank', 'UBA Cameroon', 'Ecobank', 'SGC', 'MTN Mobile Money', 'Orange Money']} /></Field>
              <Field label={/Money/.test(editing.bankName) ? 'MoMo number' : 'Account number'}>
                {/Money/.test(editing.bankName)
                  ? <Input value={editing.momoNumber} onChange={(e) => setEditing({ ...editing, momoNumber: e.target.value })} />
                  : <Input value={editing.accountNo} onChange={(e) => setEditing({ ...editing, accountNo: e.target.value })} disabled={!editing.bankName} />}
              </Field>
              <Field label="Status"><Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'left', label: 'Left the school' }]} /></Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Subjects this teacher takes and the classes they take each one in. */
function Teaching({ value, onChange }) {
  const { db } = useStore();
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const set = (i, patch) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const toggle = (i, id) => { const ids = value[i].classIds || []; set(i, { classIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }); };
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Subjects taught</h3>
          <p className="text-xs text-slate-500">Shown to parents and staff under Teachers &amp; subjects.</p>
        </div>
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...value, { subject: '', classIds: [] }])}>Add subject</Button>
      </div>
      {value.length === 0 && <p className="text-sm text-slate-500">No subjects yet.</p>}
      <datalist id="subject-list">{SUBJECTS.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="space-y-3">
        {value.map((t, i) => (
          <div key={i} className="rounded-md bg-slate-50 p-3">
            <div className="flex gap-2">
              <Input list="subject-list" value={t.subject} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject, e.g. Mathematics" aria-label="Subject" />
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove subject" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {classes.map((c) => {
                const on = (t.classIds || []).includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => toggle(i, c.id)} aria-pressed={on}
                    className={`rounded-sm border px-2 py-1 text-xs font-medium ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400'}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Scales() {
  const { db, api, user } = useStore();
  const [editing, setEditing] = useState(null);
  const edit = can(user, 'payroll');
  const save = () => {
    if (!editing.name.trim()) return;
    const v = { ...editing, basic: Number(editing.basic) || 0, housing: Number(editing.housing) || 0, transport: Number(editing.transport) || 0 };
    if (v.id) api.update('salaryScales', v.id, v);
    else api.add('salaryScales', v);
    api.log('Updated salary scale', v.name);
    setEditing(null);
  };
  return (
    <Card bodyClass="" title="Salary scales" actions={edit && <Button icon={Plus} onClick={() => setEditing({ name: '', basic: 0, housing: 0, transport: 0 })}>Add scale</Button>}>
      <DataTable
        rows={db.salaryScales}
        columns={[
          { key: 'name', label: 'Scale', render: (g) => <span className="font-semibold text-slate-800">{g.name}</span> },
          { key: 'basic', label: 'Basic', align: 'right', render: (g) => money(g.basic, '') },
          { key: 'housing', label: 'Housing', align: 'right', render: (g) => money(g.housing, '') },
          { key: 'transport', label: 'Transport', align: 'right', render: (g) => money(g.transport, '') },
          { key: 'gross', label: 'Gross', align: 'right', render: (g) => <b>{money(g.basic + g.housing + g.transport, '')}</b> },
          { key: 'staff', label: 'Staff on scale', align: 'right', render: (g) => db.staff.filter((s) => s.gradeId === g.id && s.status === 'active').length },
          ...(edit ? [{ key: 'a', label: '', align: 'right', render: (g) => <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...g })} aria-label="Edit" /> }] : []),
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit salary scale' : 'Add salary scale'} size="sm" footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Basic salary"><Input type="number" min="0" value={editing.basic} onChange={(e) => setEditing({ ...editing, basic: e.target.value })} /></Field>
            <Field label="Housing allowance"><Input type="number" min="0" value={editing.housing} onChange={(e) => setEditing({ ...editing, housing: e.target.value })} /></Field>
            <Field label="Transport allowance"><Input type="number" min="0" value={editing.transport} onChange={(e) => setEditing({ ...editing, transport: e.target.value })} /></Field>
            <p className="text-xs text-slate-500">Changes apply to payroll runs generated from now on; past payslips keep their amounts.</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
