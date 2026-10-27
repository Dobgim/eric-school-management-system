import { Download } from 'lucide-react';
import { useStore } from '../lib/store';
import { downloadPayslip } from '../lib/documents';
import { ROLES, fmtDate, money, monthLabel } from '../lib/utils';
import { Avatar, Badge, Card, DataTable, Empty, Info, PageHeader, Button } from '../components/ui';
import { AnnouncementList, visibleAnnouncements } from './Announcements';

/** Every staff member's own page: profile and payslips. */
export default function MyWork() {
  const { db, user } = useStore();
  const me = db.staff.find((s) => s.id === user.staffId);
  const rows = db.payrollRuns
    .map((run) => ({ id: run.id, run, item: run.items.find((i) => i.staffId === user.staffId) }))
    .filter((x) => x.item)
    .sort((a, b) => b.run.month.localeCompare(a.run.month));
  const news = visibleAnnouncements(db, user).slice(0, 5);

  return (
    <>
      <PageHeader title={user.role === 'staff' ? `Welcome, ${user.name.split(' ')[0]}` : 'My Payslips'} subtitle={db.school.name} />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card title="My profile" className="h-fit">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.name} src={me?.photo} />
            <div><p className="font-bold text-slate-900">{user.name}</p><p className="text-sm text-slate-500">{me?.position || ROLES[user.role]}</p></div>
          </div>
          {me ? (
            <dl className="grid grid-cols-2 gap-4">
              <Info label="Staff no">{me.staffNo}</Info>
              <Info label="Category">{me.category === 'teaching' ? 'Teaching' : 'Non-teaching'}</Info>
              <Info label="Phone">{me.phone}</Info>
              <Info label="Employed">{fmtDate(me.dateEmployed)}</Info>
              <Info label="Paid via">{me.bankName || 'Cash'}</Info>
              <Info label="Salary scale">{db.salaryScales.find((g) => g.id === me.gradeId)?.name}</Info>
            </dl>
          ) : <p className="text-sm text-slate-500">Your account is not linked to a staff record yet. Ask the administrator.</p>}
        </Card>
        <Card title="Payslips" bodyClass="">
          <DataTable
            rows={rows}
            empty={<Empty title="No payslips yet" message="Your payslip appears here as soon as the bursar runs the month’s payroll." />}
            columns={[
              { key: 'month', label: 'Month', render: (x) => <span className="font-semibold text-slate-800">{monthLabel(x.run.month)}</span> },
              { key: 'gross', label: 'Gross', align: 'right', render: (x) => money(x.item.gross, '') },
              { key: 'ded', label: 'Deductions', align: 'right', render: (x) => money(x.item.cnps + x.item.advance + x.item.otherDeductions, '') },
              { key: 'net', label: 'Net pay', align: 'right', render: (x) => <b>{money(x.item.net, db.school.currency)}</b> },
              { key: 'status', label: 'Status', render: (x) => (x.item.paid ? <Badge tone="green">Paid {fmtDate(x.item.paidDate)}</Badge> : <Badge tone="amber">Pending</Badge>) },
              { key: 'a', label: '', align: 'right', render: (x) => me && <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadPayslip(db, x.run, x.item)}>Payslip</Button> },
            ]}
          />
        </Card>
      </div>
      {user.role === 'staff' && (
        <div className="mt-6 max-w-3xl">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Announcements</h2>
          {news.length ? <AnnouncementList items={news} /> : <Card><Empty title="No announcements" /></Card>}
        </div>
      )}
    </>
  );
}
