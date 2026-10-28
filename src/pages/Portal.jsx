import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Download, GraduationCap, ShoppingBag, Smartphone, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms, billLines, currentTerm, feeStatus, termPaid, termsUpTo } from '../lib/finance';
import { downloadReceipt, downloadReportCards } from '../lib/documents';
import { age, feeTypeLabel, fmtDate, fullName, methodLabel, money, today } from '../lib/utils';
import { Avatar, Badge, Button, Card, DataTable, Empty, FeeBadge, Info, PageHeader, Tabs } from '../components/ui';
import { Progress } from '../components/Charts';

export const myChildren = (db, user) =>
  db.students.filter((s) => s.guardianIds.includes(user.guardianId)).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1));

/** "My Children": one child at a time, with profile, fees, purchases and results tabs. */
export default function Portal() {
  const { db, user } = useStore();
  const [params, setParams] = useSearchParams();
  const kids = myChildren(db, user);
  const childId = kids.some((k) => k.id === params.get('child')) ? params.get('child') : kids[0]?.id;
  const tab = params.get('tab') || 'overview';
  const setParam = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };
  const setTab = (t) => setParam('tab', t);
  const child = kids.find((k) => k.id === childId);
  const owing = child && child.status === 'active' ? feeStatus(db, child).totalDue : 0;

  return (
    <>
      <PageHeader
        title="My Children"
        subtitle={`${kids.length} child${kids.length === 1 ? '' : 'ren'} at ${db.school.name}`}
        actions={owing > 0 && <Link to={`/portal/pay?child=${child.id}`}><Button icon={Smartphone}>Pay {money(owing, db.school.currency)} for {child.firstName}</Button></Link>}
      />
      {kids.length > 1 && (
        <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
          {kids.map((k) => (
            <button key={k.id} onClick={() => setParam('child', k.id)} className={`flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${k.id === childId ? 'border-brand-600 bg-white shadow-sm ring-2 ring-brand-600/15' : 'border-slate-200 bg-white/60 hover:bg-white'}`}>
              <Avatar name={`${k.firstName} ${k.lastName}`} src={k.photo} size="sm" />
              <div><p className="text-sm font-bold text-slate-800">{k.firstName} {k.lastName}</p><p className="text-xs text-slate-500">{db.classes.find((c) => c.id === k.classId)?.name}{k.status !== 'active' ? ` · ${k.status}` : ''}</p></div>
            </button>
          ))}
        </div>
      )}
      {!child ? <Empty title="No children linked to your account" message="Contact the school office." /> : (
        <>
          <Tabs tabs={[{ id: 'overview', label: 'Profile' }, { id: 'fees', label: 'Fees & receipts', icon: Wallet }, { id: 'purchases', label: 'Uniforms & materials', icon: ShoppingBag }, { id: 'results', label: 'Results', icon: GraduationCap }, { id: 'attendance', label: 'Attendance', icon: CalendarCheck }]} value={tab} onChange={setTab} />
          {tab === 'overview' && <Overview child={child} />}
          {tab === 'fees' && <Fees child={child} />}
          {tab === 'purchases' && <Purchases child={child} />}
          {tab === 'results' && <Results child={child} />}
          {tab === 'attendance' && <Attendance child={child} />}
        </>
      )}
    </>
  );
}

