import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Download, Eye, FileUp, History, Pencil, Receipt, ShieldCheck, ShoppingBag, Trash2, BookOpen, Wallet, Users, IdCard, FileText } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { allTerms, billLines, currentTerm, feeStatus, termPaid, termsUpTo, yearStatus } from '../lib/finance';
import { downloadReceipt, downloadReportCards } from '../lib/documents';
import { OPTIONAL_DOCS, REQUIRED_DOCS, STUDENT_STATUS, age, feeTypeLabel, fmtDate, fullName, methodLabel, money, readFileAsDataURL, uid } from '../lib/utils';
import { Avatar, Badge, Button, Card, DataTable, Empty, FeeBadge, Field, Info, PageHeader, Select, StatCard, Tabs, useToast } from '../components/ui';

export default function StudentDetail() {
  const { id } = useParams();
  const { db, user } = useStore();
  const loc = useLocation();
  const [tab, setTab] = useState('bio');
  const [toast, notify] = useToast();
  const found = db.students.find((x) => x.id === id);
  // Teachers may only open pupils in the class they are assigned to.
  const s = user.role === 'teacher' && found && db.classes.find((c) => c.id === found.classId)?.teacherId !== user.staffId ? null : found;
  if (!s) return <Empty title="Pupil not found" action={<Link to={user.role === 'teacher' ? '/my-class' : '/students'}><Button>Back</Button></Link>} />;
  const cls = db.classes.find((c) => c.id === s.classId);
  const showFees = can(user, 'fees.view');
  const term = currentTerm(db);
  const fee = feeStatus(db, s, term.id);
  const year = yearStatus(db, s);
  const missing = REQUIRED_DOCS.filter((d) => !s.documents.some((x) => x.name === d));

  const tabs = [
    { id: 'bio', label: 'Biodata', icon: IdCard },
    { id: 'guardians', label: 'Parents', icon: Users, count: s.guardianIds.length },
    ...(showFees ? [{ id: 'fees', label: 'Fees', icon: Wallet }] : []),
    { id: 'academics', label: 'Academic records', icon: BookOpen },
    { id: 'docs', label: 'Documents', icon: FileText, count: s.documents.length },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <>
      {toast}
      {loc.state?.flash && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{loc.state.flash}</div>}
      <PageHeader
        title={fullName(s)}
        subtitle={<span className="font-mono">{s.regNo}</span>}
        actions={<>
          {showFees && s.status === 'active' && <Link to={`/fees?student=${s.id}`}><Button variant="secondary" icon={Receipt}>Record payment</Button></Link>}
          {can(user, 'students.edit') && <Link to={`/students/${s.id}/edit`}><Button icon={Pencil}>Edit</Button></Link>}
        </>}
      />
      <div className="card mb-6 flex flex-wrap items-center gap-5 p-5">
        <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photo} size="lg" />
        <dl className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Info label="Class">{cls?.name}</Info>
          <Info label="Status"><Badge tone={STUDENT_STATUS[s.status][0]}>{STUDENT_STATUS[s.status][1]}</Badge></Info>
          <Info label="Sex / Age">{s.gender === 'M' ? 'Male' : 'Female'} · {age(s.dob)} yrs</Info>
          <Info label="Admitted">{fmtDate(s.admissionDate)}</Info>
          <Info label="Fee category">{db.categories.find((c) => c.id === s.category)?.name}</Info>
          <Info label="Documents">{missing.length ? <Badge tone="amber">{missing.length} missing</Badge> : <Badge tone="green">Complete</Badge>}</Info>
        </dl>
      </div>
      {showFees && s.status === 'active' && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label={`Billed · ${term.name}`} value={money(fee.billed, db.school.currency)} icon={Wallet} />
          <StatCard label="Paid this year" value={money(year.paid, db.school.currency)} tone="green" hint={`of ${money(year.billed, '')} for the year`} />
          <StatCard label="Left for the year" value={money(year.totalLeft, db.school.currency)} tone={year.totalLeft ? 'red' : 'green'} hint={year.arrears ? `incl. ${money(year.arrears, '')} from earlier years` : <FeeBadge state={fee.state} />} />
          <StatCard label="Term balance" value={money(fee.balance, db.school.currency)} tone="amber" />
          <StatCard label="Arrears (earlier terms)" value={money(fee.arrears, db.school.currency)} tone="red" />
        </div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'bio' && <Bio s={s} />}
      {tab === 'guardians' && <Guardians s={s} />}
      {tab === 'fees' && <Fees s={s} />}
      {tab === 'academics' && <Academic s={s} />}
      {tab === 'docs' && <Docs s={s} notify={notify} />}
      {tab === 'history' && <Timeline s={s} />}
    </>
  );
}

