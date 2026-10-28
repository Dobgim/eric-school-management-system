import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, BookOpen, CalendarDays, Clock, Download, GraduationCap, Megaphone, Smartphone, UserPlus, Users, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentTerm, feeStatus, pendingFor, yearStatus } from '../lib/finance';
import { downloadReceipt } from '../lib/documents';
import { fmtDate, fullName, methodLabel, money, sum, today } from '../lib/utils';
import { Avatar, Badge, Button, Card, Empty, FeeBadge, PageHeader, StatCard } from '../components/ui';
import { Progress } from '../components/Charts';
import { visibleAnnouncements } from './Announcements';
import { myChildren } from './Portal';
import { InstallCard } from '../components/InstallApp';
import OutboxNotice from '../components/Outbox';

export const REQUEST_STATUS = {
  pending: ['amber', 'Awaiting verification'],
  approved: ['green', 'Confirmed'],
  rejected: ['red', 'Rejected'],
  processing: ['blue', 'Waiting for phone approval'],
  failed: ['red', 'Failed'],
};

export default function ParentDashboard() {
  const { db, user } = useStore();
  const cur = db.school.currency;
  const term = currentTerm(db);
  const kids = myChildren(db, user);
  const active = kids.filter((k) => k.status === 'active');
  const statuses = active.map((k) => ({ k, st: feeStatus(db, k), pending: pendingFor(db, k.id) }));
  const owing = sum(statuses, (x) => x.st.totalDue);
  const yearLeft = sum(active, (k) => yearStatus(db, k).totalLeft);
  const yearPaid = sum(active, (k) => yearStatus(db, k).paid);
  const pending = sum(statuses, (x) => x.pending);
  const paidTerm = sum(statuses, (x) => x.st.paid);
  const billedTerm = sum(statuses, (x) => x.st.billed);
  const kidIds = kids.map((k) => k.id);
  const recent = db.payments.filter((p) => kidIds.includes(p.studentId)).sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo)).slice(0, 5);
  const requests = db.paymentRequests.filter((r) => r.guardianId === user.guardianId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const news = visibleAnnouncements(db, user).slice(0, 3);
  const events = db.calendarEvents.filter((e) => (e.endDate || e.date) >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const pendingApps = db.admissionApplications.filter((a) => a.status === 'pending').length;
  const lastResult = (id) => db.academicRecords.filter((r) => r.studentId === id).sort((a, b) => b.termId.localeCompare(a.termId))[0];

  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} subtitle={`${term.label} · ${db.school.name}`} />
      <OutboxNotice />
      <InstallCard schoolName={db.school.shortName || db.school.name} />

      {owing - pending > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border-l-4 border-accent-400 bg-brand-900 px-6 py-5 text-white">
          <div>
            <p className="text-sm text-brand-100">Fees outstanding for your {active.length > 1 ? 'children' : 'child'}</p>
            <p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{money(owing - pending, cur)}</p>
            {pending > 0 && <p className="mt-1 text-xs text-brand-100">{money(pending, cur)} more is awaiting verification by the bursar.</p>}
          </div>
          <Link to="/portal/pay"><Button variant="secondary" icon={Smartphone} className="border-0 !bg-accent-400 !text-slate-900 hover:!bg-accent-500">Pay fees now</Button></Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Children in school" value={active.length} icon={Users} hint={kids.length > active.length ? `${kids.length - active.length} past pupil(s)` : undefined} />
        <StatCard label="Paid this term" value={money(paidTerm, cur)} icon={Wallet} tone="green" hint={`of ${money(billedTerm, cur)} billed`} />
        <StatCard label="Left for the year" value={money(yearLeft, cur)} icon={Wallet} tone={yearLeft ? 'red' : 'green'} hint={yearLeft ? `Paid ${money(yearPaid, '')} so far · ${money(owing, '')} due now` : 'All fees cleared'} />
        <StatCard label="Awaiting verification" value={money(pending, cur)} icon={Clock} tone="amber" hint={`${db.paymentRequests.filter((r) => r.guardianId === user.guardianId && r.status === 'pending').length} submission(s)`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">My children</h2>
        <Link to="/portal/admissions"><Button size="sm" variant="secondary" icon={UserPlus}>Register {kids.length ? 'another' : 'a'} child</Button></Link>
      </div>
      {pendingApps > 0 && <Link to="/portal/admissions" className="mb-4 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"><b>{pendingApps} admission application{pendingApps > 1 ? 's' : ''}</b> under review by the school.</Link>}
      {!kids.length ? <Card><Empty title="No children at the school yet" message="Register your children for admission — you can add several at once. They appear here once the school accepts them." action={<Link to="/portal/admissions"><Button icon={UserPlus}>Register children</Button></Link>} /></Card> : (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kids.map((k) => {
            const cls = db.classes.find((c) => c.id === k.classId);
            const teacher = db.staff.find((s) => s.id === cls?.teacherId);
            const st = feeStatus(db, k);
            const y = yearStatus(db, k);
            const res = lastResult(k.id);
            return (
              <div key={k.id} className="card flex flex-col p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={`${k.firstName} ${k.lastName}`} src={k.photo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{fullName(k)}</p>
                    <p className="text-xs text-slate-500">{cls?.name}{teacher ? ` · ${teacher.gender === 'F' ? 'Mrs.' : 'Mr.'} ${teacher.lastName}` : ''}</p>
                  </div>
                  {k.status === 'active' ? <FeeBadge state={st.state} /> : <Badge className="capitalize">{k.status}</Badge>}
                </div>
                {k.status === 'active' && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-500"><span>Term fees paid</span><span className="tabular-nums">{money(st.paid, '')} / {money(st.billed, '')}</span></div>
                    <div className="mt-1.5"><Progress value={st.paid} max={st.billed} tone={st.state === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'} /></div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="text-xs text-slate-500">Left for the year</dt><dd className={`font-bold tabular-nums ${y.totalLeft ? 'text-rose-600' : 'text-emerald-700'}`}>{y.totalLeft ? money(y.totalLeft, cur) : 'Cleared'}</dd><dd className="text-xs text-slate-500">Paid {money(y.paid, '')} of {money(y.billed, '')}</dd></div>
                      <div><dt className="text-xs text-slate-500">Last result</dt><dd className="font-bold text-slate-800 tabular-nums">{res ? `${Number(res.average).toFixed(2)}/20 · ${res.position}/${res.outOf}` : '—'}</dd></div>
                    </dl>
                  </div>
                )}
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                  <Link to={`/portal/children?child=${k.id}`} className="flex-1"><Button variant="secondary" size="sm" icon={GraduationCap} className="w-full">Profile</Button></Link>
                  {k.status === 'active' && y.totalLeft > 0 && <Link to={`/portal/pay?child=${k.id}`} className="flex-1"><Button size="sm" icon={Smartphone} className="w-full">Pay</Button></Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Recent payments" bodyClass="" actions={<Link to="/portal/payments" className="text-sm font-semibold text-brand-700 hover:underline">All payments & receipts</Link>}>
            {recent.length ? (
              <ul className="divide-y divide-slate-100">
                {recent.map((p) => {
                  const k = kids.find((x) => x.id === p.studentId);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800">{money(p.amount, cur)} <span className="font-normal text-slate-500">for {k?.firstName}</span></p>
                        <p className="text-xs text-slate-500">{fmtDate(p.date)} · {methodLabel(p.method)} · <span className="font-mono">{p.receiptNo}</span>{p.channel === 'online' && <Badge tone="blue" className="ml-1.5">Paid online</Badge>}</p>
                      </div>
                      <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadReceipt(db, p)}>Receipt</Button>
                    </li>
                  );
                })}
              </ul>
            ) : <Empty title="No payments yet" />}
          </Card>
          {requests.length > 0 && (
            <Card title="Payments you submitted" bodyClass="" actions={<Link to="/portal/payments?tab=requests" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>}>
              <ul className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{money(r.amount, cur)} <span className="font-normal text-slate-500">· {methodLabel(r.method)} · {r.reference}</span></p>
                      <p className="text-xs text-slate-500">Submitted {fmtDate(r.createdAt)}{r.status === 'rejected' && r.reviewNote ? ` · ${r.reviewNote}` : ''}</p>
                    </div>
                    <Badge tone={REQUEST_STATUS[r.status][0]}>{REQUEST_STATUS[r.status][1]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="About the school" bodyClass="p-0">
            <ul className="divide-y divide-slate-100 text-sm">
              {[['/school-fees', Banknote, 'School fees', 'What every class pays per term'], ['/teachers', BookOpen, 'Teachers & subjects', 'Who teaches each class and subject']].map(([to, Icon, title, text]) => (
                <li key={to}>
                  <Link to={to} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <Icon className="size-5 shrink-0 text-brand-700" />
                    <span className="flex-1"><span className="block font-semibold text-slate-800">{title}</span><span className="block text-xs text-slate-500">{text}</span></span>
                    <ArrowRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Announcements" actions={<Link to="/portal/news" className="text-sm font-semibold text-brand-700 hover:underline"><Megaphone className="inline size-4" /></Link>}>
            {news.length ? (
              <ul className="space-y-4">
                {news.map((a) => (
                  <li key={a.id}>
                    <p className="text-sm font-bold text-slate-800">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{fmtDate(a.date)}</p>
                  </li>
                ))}
                <li><Link to="/portal/news" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">All announcements <ArrowRight className="size-4" /></Link></li>
              </ul>
            ) : <p className="text-sm text-slate-500">No announcements.</p>}
          </Card>
          <Card title="Coming up" actions={<CalendarDays className="size-4 text-slate-400" />}>
            {events.length ? (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-brand-50 py-1 text-center text-brand-800">
                      <span className="text-[10px] font-bold uppercase">{new Date(e.date).toLocaleDateString('en-GB', { month: 'short' })}</span>
                      <span className="text-lg leading-none font-bold">{new Date(e.date).getDate()}</span>
                    </div>
                    <div className="text-sm"><p className="font-semibold text-slate-800">{e.title}</p>{e.endDate && <p className="text-xs text-slate-500">until {fmtDate(e.endDate)}</p>}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Nothing scheduled.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
