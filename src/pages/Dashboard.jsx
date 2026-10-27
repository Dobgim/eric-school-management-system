import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CalendarDays, GraduationCap, PackageX, Receipt, UserRound, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { currentSession, currentTerm, feeStatus, payrollTotals } from '../lib/finance';
import { fmtDate, fullName, methodLabel, money, monthLabel, num, sum, today } from '../lib/utils';
import { Badge, Card, DataTable, PageHeader, StatCard } from '../components/ui';
import { BarChart, Donut, HBarChart, Progress } from '../components/Charts';

const METHOD_COLORS = { cash: '#16a34a', mtn: '#f5b800', orange: '#f97316', bank: '#1e46ed' };

export default function Dashboard() {
  const { db, user } = useStore();
  const term = currentTerm(db);
  const session = currentSession(db);
  const showMoney = can(user, 'fees.view');
  const cur = db.school.currency;

  const data = useMemo(() => {
    const active = db.students.filter((s) => s.status === 'active');
    const statuses = active.map((s) => ({ s, ...feeStatus(db, s, term.id) }));
    const termPayments = db.payments.filter((p) => p.termId === term.id);
    const collected = sum(termPayments, (p) => p.amount);
    const billed = sum(statuses, (x) => x.billed);
    const outstanding = sum(statuses, (x) => x.totalDue);
    const debtors = statuses.filter((x) => x.totalDue > 0).length;

    // Monthly collections across the current session up to today.
    const months = [];
    const start = new Date(session.start);
    start.setMonth(start.getMonth() - 1); // fees are often paid in the month before resumption
    const end = new Date(Math.min(new Date(session.end).getTime(), Date.now()));
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthly = months.map((m) => ({ label: monthLabel(m).slice(0, 3), value: sum(db.payments.filter((p) => p.date.startsWith(m)), (p) => p.amount) }));

    const methods = ['cash', 'mtn', 'orange', 'bank'].map((m) => ({ label: methodLabel(m), value: sum(termPayments.filter((p) => p.method === m), (p) => p.amount), color: METHOD_COLORS[m] }));
    const enrolment = [...db.classes].sort((a, b) => a.order - b.order).map((c) => ({ label: c.name, value: active.filter((s) => s.classId === c.id).length }));
    const boys = active.filter((s) => s.gender === 'M').length;

    const latestRun = [...db.payrollRuns].sort((a, b) => b.month.localeCompare(a.month))[0];
    const salaryPaidSession = sum(db.payrollRuns.filter((r) => r.month >= session.start.slice(0, 7)), (r) => payrollTotals(r).paid);
    const lowStock = db.inventory.filter((i) => i.quantity <= i.reorderLevel);
    const events = db.calendarEvents.filter((e) => (e.endDate || e.date) >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const recent = [...db.payments].sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo)).slice(0, 6);

    return { active, collected, billed, outstanding, debtors, monthly, methods, enrolment, boys, girls: active.length - boys, latestRun, salaryPaidSession, lowStock, events, recent };
  }, [db, term.id, session]);

  const activeStaff = db.staff.filter((s) => s.status === 'active');
  const run = data.latestRun;
  const rt = payrollTotals(run);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`${term.label} · ${fmtDate(term.start)} – ${fmtDate(term.end)}`} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Total students" value={num(data.active.length)} icon={GraduationCap} hint={`${data.boys} boys · ${data.girls} girls`} />
        <StatCard label="Total staff" value={num(activeStaff.length)} icon={UserRound} tone="purple" hint={`${activeStaff.filter((s) => s.category === 'teaching').length} teaching`} />
        {showMoney && <StatCard label="Fees collected (term)" value={money(data.collected, cur)} icon={Banknote} tone="green" hint={`${data.billed ? Math.round((data.collected / data.billed) * 100) : 0}% of ${money(data.billed, cur)}`} />}
        {showMoney && <StatCard label="Outstanding debts" value={money(data.outstanding, cur)} icon={AlertTriangle} tone="red" hint={`${data.debtors} pupils owing (incl. arrears)`} />}
        {showMoney && <StatCard label="Salary paid (session)" value={money(data.salaryPaidSession, cur)} icon={Wallet} tone="amber" hint={run ? `${monthLabel(run.month)}: ${rt.paidCount}/${rt.count} paid` : ''} />}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {showMoney ? (
          <Card title="Fee collections by month" className="xl:col-span-2" actions={<Link to="/fees" className="text-sm font-semibold text-brand-700 hover:underline">Record payment</Link>}>
            <BarChart data={data.monthly} format={(v) => money(v, cur)} />
          </Card>
        ) : (
          <Card title="Enrolment by class" className="xl:col-span-2"><BarChart data={data.enrolment.map((e) => ({ ...e, label: e.label.replace('Nursery', 'Nur.').replace('Pre-Nur.', 'Pre-N') }))} /></Card>
        )}
        <Card title="Gender distribution">
          <Donut data={[{ label: 'Boys', value: data.boys, color: '#1e46ed' }, { label: 'Girls', value: data.girls, color: '#ec4899' }]} center={{ value: data.active.length, label: 'pupils' }} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {showMoney && <Card title="Enrolment by class"><HBarChart data={data.enrolment} /></Card>}
        {showMoney && (
          <Card title="Payment methods (this term)">
            <Donut data={data.methods} format={(v) => money(v, '')} />
          </Card>
        )}
        {showMoney && run && (
          <Card title={`Staff payment status — ${monthLabel(run.month)}`} actions={<Link to="/payroll" className="text-sm font-semibold text-brand-700 hover:underline">Payroll</Link>}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-500">Paid</span>
              <span className="font-bold tabular-nums">{money(rt.paid, cur)} / {money(rt.net, cur)}</span>
            </div>
            <div className="mt-2"><Progress value={rt.paid} max={rt.net} tone="bg-emerald-500" /></div>
            <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
              {run.items.map((i) => {
                const s = db.staff.find((x) => x.id === i.staffId);
                return (
                  <li key={i.staffId} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700">{s ? `${s.firstName} ${s.lastName}` : '—'}</span>
                    {i.paid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Pending</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {!showMoney && (
          <Card title="Quick links" className="xl:col-span-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {[['/students/new', 'Admit a new pupil'], ['/students', 'Search students'], ['/promotion', 'Promotion & exits'], ['/academics', 'Enter term results'], ['/announcements', 'Post an announcement'], ['/reports', 'Academic reports']].map(([to, l]) => (
                <Link key={to} to={to} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{l}<ArrowRight className="size-4" /></Link>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {showMoney && (
          <Card title="Recent payments" className="xl:col-span-2" bodyClass="" actions={<Link to="/fees" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>}>
            <DataTable
              pageSize={6}
              rows={data.recent}
              columns={[
                { key: 'receiptNo', label: 'Receipt', render: (p) => <span className="font-mono text-xs">{p.receiptNo}</span> },
                { key: 'student', label: 'Pupil', render: (p) => fullName(db.students.find((s) => s.id === p.studentId)) },
                { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
                { key: 'method', label: 'Method', render: (p) => methodLabel(p.method) },
                { key: 'amount', label: 'Amount', align: 'right', render: (p) => money(p.amount, '') },
              ]}
            />
          </Card>
        )}
        <div className="space-y-6">
          <Card title="Upcoming events" actions={<CalendarDays className="size-4 text-slate-400" />}>
            {data.events.length ? (
              <ul className="space-y-3">
                {data.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-brand-50 py-1 text-center text-brand-800">
                      <span className="text-[10px] font-bold uppercase">{new Date(e.date).toLocaleDateString('en-GB', { month: 'short' })}</span>
                      <span className="text-lg leading-none font-extrabold">{new Date(e.date).getDate()}</span>
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-slate-800">{e.title}</p>
                      <p className="text-xs text-slate-500 capitalize">{e.type}{e.endDate ? ` · until ${fmtDate(e.endDate)}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No upcoming events.</p>}
          </Card>
          {can(user, 'inventory') && (
            <Card title="Low-stock alerts" actions={<PackageX className="size-4 text-rose-500" />}>
              {data.lowStock.length ? (
                <ul className="space-y-2 text-sm">
                  {data.lowStock.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-700">{i.name}{i.size !== '—' ? ` (${i.size})` : ''}</span>
                      <Badge tone={i.quantity === 0 ? 'red' : 'amber'}>{i.quantity} left</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">All items are above their reorder level.</p>}
              <Link to="/inventory" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><Receipt className="size-4" />Manage stock</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
