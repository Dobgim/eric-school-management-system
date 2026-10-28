import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CalendarCheck, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, PackageX, TrendingDown, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentSession, currentTerm, feeStatus, payrollTotals } from '../lib/finance';
import { classSubjects } from '../lib/subjects';
import { fmtDate, fullName, methodLabel, money, monthLabel, num, sum, thisMonth, today } from '../lib/utils';
import { Badge, Card, DataTable, PageHeader, StatCard } from '../components/ui';
import { BarChart, Donut, HBarChart, Progress } from '../components/Charts';

const METHOD_COLORS = { cash: '#3f7356', mtn: '#e2b23b', orange: '#c9662a', bank: '#48433a' };
const weekday = () => ![0, 6].includes(new Date().getDay());

/**
 * The office dashboards. Each role sees what it works on every day:
 * - Proprietor (super admin): the whole school at a glance — money in and out, pupils, attendance, results, and decisions waiting.
 * - Bursar: collections, debts, payments to verify, salaries, spending and stock.
 * - Secretary (admin): admissions, sign-ups, daily registers, pupils and the calendar.
 */
export default function Dashboard() {
  const { user } = useStore();
  if (user.role === 'bursar') return <BursarDashboard />;
  if (user.role === 'admin') return <OfficeDashboard />;
  return <OwnerDashboard />;
}

// ---------- Shared figures ----------

function useFigures() {
  const { db } = useStore();
  const term = currentTerm(db);
  const session = currentSession(db);
  return useMemo(() => {
    const active = db.students.filter((s) => s.status === 'active');
    const statuses = active.map((s) => ({ s, ...feeStatus(db, s, term.id) }));
    const termPayments = db.payments.filter((p) => p.termId === term.id);
    const collected = sum(termPayments, (p) => p.amount);
    const billed = sum(statuses, (x) => x.billed);
    const outstanding = sum(statuses, (x) => x.totalDue);
    const debtors = statuses.filter((x) => x.totalDue > 0);
    const completed = statuses.filter((x) => x.billed > 0 && x.paid >= x.billed).length;
    const months = [];
    const start = new Date(session?.start || today());
    start.setMonth(start.getMonth() - 1); // fees are often paid in the month before resumption
    const end = new Date(Math.min(new Date(session?.end || today()).getTime(), Date.now()));
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    const monthly = months.map((m) => ({ label: monthLabel(m).slice(0, 3), value: sum(db.payments.filter((p) => p.date.startsWith(m)), (p) => p.amount) }));
    const methods = ['cash', 'mtn', 'orange', 'bank'].map((m) => ({ label: methodLabel(m), value: sum(termPayments.filter((p) => p.method === m), (p) => p.amount), color: METHOD_COLORS[m] }));
    const enrolment = [...db.classes].sort((a, b) => a.order - b.order).map((c) => ({ label: c.name, value: active.filter((s) => s.classId === c.id).length }));
    const boys = active.filter((s) => s.gender === 'M').length;
    const latestRun = [...db.payrollRuns].sort((a, b) => b.month.localeCompare(a.month))[0];
    const month = thisMonth();
    const inMonth = (d) => (d || '').slice(0, 7) === month;
    const moneyIn = sum(db.payments.filter((p) => inMonth(p.date)), (p) => p.amount) + sum(db.sales.filter((s) => inMonth(s.date)), (s) => s.total);
    const moneyOut = sum((db.expenses || []).filter((e) => inMonth(e.date)), (e) => e.amount) + sum(db.payrollRuns.flatMap((r) => r.items).filter((i) => i.paid && inMonth(i.paidDate)), (i) => i.net);
    const todayPaid = sum(db.payments.filter((p) => p.date === today()), (p) => p.amount);
    const recent = [...db.payments].sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo)).slice(0, 6);
    const events = db.calendarEvents.filter((e) => (e.endDate || e.date) >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    return { term, session, active, collected, billed, outstanding, debtors, completed, monthly, methods, enrolment, boys, girls: active.length - boys, latestRun, moneyIn, moneyOut, todayPaid, recent, events };
  }, [db, term, session]);
}

