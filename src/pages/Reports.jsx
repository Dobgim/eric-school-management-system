import { useMemo, useState } from 'react';
import { BarChart3, CalendarRange, GraduationCap, Package, Receipt, ShieldAlert, Users, Venus, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { allTerms, billLines, currentTerm, feeStatus, payrollTotals, termPaid } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { PAYMENT_METHODS, age, fmtDate, fullName, localDate, money, monthLabel, sum, today } from '../lib/utils';
import { Card, DataTable, ExportButtons, Field, Input, PageHeader, Select } from '../components/ui';

const REPORTS = [
  { id: 'daily', label: 'Daily collection', icon: CalendarRange, group: 'financial' },
  { id: 'termly', label: 'Termly collection by class', icon: Receipt, group: 'financial' },
  { id: 'debtors', label: 'Debtors list', icon: ShieldAlert, group: 'financial' },
  { id: 'salary', label: 'Salary report', icon: Wallet, group: 'financial' },
  { id: 'enrolment', label: 'Enrolment per class', icon: BarChart3, group: 'academic' },
  { id: 'gender', label: 'Gender distribution', icon: Venus, group: 'academic' },
  { id: 'classlist', label: 'Student list per class', icon: Users, group: 'academic' },
  { id: 'results', label: 'Class results (term)', icon: GraduationCap, group: 'academic' },
];

const daysAgo = (n) => localDate(new Date(Date.now() - n * 864e5));

export default function Reports() {
  const { user } = useStore();
  const available = REPORTS.filter((r) => can(user, `reports.${r.group}`));
  const [id, setId] = useState(available[0].id);
  return (
    <>
      <PageHeader title="Reports" subtitle="Preview any report, then export it as PDF or Excel for management and PTA meetings." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="card h-fit p-2">
          {['financial', 'academic'].map((g) => {
            const list = available.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mb-2">
                <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-widest text-slate-400 uppercase">{g}</p>
                {list.map((r) => (
                  <button key={r.id} onClick={() => setId(r.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium ${id === r.id ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <r.icon className="size-4 shrink-0" />{r.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="min-w-0"><Report id={id} /></div>
      </div>
    </>
  );
}

function Report({ id }) {
  const { db } = useStore();
  const cur = db.school.currency;
  const term = currentTerm(db);
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const active = db.students.filter((s) => s.status === 'active');
  const [p, setP] = useState({ from: daysAgo(30), to: today(), termId: term.id, month: [...db.payrollRuns].sort((a, b) => b.month.localeCompare(a.month))[0]?.month || '', classId: classes[0]?.id, debtClass: 'all' });
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const m = (v) => money(v, '');

  const rep = useMemo(() => {
    switch (id) {
      case 'daily': {
        const pays = db.payments.filter((x) => x.date >= p.from && x.date <= p.to);
        const days = [...new Set(pays.map((x) => x.date))].sort().reverse();
        const rows = days.map((d) => {
          const list = pays.filter((x) => x.date === d);
          const r = { id: d, date: fmtDate(d), count: list.length, total: sum(list, (x) => x.amount) };
          PAYMENT_METHODS.forEach((pm) => { r[pm.id] = sum(list.filter((x) => x.method === pm.id), (x) => x.amount); });
          return r;
        });
        return {
          title: 'Daily Fee Collection Report',
          subtitle: `${fmtDate(p.from)} to ${fmtDate(p.to)}`,
          params: <><Field label="From"><Input type="date" value={p.from} onChange={set('from')} /></Field><Field label="To"><Input type="date" value={p.to} onChange={set('to')} /></Field></>,
          columns: [{ key: 'date', label: 'Date' }, { key: 'count', label: 'Payments', align: 'right' }, ...PAYMENT_METHODS.map((pm) => ({ key: pm.id, label: pm.label, align: 'right', format: m })), { key: 'total', label: 'Total', align: 'right', format: m }],
          rows,
          summary: [['Days', String(rows.length)], ['Payments', String(pays.length)], ...PAYMENT_METHODS.map((pm) => [pm.label, money(sum(rows, (r) => r[pm.id]), cur)]), ['Total collected', money(sum(rows, (r) => r.total), cur)]],
        };
      }
      case 'termly': {
        const t = allTerms(db).find((x) => x.id === p.termId);
        const rows = classes.map((c) => {
          const pupils = db.students.filter((s) => s.enrollments?.[t.sessionId] === c.id);
          const billed = sum(pupils, (s) => sum(billLines(db, s, t.id), (l) => l.amount));
          const paid = sum(pupils, (s) => termPaid(db, s.id, t.id));
          return { id: c.id, name: c.name, pupils: pupils.length, billed, paid, outstanding: Math.max(0, billed - paid), rate: billed ? `${Math.round((paid / billed) * 100)}%` : '—' };
        });
        const billed = sum(rows, (r) => r.billed);
        const paid = sum(rows, (r) => r.paid);
        return {
          title: 'Termly Collection Report',
          subtitle: t.label,
          params: <Field label="Term"><Select value={p.termId} onChange={set('termId')} options={allTerms(db).map((x) => ({ value: x.id, label: x.label }))} /></Field>,
          columns: [{ key: 'name', label: 'Class' }, { key: 'pupils', label: 'Pupils', align: 'right' }, { key: 'billed', label: 'Billed', align: 'right', format: m }, { key: 'paid', label: 'Collected', align: 'right', format: m }, { key: 'outstanding', label: 'Outstanding', align: 'right', format: m }, { key: 'rate', label: '% collected', align: 'right' }],
          rows,
          summary: [['Total billed', money(billed, cur)], ['Total collected', money(paid, cur)], ['Outstanding', money(billed - paid, cur)], ['Collection rate', billed ? `${Math.round((paid / billed) * 100)}%` : '—']],
        };
      }
      case 'debtors': {
        const rows = active.map((s) => {
          const st = feeStatus(db, s, term.id);
          const g = db.guardians.find((x) => x.id === s.guardianIds[0]);
          return { id: s.id, regNo: s.regNo, name: fullName(s), className: db.classes.find((c) => c.id === s.classId)?.name, parent: g?.name, phone: g?.phone, classOrder: db.classes.find((c) => c.id === s.classId)?.order, ...st };
        }).filter((r) => r.totalDue > 0 && (p.debtClass === 'all' || db.students.find((s) => s.id === r.id).classId === p.debtClass)).sort((a, b) => a.classOrder - b.classOrder || b.totalDue - a.totalDue);
        return {
          title: 'Debtors List',
          subtitle: `${term.label}${p.debtClass !== 'all' ? ` · ${db.classes.find((c) => c.id === p.debtClass)?.name}` : ''}`,
          params: <Field label="Class"><Select value={p.debtClass} onChange={set('debtClass')} options={[{ value: 'all', label: 'All classes' }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></Field>,
          columns: [{ key: 'regNo', label: 'Reg. No' }, { key: 'name', label: 'Pupil' }, { key: 'className', label: 'Class' }, { key: 'parent', label: 'Parent' }, { key: 'phone', label: 'Phone' }, { key: 'balance', label: 'Term bal.', align: 'right', format: m }, { key: 'arrears', label: 'Arrears', align: 'right', format: m }, { key: 'totalDue', label: 'Total owing', align: 'right', format: m }],
          rows,
          summary: [['Debtors', String(rows.length)], ['Term balances', money(sum(rows, (r) => r.balance), cur)], ['Arrears', money(sum(rows, (r) => r.arrears), cur)], ['Total owing', money(sum(rows, (r) => r.totalDue), cur)]],
        };
      }
      case 'salary': {
        const run = db.payrollRuns.find((r) => r.month === p.month);
        const rows = (run?.items || []).map((i) => {
          const s = db.staff.find((x) => x.id === i.staffId);
          return { id: i.staffId, staffNo: s?.staffNo, name: `${s?.firstName} ${s?.lastName}`, position: s?.position, gross: i.gross, deductions: i.cnps + i.advance + i.otherDeductions, net: i.net, status: i.paid ? `Paid ${fmtDate(i.paidDate)}` : 'Pending' };
        });
        const t = payrollTotals(run);
        return {
          title: 'Salary Report',
          subtitle: p.month ? monthLabel(p.month) : '',
          params: <Field label="Month"><Select value={p.month} onChange={set('month')} options={[...db.payrollRuns].sort((a, b) => b.month.localeCompare(a.month)).map((r) => ({ value: r.month, label: monthLabel(r.month) }))} /></Field>,
          columns: [{ key: 'staffNo', label: 'Staff No' }, { key: 'name', label: 'Name' }, { key: 'position', label: 'Position' }, { key: 'gross', label: 'Gross', align: 'right', format: m }, { key: 'deductions', label: 'Deductions', align: 'right', format: m }, { key: 'net', label: 'Net', align: 'right', format: m }, { key: 'status', label: 'Status' }],
          rows,
          summary: [['Staff', String(t.count)], ['Gross', money(t.gross, cur)], ['Deductions', money(t.deductions, cur)], ['Net payroll', money(t.net, cur)], ['Paid', money(t.paid, cur)], ['Outstanding', money(t.unpaid, cur)]],
        };
      }
      case 'uniform': {
        const sales = db.sales.filter((s) => s.date >= p.from && s.date <= p.to);
        const map = {};
        sales.forEach((s) => s.items.forEach((l) => {
          map[l.itemId] ||= { id: l.itemId, name: l.name, qty: 0, revenue: 0 };
          map[l.itemId].qty += l.qty;
          map[l.itemId].revenue += l.qty * l.price;
        }));
        const rows = Object.values(map).map((r) => {
          const it = db.inventory.find((i) => i.id === r.id);
          return { ...r, category: it?.category, cost: (it?.costPrice || 0) * r.qty, margin: r.revenue - (it?.costPrice || 0) * r.qty };
        }).sort((a, b) => b.revenue - a.revenue);
        return {
          title: 'Uniform & Materials Sales Report',
          subtitle: `${fmtDate(p.from)} to ${fmtDate(p.to)}`,
          params: <><Field label="From"><Input type="date" value={p.from} onChange={set('from')} /></Field><Field label="To"><Input type="date" value={p.to} onChange={set('to')} /></Field></>,
          columns: [{ key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'qty', label: 'Units sold', align: 'right' }, { key: 'revenue', label: 'Revenue', align: 'right', format: m }, { key: 'cost', label: 'Cost', align: 'right', format: m }, { key: 'margin', label: 'Margin', align: 'right', format: m }],
          rows,
          summary: [['Sales', String(sales.length)], ['Units sold', String(sum(rows, (r) => r.qty))], ['Revenue', money(sum(rows, (r) => r.revenue), cur)], ['Margin', money(sum(rows, (r) => r.margin), cur)]],
        };
      }
      case 'enrolment': {
        const rows = classes.map((c) => {
          const list = active.filter((s) => s.classId === c.id);
          return { id: c.id, name: c.name, level: c.level === 'nursery' ? 'Nursery' : 'Primary', capacity: c.capacity, boys: list.filter((s) => s.gender === 'M').length, girls: list.filter((s) => s.gender === 'F').length, total: list.length, newPupils: list.filter((s) => s.isNew && s.sessionAdmitted === db.settings.currentSessionId).length, fill: `${Math.round((list.length / c.capacity) * 100)}%` };
        });
        return {
          title: 'Enrolment per Class',
          subtitle: term.sessionName,
          columns: [{ key: 'name', label: 'Class' }, { key: 'level', label: 'Level' }, { key: 'boys', label: 'Boys', align: 'right' }, { key: 'girls', label: 'Girls', align: 'right' }, { key: 'total', label: 'Total', align: 'right' }, { key: 'newPupils', label: 'New this session', align: 'right' }, { key: 'capacity', label: 'Capacity', align: 'right' }, { key: 'fill', label: 'Fill', align: 'right' }],
          rows,
          summary: [['Total pupils', String(active.length)], ['Boys', String(sum(rows, (r) => r.boys))], ['Girls', String(sum(rows, (r) => r.girls))], ['New admissions', String(sum(rows, (r) => r.newPupils))]],
        };
      }
      case 'gender': {
        const groups = [['Nursery', (s) => db.classes.find((c) => c.id === s.classId)?.level === 'nursery'], ['Primary', (s) => db.classes.find((c) => c.id === s.classId)?.level === 'primary'], ['Whole school', () => true]];
        const rows = groups.map(([name, fn]) => {
          const list = active.filter(fn);
          const boys = list.filter((s) => s.gender === 'M').length;
          return { id: name, name, boys, girls: list.length - boys, total: list.length, boysPct: list.length ? `${Math.round((boys / list.length) * 100)}%` : '—', girlsPct: list.length ? `${Math.round(((list.length - boys) / list.length) * 100)}%` : '—' };
        });
        return {
          title: 'Gender Distribution',
          subtitle: term.sessionName,
          columns: [{ key: 'name', label: 'Section' }, { key: 'boys', label: 'Boys', align: 'right' }, { key: 'boysPct', label: '% Boys', align: 'right' }, { key: 'girls', label: 'Girls', align: 'right' }, { key: 'girlsPct', label: '% Girls', align: 'right' }, { key: 'total', label: 'Total', align: 'right' }],
          rows,
        };
      }
      case 'classlist': {
        const c = db.classes.find((x) => x.id === p.classId) || classes[0];
        const teacher = db.staff.find((s) => s.id === c.teacherId);
        const rows = active.filter((s) => s.classId === c.id).sort((a, b) => a.lastName.localeCompare(b.lastName)).map((s, i) => {
          const g = db.guardians.find((x) => x.id === s.guardianIds[0]);
          return { id: s.id, n: i + 1, regNo: s.regNo, name: `${s.lastName.toUpperCase()} ${s.firstName} ${s.otherNames || ''}`.trim(), gender: s.gender, dob: fmtDate(s.dob), age: age(s.dob), parent: g?.name, phone: g?.phone };
        });
        return {
          title: `Class List - ${c.name}`,
          subtitle: `${term.sessionName} · Class teacher: ${teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unassigned'}`,
          params: <Field label="Class"><Select value={c.id} onChange={set('classId')} options={classes.map((x) => ({ value: x.id, label: x.name }))} /></Field>,
          columns: [{ key: 'n', label: '#', align: 'right' }, { key: 'regNo', label: 'Reg. No' }, { key: 'name', label: 'Name' }, { key: 'gender', label: 'Sex' }, { key: 'dob', label: 'Date of birth' }, { key: 'age', label: 'Age', align: 'right' }, { key: 'parent', label: 'Parent' }, { key: 'phone', label: 'Phone' }],
          rows,
          summary: [['Boys', String(rows.filter((r) => r.gender === 'M').length)], ['Girls', String(rows.filter((r) => r.gender === 'F').length)], ['Total', String(rows.length)]],
        };
      }
      case 'results': {
        const c = db.classes.find((x) => x.id === p.classId) || classes[0];
        const t = allTerms(db).find((x) => x.id === p.termId);
        const rows = db.academicRecords.filter((r) => r.termId === t.id && r.classId === c.id).sort((a, b) => a.position - b.position).map((r) => ({ ...r, name: fullName(db.students.find((s) => s.id === r.studentId)), avg: Number(r.average).toFixed(2), pos: `${r.position} / ${r.outOf}` }));
        const passed = rows.filter((r) => r.average >= 10).length;
        return {
          title: `Class Results - ${c.name}`,
          subtitle: t.label,
          params: <><Field label="Class"><Select value={c.id} onChange={set('classId')} options={classes.map((x) => ({ value: x.id, label: x.name }))} /></Field><Field label="Term"><Select value={p.termId} onChange={set('termId')} options={allTerms(db).map((x) => ({ value: x.id, label: x.label }))} /></Field></>,
          columns: [{ key: 'pos', label: 'Position' }, { key: 'name', label: 'Pupil' }, { key: 'avg', label: 'Average /20', align: 'right' }, { key: 'conduct', label: 'Conduct' }, { key: 'remark', label: 'Remark' }],
          rows,
          summary: rows.length ? [['Pupils', String(rows.length)], ['Passed (>= 10)', `${passed} (${Math.round((passed / rows.length) * 100)}%)`], ['Class average', (sum(rows, (r) => r.average) / rows.length).toFixed(2)], ['Highest', rows[0].avg]] : [],
        };
      }
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, db, p]);

  if (!rep) return null;
  return (
    <Card
      bodyClass=""
      title={<span>{rep.title} <span className="font-normal text-slate-500">· {rep.subtitle}</span></span>}
      actions={<ExportButtons
        onPdf={() => exportTablePDF({ school: db.school, title: rep.title, subtitle: rep.subtitle, columns: rep.columns, rows: rep.rows, summary: rep.summary })}
        onExcel={() => exportExcel({ title: rep.title, columns: rep.columns.map((c) => ({ ...c, format: undefined })), rows: rep.rows, summary: rep.summary })}
      />}
    >
      {rep.params && <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">{rep.params}</div>}
      <DataTable rows={rep.rows} pageSize={30} columns={rep.columns.map((c) => ({ ...c, render: c.format ? (r) => c.format(r[c.key], r) : undefined }))} />
      {rep.summary?.length > 0 && (
        <dl className="grid gap-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {rep.summary.map(([k, v]) => <div key={k}><dt className="text-xs font-semibold text-slate-500 uppercase">{k}</dt><dd className="font-bold text-slate-900 tabular-nums">{v}</dd></div>)}
        </dl>
      )}
    </Card>
  );
}