function Bio({ s }) {
  return (
    <Card>
      <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="First name">{s.firstName}</Info>
        <Info label="Other names">{s.otherNames}</Info>
        <Info label="Surname">{s.lastName}</Info>
        <Info label="Date of birth">{fmtDate(s.dob)}</Info>
        <Info label="Place of birth">{s.placeOfBirth}</Info>
        <Info label="Nationality">{s.nationality}</Info>
        <Info label="Religion">{s.religion}</Info>
        <Info label="Blood group">{s.bloodGroup}</Info>
        <Info label="Home address">{s.address}</Info>
        <Info label="Allergies">{s.allergies || 'None recorded'}</Info>
        <Info label="Medical notes">{s.medicalNotes || 'None recorded'}</Info>
        <Info label="Previous school">{s.previousSchool}</Info>
        {s.exitDate && <Info label="Exit date">{fmtDate(s.exitDate)}</Info>}
        {s.exitNote && <Info label="Exit note">{s.exitNote}</Info>}
        {s.notes && <Info label="Notes">{s.notes}</Info>}
      </dl>
    </Card>
  );
}

function Guardians({ s }) {
  const { db } = useStore();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {s.guardianIds.map((gid) => {
        const g = db.guardians.find((x) => x.id === gid);
        if (!g) return null;
        const siblings = db.students.filter((x) => x.id !== s.id && x.guardianIds.includes(gid));
        const portal = db.users.find((u) => u.guardianId === gid);
        return (
          <Card key={gid} title={g.name} actions={<Badge tone="blue">{g.relationship}</Badge>}>
            <dl className="grid grid-cols-2 gap-4">
              <Info label="Phone">{g.phone}</Info>
              <Info label="Alt. phone">{g.altPhone}</Info>
              <Info label="Email">{g.email}</Info>
              <Info label="Occupation">{g.occupation}</Info>
              <Info label="Address">{g.address}</Info>
              <Info label="Parent portal">{portal ? <Badge tone="green">@{portal.username}</Badge> : <Badge>No account</Badge>}</Info>
            </dl>
            {siblings.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="label">Siblings in school</p>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((x) => <Link key={x.id} to={`/students/${x.id}`} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-brand-50">{x.firstName} {x.lastName}</Link>)}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Fees({ s }) {
  const { db } = useStore();
  const terms = termsUpTo(db, db.settings.currentTermId).filter((t) => billLines(db, s, t.id).length);
  const payments = db.payments.filter((p) => p.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-6">
      <Card title="Fee statement by term" bodyClass="">
        <DataTable
          rows={terms.map((t) => {
            const billed = billLines(db, s, t.id).reduce((x, l) => x + l.amount, 0);
            const paid = termPaid(db, s.id, t.id);
            return { id: t.id, term: t.label, billed, paid, balance: Math.max(0, billed - paid), lines: billLines(db, s, t.id) };
          }).reverse()}
          columns={[
            { key: 'term', label: 'Term', render: (r) => <div><p className="font-semibold text-slate-800">{r.term}</p><p className="text-xs text-slate-500">{r.lines.map((l) => `${feeTypeLabel(l.feeType)} ${money(l.amount, '')}`).join(' · ')}</p></div> },
            { key: 'billed', label: 'Billed', align: 'right', render: (r) => money(r.billed, '') },
            { key: 'paid', label: 'Paid', align: 'right', render: (r) => money(r.paid, '') },
            { key: 'balance', label: 'Balance', align: 'right', render: (r) => (r.balance ? <span className="font-semibold text-rose-600">{money(r.balance, '')}</span> : <Badge tone="green">Cleared</Badge>) },
          ]}
        />
      </Card>
      <Card title="Payment history" bodyClass="">
        <DataTable
          rows={payments}
          empty={<Empty title="No payments yet" />}
          columns={[
            { key: 'receiptNo', label: 'Receipt', render: (p) => <span className="font-mono text-xs">{p.receiptNo}</span> },
            { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
            { key: 'term', label: 'Term', render: (p) => allTerms(db).find((t) => t.id === p.termId)?.label },
            { key: 'method', label: 'Method', render: (p) => `${methodLabel(p.method)}${p.reference ? ` · ${p.reference}` : ''}` },
            { key: 'amount', label: 'Amount', align: 'right', render: (p) => <span className="font-semibold">{money(p.amount, '')}</span> },
            { key: 'r', label: '', align: 'right', render: (p) => <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadReceipt(db, p)}>Receipt</Button> },
          ]}
        />
      </Card>
    </div>
  );
}

function Academic({ s }) {
  const { db } = useStore();
  const records = db.academicRecords.filter((r) => r.studentId === s.id).sort((a, b) => b.termId.localeCompare(a.termId));
  return (
    <Card title="Term results" bodyClass="">
      <DataTable
        rows={records}
        empty={<Empty title="No results recorded yet" message="Class teachers enter marks by subject under Term Results." />}
        columns={[
          { key: 'term', label: 'Term', render: (r) => allTerms(db).find((t) => t.id === r.termId)?.label },
          { key: 'class', label: 'Class', render: (r) => db.classes.find((c) => c.id === r.classId)?.name },
          { key: 'average', label: 'Average /20', align: 'right', render: (r) => <span className={`font-bold ${r.average >= 10 ? 'text-emerald-700' : 'text-rose-600'}`}>{Number(r.average).toFixed(2)}</span> },
          { key: 'position', label: 'Position', align: 'right', render: (r) => (r.position ? `${r.position} / ${r.outOf}` : '—') },
          { key: 'attendance', label: 'Attendance', align: 'right', render: (r) => (r.daysOpen ? `${r.attendance} / ${r.daysOpen}` : '—') },
          { key: 'conduct', label: 'Conduct' },
          { key: 'remark', label: "Teacher's remark", className: 'max-w-sm text-slate-600' },
          { key: 'card', label: '', align: 'right', render: (r) => <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadReportCards(db, [r], `Report card - ${fullName(s)} - ${allTerms(db).find((t) => t.id === r.termId)?.label}`)}>Report card</Button> },
        ]}
      />
    </Card>
  );
}

function Docs({ s, notify }) {
  const { db, api, user } = useStore();
  const [docName, setDocName] = useState(REQUIRED_DOCS.find((d) => !s.documents.some((x) => x.name === d)) || 'Other');
  const edit = can(user, 'students.edit');
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/pdf|image\//.test(f.type)) return notify('Upload a PDF or an image.');
    if (f.size > 1_500_000) return notify('Each document must be under 1.5 MB.');
    const doc = { id: uid('doc'), name: docName, fileName: f.name, size: f.size, uploadedAt: new Date().toISOString(), verified: false, dataUrl: await readFileAsDataURL(f) };
    api.update('students', s.id, (cur) => ({ documents: [...cur.documents.filter((d) => d.name !== docName || docName === 'Other'), doc] }));
    api.log('Uploaded document', `${docName} for ${s.regNo}`);
    notify(`${docName} uploaded.`);
  };
  const setVerified = (d, verified) => {
    api.update('students', s.id, (cur) => ({ documents: cur.documents.map((x) => (x.id === d.id ? { ...x, verified, verifiedBy: user.name } : x)) }));
    api.log(verified ? 'Verified document' : 'Unverified document', `${d.name} for ${s.regNo}`);
  };
  const open = (d) => {
    if (!d.dataUrl) return notify('This record was imported without a scanned copy.');
    const w = window.open();
    if (w) w.document.write(`<title>${d.name}</title><iframe src="${d.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card title="Uploaded documents" bodyClass="">
        <DataTable
          rows={s.documents}
          empty={<Empty title="No documents uploaded" />}
          columns={[
            { key: 'name', label: 'Document', render: (d) => <div><p className="font-semibold text-slate-800">{d.name}</p><p className="text-xs text-slate-500">{d.fileName} · {Math.round(d.size / 1024)} KB</p></div> },
            { key: 'uploadedAt', label: 'Uploaded', render: (d) => fmtDate(d.uploadedAt) },
            { key: 'verified', label: 'Validation', render: (d) => (d.verified ? <Badge tone="green">Verified{d.verifiedBy ? ` · ${d.verifiedBy}` : ''}</Badge> : <Badge tone="amber">Pending check</Badge>) },
            { key: 'a', label: '', align: 'right', render: (d) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={Eye} onClick={() => open(d)} aria-label="View" />
                {edit && <Button size="sm" variant="ghost" icon={ShieldCheck} onClick={() => setVerified(d, !d.verified)}>{d.verified ? 'Unverify' : 'Verify'}</Button>}
                {edit && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { api.update('students', s.id, (cur) => ({ documents: cur.documents.filter((x) => x.id !== d.id) })); api.log('Removed document', `${d.name} for ${s.regNo}`); }} aria-label="Delete" />}
              </div>
            ) },
          ]}
        />
      </Card>
      <Card title="Checklist" className="h-fit">
        <ul className="space-y-2 text-sm">
          {REQUIRED_DOCS.map((d) => {
            const doc = s.documents.find((x) => x.name === d);
            return <li key={d} className="flex items-center justify-between"><span>{d}</span>{!doc ? <Badge tone="red">Missing</Badge> : doc.verified ? <Badge tone="green">OK</Badge> : <Badge tone="amber">Unverified</Badge>}</li>;
          })}
        </ul>
        {edit && (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <Field label="Upload document"><Select value={docName} onChange={(e) => setDocName(e.target.value)} options={[...REQUIRED_DOCS, ...OPTIONAL_DOCS]} /></Field>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <FileUp className="size-4" /> Choose file
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={upload} />
            </label>
          </div>
        )}
      </Card>
    </div>
  );
}

function Purchases({ s }) {
  const { db } = useStore();
  const sales = db.sales.filter((x) => x.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card title="Uniforms & materials purchased" bodyClass="">
      <DataTable
        rows={sales}
        empty={<Empty title="No purchases" />}
        columns={[
          { key: 'saleNo', label: 'Sale No', render: (x) => <span className="font-mono text-xs">{x.saleNo}</span> },
          { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
          { key: 'items', label: 'Items', render: (x) => x.items.map((i) => `${i.qty}× ${i.name}`).join(', ') },
          { key: 'method', label: 'Paid by', render: (x) => methodLabel(x.method) },
          { key: 'total', label: 'Total', align: 'right', render: (x) => <span className="font-semibold">{money(x.total, '')}</span> },
        ]}
      />
    </Card>
  );
}

const ACTION_TONES = { admitted: 'green', enrolled: 'blue', promoted: 'green', repeated: 'amber', graduated: 'blue', transferred: 'purple', withdrawn: 'slate', reallocated: 'slate' };

function Timeline({ s }) {
  const { db } = useStore();
  const items = [...s.history].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card title="Enrolment history">
      <ol className="relative space-y-5 border-l-2 border-slate-200 pl-6">
        {items.map((h, i) => (
          <li key={i} className="relative">
            <span className="absolute top-1 -left-[31px] size-3.5 rounded-full border-2 border-white bg-brand-600" />
            <p className="text-sm font-semibold text-slate-800"><Badge tone={ACTION_TONES[h.action]} className="mr-2 capitalize">{h.action}</Badge>{db.classes.find((c) => c.id === h.classId)?.name} · {db.sessions.find((x) => x.id === h.sessionId)?.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{fmtDate(h.date)}{h.note ? ` · ${h.note}` : ''}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