/** Today's register per class: taken or not, with absences. */
function useTodayAttendance() {
  const { db } = useStore();
  const day = today();
  return [...db.classes].sort((a, b) => a.order - b.order).map((c) => {
    const pupils = db.students.filter((s) => s.status === 'active' && s.classId === c.id).length;
    const reg = (db.attendance || []).find((a) => a.classId === c.id && a.date === day);
    return { c, pupils, taken: !!reg, absent: reg?.absent?.length || 0, late: reg?.late?.length || 0 };
  }).filter((r) => r.pupils > 0);
}

/** Things waiting for someone in the office to act on. */
function Attention({ items }) {
  const shown = items.filter((i) => i.count > 0);
  return (
    <Card title="Needs your attention" className="mb-6" bodyClass="">
      {shown.length ? (
        <ul className="divide-y divide-slate-100">
          {shown.map((i) => (
            <li key={i.label}>
              <Link to={i.to} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="flex items-center gap-3">
                  <span className={`grid min-w-8 place-items-center rounded-md px-2 py-1 text-sm font-bold ${i.tone === 'red' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{i.count}</span>
                  <span className="text-sm font-medium text-slate-800">{i.label}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="flex items-center gap-2 px-5 py-4 text-sm text-emerald-700"><CheckCircle2 className="size-4" />Nothing waiting. Everything is up to date.</p>}
    </Card>
  );
}

function AttendanceToday({ rows }) {
  const taken = rows.filter((r) => r.taken);
  return (
    <Card title="Today’s attendance" actions={<Link to="/attendance" className="text-sm font-semibold text-brand-700 hover:underline">Registers</Link>} bodyClass="">
      {!weekday() ? <p className="px-5 py-4 text-sm text-slate-500">No school today.</p> : !rows.length ? <p className="px-5 py-4 text-sm text-slate-500">No pupils yet.</p> : (
        <>
          <p className="px-5 pt-4 text-sm text-slate-600"><b className="text-slate-900">{taken.length} of {rows.length}</b> registers taken · <b className="text-rose-600">{sum(taken, (r) => r.absent)}</b> absent</p>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
            {rows.map((r) => (
              <li key={r.c.id} className="flex items-center justify-between px-5 py-2">
                <span>{r.c.name}</span>
                {r.taken ? <span className="flex gap-1">{r.absent ? <Badge tone="red">{r.absent} absent</Badge> : <Badge tone="green">All present</Badge>}{r.late > 0 && <Badge tone="amber">{r.late} late</Badge>}</span> : <Badge tone="slate">Not taken</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function MarksProgress() {
  const { db } = useStore();
  const termId = db.settings.currentTermId;
  const rows = [...db.classes].sort((a, b) => a.order - b.order).map((c) => {
    const subjects = classSubjects(c);
    const done = subjects.filter((s) => (db.marks || []).some((m) => m.classId === c.id && m.termId === termId && m.subject === s.name && Object.keys(m.marks || {}).length)).length;
    return { c, done, total: subjects.length };
  }).filter((r) => db.students.some((s) => s.status === 'active' && s.classId === r.c.id));
  return (
    <Card title="Marks entered this term" actions={<Link to="/academics" className="text-sm font-semibold text-brand-700 hover:underline">Marks</Link>}>
      {!rows.length ? <p className="text-sm text-slate-500">No pupils yet.</p> : (
        <ul className="space-y-2.5 text-sm">
          {rows.map((r) => (
            <li key={r.c.id}>
              <div className="flex justify-between"><span>{r.c.name}</span><span className="text-slate-500 tabular-nums">{r.done}/{r.total} subjects</span></div>
              <Progress value={r.done} max={r.total} tone={r.done === r.total ? 'bg-emerald-500' : 'bg-amber-500'} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentPayments({ f }) {
  const { db } = useStore();
  return (
    <Card title="Recent payments" bodyClass="" actions={<Link to="/fees" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>}>
      <DataTable pageSize={6} rows={f.recent} columns={[
        { key: 'receiptNo', label: 'Receipt', render: (p) => <span className="font-mono text-xs">{p.receiptNo}</span> },
        { key: 'student', label: 'Pupil', render: (p) => fullName(db.students.find((s) => s.id === p.studentId)) },
        { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
        { key: 'method', label: 'Method', render: (p) => methodLabel(p.method) },
        { key: 'amount', label: 'Amount', align: 'right', render: (p) => money(p.amount, '') },
      ]} />
    </Card>
  );
}

function Events({ f }) {
  return (
    <Card title="Upcoming events" actions={<CalendarDays className="size-4 text-slate-400" />}>
      {f.events.length ? (
        <ul className="space-y-3">
          {f.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-brand-50 py-1 text-center text-brand-800">
                <span className="text-[10px] font-bold uppercase">{fmtDate(e.date).split(' ')[1]}</span>
                <span className="text-lg leading-none font-bold">{new Date(e.date).getDate()}</span>
              </div>
              <div className="min-w-0 text-sm"><p className="font-semibold text-slate-800">{e.title}</p><p className="text-xs text-slate-500">{e.endDate ? `until ${fmtDate(e.endDate)}` : ''}</p></div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">No upcoming events.</p>}
    </Card>
  );
}

function PayrollStatus({ run }) {
  const { db } = useStore();
  if (!run) return null;
  const rt = payrollTotals(run);
  return (
    <Card title={`Staff payment status — ${monthLabel(run.month)}`} actions={<Link to="/payroll" className="text-sm font-semibold text-brand-700 hover:underline">Payroll</Link>}>
      <div className="flex items-baseline justify-between text-sm"><span className="text-slate-500">Paid</span><span className="font-bold tabular-nums">{money(rt.paid, '')} / {money(rt.net, '')}</span></div>
      <div className="mt-2"><Progress value={rt.paid} max={rt.net} tone="bg-emerald-500" /></div>
      <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
        {run.items.map((i) => {
          const s = db.staff.find((x) => x.id === i.staffId);
          return <li key={i.staffId} className="flex items-center justify-between gap-2"><span className="truncate text-slate-700">{s ? `${s.firstName} ${s.lastName}` : '—'}</span>{i.paid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Pending</Badge>}</li>;
        })}
      </ul>
    </Card>
  );
}

const backupDue = (db) => {
  const last = db.activityLog.find((l) => /backup/i.test(l.action));
  return !last || Date.now() - new Date(last.at).getTime() > 30 * 24 * 3600 * 1000;
};

// ---------- Proprietor ----------

function OwnerDashboard() {
  const { db, user } = useStore();
  const f = useFigures();
  const attendance = useTodayAttendance();
  const cur = db.school.currency;
  const staff = db.staff.filter((s) => s.status === 'active');
  const items = [
    { label: 'Teachers waiting for confirmation', count: db.staff.filter((s) => s.teachingRequest).length, to: '/signups' },
    { label: 'Sign-ups to approve', count: db.users.filter((u) => u.status === 'pending' && !u.signup?.teacher).length, to: '/signups' },
    { label: 'Admission applications to review', count: db.admissionApplications.filter((a) => a.status === 'pending').length, to: '/admissions' },
    { label: 'Parent payments to verify', count: db.paymentRequests.filter((r) => r.status === 'pending').length, to: '/fees/online', tone: 'red' },
    { label: 'Class registers not taken today', count: weekday() ? attendance.filter((r) => !r.taken).length : 0, to: '/attendance' },
    { label: 'Monthly backup due: download one now', count: backupDue(db) ? 1 : 0, to: '/school' },
  ];
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`${f.term.label} · ${fmtDate(f.term.start)} – ${fmtDate(f.term.end)}`} />
      <Attention items={items} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Pupils" value={num(f.active.length)} icon={GraduationCap} hint={`${f.boys} boys · ${f.girls} girls`} />
        <StatCard label="Staff" value={num(staff.length)} icon={UserRound} tone="purple" hint={`${staff.filter((s) => s.category === 'teaching').length} teaching`} />
        <StatCard label="Fees collected (term)" value={money(f.collected, cur)} icon={Banknote} tone="green" hint={`${f.billed ? Math.round((f.collected / f.billed) * 100) : 0}% of ${money(f.billed, cur)}`} />
        <StatCard label="Outstanding debts" value={money(f.outstanding, cur)} icon={AlertTriangle} tone="red" hint={`${f.debtors.length} pupils owing`} />
        <StatCard label="Balance this month" value={money(f.moneyIn - f.moneyOut, cur)} icon={TrendingDown} tone={f.moneyIn >= f.moneyOut ? 'blue' : 'red'} hint={`In ${money(f.moneyIn, '')} · out ${money(f.moneyOut, '')}`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Fee collections by month" className="xl:col-span-2" actions={<Link to="/expenses" className="text-sm font-semibold text-brand-700 hover:underline">Cash flow</Link>}><BarChart data={f.monthly} format={(v) => money(v, cur)} /></Card>
        <AttendanceToday rows={attendance} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <MarksProgress />
        <Card title="Fees this term">
          <Donut data={[{ label: 'Completed', value: f.completed, color: '#3f7356' }, { label: 'Still owing', value: f.debtors.length, color: '#b1402f' }]} center={{ value: f.completed, label: 'completed' }} />
          <div className="mt-3 flex justify-between text-sm"><Link to="/fees/completed" className="font-semibold text-brand-700 hover:underline">Completed</Link><Link to="/fees/not-completed" className="font-semibold text-brand-700 hover:underline">Not completed</Link></div>
        </Card>
        <PayrollStatus run={f.latestRun} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><RecentPayments f={f} /></div>
        <Events f={f} />
      </div>
    </>
  );
}

// ---------- Bursar ----------

function BursarDashboard() {
  const { db, user } = useStore();
  const f = useFigures();
  const cur = db.school.currency;
  const run = f.latestRun;
  const lowStock = db.inventory.filter((i) => i.quantity <= i.reorderLevel);
  const items = [
    { label: 'Parent payments to verify', count: db.paymentRequests.filter((r) => r.status === 'pending').length, to: '/fees/online', tone: 'red' },
    { label: run ? `Salaries not yet paid for ${monthLabel(run.month)}` : 'Salaries not yet paid', count: run ? run.items.filter((i) => !i.paid).length : 0, to: '/payroll' },
    { label: 'Items low in stock', count: lowStock.length, to: '/inventory' },
  ];
  const top = [...f.debtors].sort((a, b) => b.totalDue - a.totalDue).slice(0, 6);
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`Finance · ${f.term.label}`} />
      <Attention items={items} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Collected today" value={money(f.todayPaid, cur)} icon={Banknote} tone="green" />
        <StatCard label="Fees collected (term)" value={money(f.collected, cur)} icon={Banknote} tone="green" hint={`${f.billed ? Math.round((f.collected / f.billed) * 100) : 0}% of ${money(f.billed, cur)}`} />
        <StatCard label="Outstanding debts" value={money(f.outstanding, cur)} icon={AlertTriangle} tone="red" hint={`${f.debtors.length} pupils owing`} />
        <StatCard label="Spent this month" value={money(f.moneyOut, cur)} icon={TrendingDown} tone="amber" hint="Expenses and salaries" />
        <StatCard label="Fees completed" value={`${f.completed} / ${f.completed + f.debtors.length}`} icon={CheckCircle2} tone="blue" hint="pupils, this term" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Fee collections by month" className="xl:col-span-2" actions={<Link to="/fees" className="text-sm font-semibold text-brand-700 hover:underline">Record payment</Link>}><BarChart data={f.monthly} format={(v) => money(v, cur)} /></Card>
        <Card title="Payment methods (this term)"><Donut data={f.methods} format={(v) => money(v, '')} /></Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Largest balances" bodyClass="" actions={<Link to="/fees/not-completed" className="text-sm font-semibold text-brand-700 hover:underline">All</Link>}>
          {top.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {top.map((x) => <li key={x.s.id} className="flex justify-between gap-2 px-5 py-2.5"><span className="truncate">{fullName(x.s)}</span><b className="text-rose-600 tabular-nums">{money(x.totalDue, '')}</b></li>)}
            </ul>
          ) : <p className="px-5 py-4 text-sm text-emerald-700">No pupil owes anything.</p>}
        </Card>
        <PayrollStatus run={run} />
        <Card title="Low-stock alerts" actions={<PackageX className="size-4 text-rose-500" />}>
          {lowStock.length ? (
            <ul className="space-y-2 text-sm">{lowStock.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><span className="truncate text-slate-700">{i.name}{i.size !== '—' ? ` (${i.size})` : ''}</span><Badge tone={i.quantity === 0 ? 'red' : 'amber'}>{i.quantity} left</Badge></li>)}</ul>
          ) : <p className="text-sm text-slate-500">All items are above their reorder level.</p>}
          <Link to="/inventory" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">Manage stock</Link>
        </Card>
      </div>
      <div className="mt-6"><RecentPayments f={f} /></div>
    </>
  );
}

// ---------- Secretary ----------

function OfficeDashboard() {
  const { db, user } = useStore();
  const f = useFigures();
  const attendance = useTodayAttendance();
  const absentToday = sum(attendance.filter((r) => r.taken), (r) => r.absent);
  const newThisTerm = f.active.filter((s) => (s.admissionDate || '') >= (f.term.start || '')).length;
  const items = [
    { label: 'Admission applications to review', count: db.admissionApplications.filter((a) => a.status === 'pending').length, to: '/admissions', tone: 'red' },
    { label: 'Parent sign-ups to approve', count: db.users.filter((u) => u.status === 'pending' && u.requestedRole === 'parent').length, to: '/signups' },
    { label: 'Teachers waiting for confirmation', count: db.staff.filter((s) => s.teachingRequest).length, to: '/signups' },
    { label: 'Class registers not taken today', count: weekday() ? attendance.filter((r) => !r.taken).length : 0, to: '/attendance' },
  ];
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`School office · ${f.term.label}`} />
      <Attention items={items} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Pupils" value={num(f.active.length)} icon={GraduationCap} hint={`${f.boys} boys · ${f.girls} girls`} />
        <StatCard label="New this term" value={num(newThisTerm)} icon={ClipboardList} tone="green" />
        <StatCard label="Absent today" value={num(absentToday)} icon={CalendarCheck} tone="red" hint={`${attendance.filter((r) => r.taken).length} of ${attendance.length} registers`} />
        <StatCard label="Staff" value={num(db.staff.filter((s) => s.status === 'active').length)} icon={UserRound} tone="purple" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <AttendanceToday rows={attendance} />
        <Card title="Enrolment by class"><HBarChart data={f.enrolment} /></Card>
        <Events f={f} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <MarksProgress />
        <Card title="Quick links" className="xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {[['/students/new', 'Admit a new pupil'], ['/students', 'Search students'], ['/attendance', 'Daily attendance'], ['/timetable', 'Timetable'], ['/announcements', 'Post an announcement'], ['/reports', 'Academic reports']].map(([to, l]) => (
              <Link key={to} to={to} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{l}<ArrowRight className="size-4" /></Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