function Overview({ child }) {
  const { db } = useStore();
  const cls = db.classes.find((c) => c.id === child.classId);
  const teacher = db.staff.find((s) => s.id === cls?.teacherId);
  const st = feeStatus(db, child);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={`${child.firstName} ${child.lastName}`} src={child.photo} size="lg" />
          <div>
            <p className="text-xl font-bold text-slate-900">{fullName(child)}</p>
            <p className="font-mono text-sm text-slate-500">{child.regNo}</p>
          </div>
        </div>
        <dl className="grid gap-5 sm:grid-cols-3">
          <Info label="Class">{cls?.name}</Info>
          <Info label="Class teacher">{teacher ? `${teacher.gender === 'F' ? 'Mrs./Ms.' : 'Mr.'} ${teacher.firstName} ${teacher.lastName}` : '—'}</Info>
          <Info label="Teacher’s phone">{teacher?.phone}</Info>
          <Info label="Date of birth">{fmtDate(child.dob)} ({age(child.dob)} yrs)</Info>
          <Info label="Admitted">{fmtDate(child.admissionDate)}</Info>
          <Info label="Status"><Badge tone={child.status === 'active' ? 'green' : 'slate'} className="capitalize">{child.status}</Badge></Info>
          <Info label="Blood group">{child.bloodGroup}</Info>
          <Info label="Allergies">{child.allergies || 'None recorded'}</Info>
          <Info label="Medical notes">{child.medicalNotes || 'None recorded'}</Info>
        </dl>
      </Card>
      <Card title="This term’s fees">
        <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">Paid</span><span className="font-bold tabular-nums">{money(st.paid, '')} / {money(st.billed, '')}</span></div>
        <div className="mt-2"><Progress value={st.paid} max={st.billed} tone={st.state === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'} /></div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><FeeBadge state={st.state} /></dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Term balance</dt><dd className="font-semibold tabular-nums">{money(st.balance, db.school.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Arrears</dt><dd className="font-semibold text-rose-600 tabular-nums">{money(st.arrears, db.school.currency)}</dd></div>
          <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-semibold">Total owing</dt><dd className="font-bold tabular-nums">{money(st.totalDue, db.school.currency)}</dd></div>
        </dl>
      </Card>
    </div>
  );
}

