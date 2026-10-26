import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, UserPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { currentTerm, feeStatus } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { REQUIRED_DOCS, STUDENT_STATUS, age, fullName, money, today } from '../lib/utils';
import { Avatar, Badge, Button, Card, DataTable, ExportButtons, FeeBadge, Field, Modal, PageHeader, SearchInput, Select, useToast } from '../components/ui';

export default function Students() {
  const { db, user, api } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const [moveTo, setMoveTo] = useState(null);
  const [toast, notify] = useToast();
  const showFees = can(user, 'fees.view');
  const term = currentTerm(db);
  const f = { classId: params.get('class') || '', gender: params.get('gender') || '', status: params.get('status') || 'active', fee: params.get('fee') || '', docs: params.get('docs') || '' };
  const setF = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const className = (id) => db.classes.find((c) => c.id === id)?.name || '—';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.students
      .filter((s) => (f.status === 'all' ? true : s.status === f.status))
      .filter((s) => !f.classId || s.classId === f.classId)
      .filter((s) => !f.gender || s.gender === f.gender)
      .map((s) => ({ ...s, fee: feeStatus(db, s, term.id), missingDocs: REQUIRED_DOCS.filter((d) => !s.documents.some((x) => x.name === d)) }))
      .filter((s) => !f.fee || (f.fee === 'owing' ? s.fee.totalDue > 0 : s.fee.state === f.fee))
      .filter((s) => !f.docs || s.missingDocs.length > 0)
      .filter((s) => {
        if (!needle) return true;
        const gs = s.guardianIds.map((id) => db.guardians.find((g) => g.id === id)).filter(Boolean);
        return [fullName(s), s.regNo, ...gs.map((g) => `${g.name} ${g.phone}`)].join(' ').toLowerCase().includes(needle);
      })
      .sort((a, b) => (db.classes.find((c) => c.id === a.classId)?.order ?? 99) - (db.classes.find((c) => c.id === b.classId)?.order ?? 99) || a.lastName.localeCompare(b.lastName));
  }, [db, q, f.status, f.classId, f.gender, f.fee, f.docs, term.id]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const exportCols = [
    { key: 'regNo', label: 'Reg. No' },
    { key: 'name', label: 'Name' },
    { key: 'gender', label: 'Sex' },
    { key: 'age', label: 'Age' },
    { key: 'className', label: 'Class' },
    { key: 'guardian', label: 'Parent / Guardian' },
    { key: 'phone', label: 'Phone' },
  ];
  const exportRows = () => rows.map((s) => {
    const g = db.guardians.find((x) => x.id === s.guardianIds[0]);
    return { regNo: s.regNo, name: fullName(s), gender: s.gender, age: age(s.dob), className: className(s.classId), guardian: g?.name || '', phone: g?.phone || '' };
  });
  const title = `Student List${f.classId ? ` - ${className(f.classId)}` : ''}`;

  const doMove = () => {
    const cls = db.classes.find((c) => c.id === moveTo);
    api.mutate((d) => {
      d.students.forEach((s) => {
        if (!selected.includes(s.id)) return;
        s.classId = moveTo;
        s.enrollments = { ...s.enrollments, [d.settings.currentSessionId]: moveTo };
        s.history.push({ sessionId: d.settings.currentSessionId, classId: moveTo, action: 'reallocated', date: today() });
      });
      return d;
    });
    api.log('Reallocated pupils', `${selected.length} pupil(s) to ${cls.name}`);
    notify(`${selected.length} pupil(s) moved to ${cls.name}.`);
    setSelected([]);
    setMoveTo(null);
  };

  return (
    <>
      {toast}
      <PageHeader
        title="Students"
        subtitle={`${db.students.filter((s) => s.status === 'active').length} active pupils · ${term.label}`}
        actions={can(user, 'students.edit') && <Link to="/students/new"><Button icon={UserPlus}>Admit pupil</Button></Link>}
      />
      <Card bodyClass="">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput value={q} onChange={setQ} placeholder="Name, reg. no, parent or phone…" className="sm:col-span-2" />
          <Select value={f.classId} onChange={(e) => setF('class', e.target.value)} placeholder="All classes" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
          <Select value={f.gender} onChange={(e) => setF('gender', e.target.value)} placeholder="Boys & girls" options={[{ value: 'M', label: 'Boys' }, { value: 'F', label: 'Girls' }]} />
          <Select value={f.status} onChange={(e) => setF('status', e.target.value === 'active' ? '' : e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'graduated', label: 'Graduated' }, { value: 'transferred', label: 'Transferred' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'all', label: 'All statuses' }]} />
          {showFees ? (
            <Select value={f.fee} onChange={(e) => setF('fee', e.target.value)} placeholder="Any fee status" options={[{ value: 'paid', label: 'Fully paid (term)' }, { value: 'partial', label: 'Part paid (term)' }, { value: 'unpaid', label: 'Nothing paid (term)' }, { value: 'owing', label: 'Owing incl. arrears' }]} />
          ) : (
            <Select value={f.docs} onChange={(e) => setF('docs', e.target.value)} placeholder="Any documents" options={[{ value: 'missing', label: 'Missing documents' }]} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm text-slate-500">{rows.length} pupil{rows.length === 1 ? '' : 's'}{selected.length ? ` · ${selected.length} selected` : ''}</p>
          <div className="flex flex-wrap gap-2">
            {can(user, 'students.edit') && selected.length > 0 && <Button size="sm" icon={ArrowRightLeft} onClick={() => setMoveTo('')}>Allocate to class</Button>}
            <ExportButtons
              onPdf={() => exportTablePDF({ school: db.school, title, subtitle: `${rows.length} pupils · ${term.label}`, columns: exportCols, rows: exportRows() })}
              onExcel={() => exportExcel({ title, columns: exportCols, rows: exportRows() })}
            />
          </div>
        </div>
        <DataTable
          rows={rows}
          pageSize={20}
          onRowClick={(s) => nav(`/students/${s.id}`)}
          columns={[
            ...(can(user, 'students.edit') ? [{
              key: 'sel',
              label: <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))} />,
              render: (s) => <input type="checkbox" aria-label={`Select ${fullName(s)}`} checked={selected.includes(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(s.id)} />,
            }] : []),
            { key: 'name', label: 'Pupil', render: (s) => (
              <div className="flex items-center gap-3">
                <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photo} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{fullName(s)}</p>
                  <p className="font-mono text-xs text-slate-500">{s.regNo}</p>
                </div>
              </div>
            ) },
            { key: 'class', label: 'Class', render: (s) => className(s.classId) },
            { key: 'gender', label: 'Sex', render: (s) => (s.gender === 'M' ? 'Boy' : 'Girl') },
            { key: 'age', label: 'Age', render: (s) => age(s.dob) },
            { key: 'guardian', label: 'Parent / Guardian', render: (s) => { const g = db.guardians.find((x) => x.id === s.guardianIds[0]); return g ? <div><p>{g.name}</p><p className="text-xs text-slate-500">{g.phone}</p></div> : '—'; } },
            ...(showFees ? [
              { key: 'fee', label: 'Term fees', render: (s) => <FeeBadge state={s.fee.state} /> },
              { key: 'due', label: 'Owing', align: 'right', render: (s) => (s.fee.totalDue ? <span className="font-semibold text-rose-600">{money(s.fee.totalDue, '')}</span> : '—') },
            ] : []),
            { key: 'status', label: 'Status', render: (s) => (
              <div className="flex flex-wrap gap-1">
                <Badge tone={STUDENT_STATUS[s.status][0]}>{STUDENT_STATUS[s.status][1]}</Badge>
                {s.status === 'active' && s.missingDocs.length > 0 && <Badge tone="amber" className="hidden xl:inline-flex">{s.missingDocs.length} doc{s.missingDocs.length > 1 ? 's' : ''} missing</Badge>}
              </div>
            ) },
          ]}
        />
      </Card>
      <Modal open={moveTo !== null} onClose={() => setMoveTo(null)} title="Allocate to class" size="sm" footer={<><Button variant="secondary" onClick={() => setMoveTo(null)}>Cancel</Button><Button onClick={doMove} disabled={!moveTo}>Move {selected.length} pupil(s)</Button></>}>
        <Field label="Target class" hint="Changes the class for the current session. Use Promotion & Exits for end-of-year promotion.">
          <Select value={moveTo || ''} onChange={(e) => setMoveTo(e.target.value)} placeholder="— Choose class —" options={classes.map((c) => ({ value: c.id, label: `${c.name} (${db.students.filter((s) => s.status === 'active' && s.classId === c.id).length}/${c.capacity})` }))} />
        </Field>
      </Modal>
    </>
  );
}
