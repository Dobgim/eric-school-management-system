import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileText, Smartphone } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms, feeStatus } from '../lib/finance';
import { downloadReceipt } from '../lib/documents';
import { exportTablePDF } from '../lib/exporters';
import { fmtDate, fullName, methodLabel, money, sum } from '../lib/utils';
import { Badge, Button, Card, DataTable, Empty, PageHeader, Select, Tabs } from '../components/ui';
import { AnnouncementList, visibleAnnouncements } from './Announcements';
import { REQUEST_STATUS } from './ParentDashboard';
import { Calendar, myChildren } from './Portal';
import OutboxNotice from '../components/Outbox';

export default function ParentPayments() {
  const { db, user } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'receipts';
  const [childId, setChildId] = useState('');
  const kids = myChildren(db, user);
  const ids = childId ? [childId] : kids.map((k) => k.id);
  const cur = db.school.currency;
  const payments = db.payments.filter((p) => ids.includes(p.studentId)).sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo));
  const requests = db.paymentRequests.filter((r) => r.guardianId === user.guardianId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const kidName = (id) => { const k = kids.find((x) => x.id === id); return k ? `${k.firstName} ${k.lastName}` : '—'; };
  const termLabel = (id) => allTerms(db).find((t) => t.id === id)?.label;

  const statement = () => {
    const rows = payments.map((p) => ({ ...p, child: kidName(p.studentId), term: termLabel(p.termId) }));
    const owing = sum(kids.filter((k) => ids.includes(k.id) && k.status === 'active'), (k) => feeStatus(db, k).totalDue);
    exportTablePDF({
      school: db.school,
      title: 'Fee Payment Statement',
      subtitle: `${user.name}${childId ? ` · ${kidName(childId)}` : ''}`,
      columns: [
        { key: 'date', label: 'Date', format: fmtDate }, { key: 'receiptNo', label: 'Receipt' }, { key: 'child', label: 'Pupil' },
        { key: 'term', label: 'Term' }, { key: 'method', label: 'Method', format: methodLabel }, { key: 'amount', label: 'Amount', align: 'right', format: (v) => money(v, '') },
      ],
      rows,
      summary: [['Total paid', money(sum(rows, (r) => r.amount), cur)], ['Still owing', money(owing, cur)]],
    });
  };

  return (
    <>
      <PageHeader
        title="Payments & Receipts"
        subtitle="Every payment made for your children, with official receipts."
        actions={<><Button variant="secondary" icon={FileText} onClick={statement}>Download statement</Button><Link to="/portal/pay"><Button icon={Smartphone}>Pay fees</Button></Link></>}
      />
      <OutboxNotice />
      <Tabs
        tabs={[{ id: 'receipts', label: 'Receipts', count: payments.length }, { id: 'requests', label: 'Submitted payments', count: requests.filter((r) => r.status === 'pending').length || undefined }]}
        value={tab}
        onChange={(t) => setParams(t === 'receipts' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'receipts' ? (
        <Card bodyClass="" actions={kids.length > 1 && <Select value={childId} onChange={(e) => setChildId(e.target.value)} placeholder="All children" options={kids.map((k) => ({ value: k.id, label: fullName(k) }))} className="w-56" />} title="Official receipts">
          {/* Phones: one card per receipt instead of a wide table. */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {payments.length ? payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{money(p.amount, db.school.currency)} <span className="font-medium text-slate-500">· {kidName(p.studentId).split(' ')[0]}</span></p>
                  <p className="text-xs text-slate-500">{fmtDate(p.date)} · {methodLabel(p.method)}{p.channel === 'online' ? ' · online' : ''}</p>
                  <p className="text-xs text-slate-400">{termLabel(p.termId)} · <span className="font-mono">{p.receiptNo}</span></p>
                </div>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadReceipt(db, p)} aria-label={`Download receipt ${p.receiptNo}`}>PDF</Button>
              </li>
            )) : <Empty title="No payments yet" />}
          </ul>
          <div className="hidden md:block"><DataTable
            rows={payments}
            pageSize={20}
            empty={<Empty title="No payments yet" />}
            columns={[
              { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
              { key: 'child', label: 'Pupil', render: (p) => kidName(p.studentId) },
              { key: 'term', label: 'Term', render: (p) => termLabel(p.termId) },
              { key: 'method', label: 'Method', render: (p) => <div>{methodLabel(p.method)}{p.channel === 'online' && <Badge tone="blue" className="ml-1.5">Online</Badge>}{p.reference && <p className="font-mono text-xs text-slate-500">{p.reference}</p>}</div> },
              { key: 'amount', label: 'Amount', align: 'right', render: (p) => <b>{money(p.amount, '')}</b> },
              { key: 'r', label: '', align: 'right', render: (p) => <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadReceipt(db, p)}>{p.receiptNo}</Button> },
            ]}
          /></div>
        </Card>
      ) : (
        <Card bodyClass="" title="Payments you made through the portal">
          <ul className="divide-y divide-slate-100 md:hidden">
            {requests.length ? requests.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900">{money(r.amount, db.school.currency)}</p>
                  <Badge tone={REQUEST_STATUS[r.status][0]}>{REQUEST_STATUS[r.status][1]}</Badge>
                </div>
                <p className="text-xs text-slate-500">{fmtDate(r.createdAt)} · {methodLabel(r.method)} · <span className="font-mono">{r.reference}</span></p>
                <p className="text-xs text-slate-500">For {r.items.map((i) => `${kidName(i.studentId).split(' ')[0]} (${money(i.amount, '').trim()})`).join(', ')}</p>
                {r.reviewNote && <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">{r.reviewNote}</p>}
              </li>
            )) : <Empty title="Nothing submitted yet" />}
          </ul>
          <div className="hidden md:block"><DataTable
            rows={requests}
            empty={<Empty title="Nothing submitted yet" message="When you pay by MoMo USSD or bank and submit the transaction ID, it appears here until the bursar confirms it." />}
            columns={[
              { key: 'createdAt', label: 'Submitted', render: (r) => fmtDate(r.createdAt) },
              { key: 'ref', label: 'Ref', render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
              { key: 'for', label: 'For', render: (r) => r.items.map((i) => `${kidName(i.studentId).split(' ')[0]} ${money(i.amount, '')}`).join(', ') },
              { key: 'method', label: 'Method', render: (r) => <div>{methodLabel(r.method)} · {r.channel === 'online' ? 'phone prompt' : 'submitted'}<p className="font-mono text-xs text-slate-500">{r.reference}</p></div> },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => <b>{money(r.amount, '')}</b> },
              { key: 'status', label: 'Status', render: (r) => <div><Badge tone={REQUEST_STATUS[r.status][0]}>{REQUEST_STATUS[r.status][1]}</Badge>{r.reviewNote && <p className="mt-0.5 max-w-56 text-xs text-slate-500">{r.reviewNote}</p>}</div> },
            ]}
          /></div>
        </Card>
      )}
    </>
  );
}

export function ParentNews() {
  const { db, user } = useStore();
  return (
    <>
      <PageHeader title="News & Calendar" subtitle="School announcements and the academic calendar." />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <AnnouncementList items={visibleAnnouncements(db, user)} />
        <div className="h-fit xl:sticky xl:top-20"><Calendar /></div>
      </div>
    </>
  );
}