function Fees({ child }) {
  const { db } = useStore();
  const terms = termsUpTo(db, db.settings.currentTermId).filter((t) => billLines(db, child, t.id).length).reverse();
  const payments = db.payments.filter((p) => p.studentId === child.id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Fee breakdown by term">
        <div className="space-y-5">
          {terms.map((t) => {
            const lines = billLines(db, child, t.id);
            const billed = lines.reduce((x, l) => x + l.amount, 0);
            const paid = termPaid(db, child.id, t.id);
            return (
              <div key={t.id}>
                <div className="flex items-center justify-between"><p className="font-bold text-slate-800">{t.label}</p><FeeBadge state={paid >= billed ? 'paid' : paid ? 'partial' : 'unpaid'} /></div>
                <ul className="mt-2 space-y-1 text-sm">
                  {lines.map((l) => <li key={l.feeType} className="flex justify-between text-slate-600"><span>{feeTypeLabel(l.feeType)}</span><span className="tabular-nums">{money(l.amount, '')}</span></li>)}
                  <li className="flex justify-between border-t border-slate-100 pt-1 font-semibold"><span>Paid {money(paid, '')} of {money(billed, '')}</span><span className={billed - paid > 0 ? 'text-rose-600 tabular-nums' : 'text-emerald-700 tabular-nums'}>{billed - paid > 0 ? `Balance ${money(billed - paid, '')}` : 'Cleared'}</span></li>
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Payment history & receipts" bodyClass="">
        <DataTable
          rows={payments}
          empty={<Empty title="No payments yet" />}
          columns={[
            { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
            { key: 'term', label: 'Term', render: (p) => allTerms(db).find((t) => t.id === p.termId)?.name },
            { key: 'method', label: 'Method', render: (p) => methodLabel(p.method) },
            { key: 'amount', label: 'Amount', align: 'right', render: (p) => <b>{money(p.amount, '')}</b> },
            { key: 'r', label: '', align: 'right', render: (p) => <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadReceipt(db, p)}>Receipt</Button> },
          ]}
        />
      </Card>
    </div>
  );
}

function Purchases({ child }) {
  const { db } = useStore();
  const sales = db.sales.filter((s) => s.studentId === child.id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card title="Uniforms & materials bought" bodyClass="">
      <DataTable
        rows={sales}
        empty={<Empty title="Nothing bought from the school store yet" />}
        columns={[
          { key: 'date', label: 'Date', render: (s) => fmtDate(s.date) },
          { key: 'items', label: 'Items', render: (s) => <ul>{s.items.map((i) => <li key={i.itemId}>{i.qty} × {i.name}</li>)}</ul> },
          { key: 'method', label: 'Paid by', render: (s) => methodLabel(s.method) },
          { key: 'total', label: 'Total', align: 'right', render: (s) => <b>{money(s.total, '')}</b> },
        ]}
      />
    </Card>
  );
}

function Results({ child }) {
  const { db } = useStore();
  const recs = db.academicRecords.filter((r) => r.studentId === child.id).sort((a, b) => b.termId.localeCompare(a.termId));
  return (
    <Card title="Term results" bodyClass="">
      <DataTable
        rows={recs}
        empty={<Empty title="No results published yet" />}
        columns={[
          { key: 'term', label: 'Term', render: (r) => allTerms(db).find((t) => t.id === r.termId)?.label },
          { key: 'class', label: 'Class', render: (r) => db.classes.find((c) => c.id === r.classId)?.name },
          { key: 'avg', label: 'Average', align: 'right', render: (r) => <b className={r.average >= 10 ? 'text-emerald-700' : 'text-rose-600'}>{Number(r.average).toFixed(2)}/20</b> },
          { key: 'pos', label: 'Position', align: 'right', render: (r) => `${r.position} of ${r.outOf}` },
          { key: 'conduct', label: 'Conduct' },
          { key: 'remark', label: 'Remark', className: 'text-slate-600' },
          { key: 'card', label: '', align: 'right', render: (r) => <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadReportCards(db, [r], `Report card - ${fullName(child)} - ${allTerms(db).find((t) => t.id === r.termId)?.label}`)}>Report card</Button> },
        ]}
      />
    </Card>
  );
}

/** Days the child was marked absent or late in the class register this term. */
function Attendance({ child }) {
  const { db } = useStore();
  const term = currentTerm(db);
  const days = (db.attendance || []).filter((a) => a.classId === child.classId && term && a.date >= term.start && (!term.end || a.date <= term.end)).sort((a, b) => b.date.localeCompare(a.date));
  const absent = days.filter((a) => (a.absent || []).includes(child.id));
  const late = days.filter((a) => (a.late || []).includes(child.id));
  return (
    <Card title={`Attendance · ${term?.label || ''}`}>
      {!days.length ? <Empty title="No register taken yet this term" message="The class teacher records attendance every school day." /> : (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-700">{days.length - absent.length}</p><p className="text-xs text-slate-600">days present</p></div>
            <div className="rounded-lg bg-rose-50 p-3"><p className="text-2xl font-bold text-rose-600">{absent.length}</p><p className="text-xs text-slate-600">days absent</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-2xl font-bold text-amber-700">{late.length}</p><p className="text-xs text-slate-600">days late</p></div>
          </div>
          {(absent.length > 0 || late.length > 0) && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {[...absent.map((a) => [a.date, 'Absent']), ...late.map((a) => [a.date, 'Late'])].sort((a, b) => b[0].localeCompare(a[0])).map(([d, k]) => (
                <li key={d + k} className="flex justify-between py-2"><span>{fmtDate(d)}</span><Badge tone={k === 'Absent' ? 'red' : 'amber'}>{k}</Badge></li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Out of {days.length} school days recorded so far this term.</p>
        </>
      )}
    </Card>
  );
}

export function Calendar() {
  const { db } = useStore();
  const events = [...db.calendarEvents].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card title="Academic calendar">
      <ul className="divide-y divide-slate-100">
        {events.map((e) => {
          const past = (e.endDate || e.date) < today();
          return (
            <li key={e.id} className={`flex items-center gap-4 py-3 ${past ? 'opacity-50' : ''}`}>
              <div className="w-28 shrink-0 text-sm font-semibold text-brand-800 tabular-nums">{fmtDate(e.date)}</div>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{e.title}</p>{e.endDate && <p className="text-xs text-slate-500">until {fmtDate(e.endDate)}</p>}</div>
              <Badge className="capitalize">{e.type}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
