import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { allTerms } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { FEE_TYPES, money, num } from '../lib/utils';
import { Badge, Card, Empty, ExportButtons, PageHeader } from '../components/ui';

/** Read-only fee schedule: what every class pays in a term, for parents and staff alike. */
export default function SchoolFees() {
  const { db, user } = useStore();
  const terms = allTerms(db);
  const [termId, setTermId] = useState(db.settings.currentTermId || terms[0]?.id);
  const term = terms.find((t) => t.id === termId);
  const cur = db.school.currency || 'XAF';
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const myClassIds = new Set(user.role === 'parent' ? db.students.map((s) => s.classId) : []);

  const items = db.feeItems.filter((f) => f.termId === termId);
  // Only show the fee types this term actually charges.
  const types = FEE_TYPES.filter((ft) => items.some((f) => f.feeType === ft.id));
  const newOnly = new Set(items.filter((f) => f.appliesTo === 'new').map((f) => f.feeType));

  const rows = useMemo(() => classes.map((c) => {
    const row = { id: c.id, name: c.name, level: c.level, mine: myClassIds.has(c.id), returning: 0, fresh: 0 };
    for (const ft of types) {
      const amount = items.filter((f) => f.classId === c.id && f.feeType === ft.id).reduce((t, f) => t + f.amount, 0);
      row[ft.id] = amount;
      row.fresh += amount;
      if (!newOnly.has(ft.id)) row.returning += amount;
    }
    return row;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db.feeItems, db.classes, termId]);

  const discounts = db.categories.filter((c) => c.tuitionDiscount > 0);
  const cols = [
    { key: 'name', label: 'Class' },
    ...types.map((ft) => ({ key: ft.id, label: newOnly.has(ft.id) ? `${ft.label} (new pupils)` : ft.label, align: 'right', format: (v) => (v ? num(v) : '-') })),
    { key: 'returning', label: 'Total, returning pupil', align: 'right', format: (v, r) => (r.fresh ? num(v) : 'Not set') },
    ...(newOnly.size ? [{ key: 'fresh', label: 'Total, new pupil', align: 'right', format: (v) => (v ? num(v) : 'Not set') }] : []),
  ];
  const notes = [
    ['Currency', cur],
    ...discounts.map((c) => [c.name, `${c.tuitionDiscount}% off tuition`]),
  ];

  return (
    <>
      <PageHeader title="School fees" subtitle="What each class pays per term. Amounts are set by the bursar." />
      <Card
        bodyClass=""
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span>Fees for</span>
            <select className="input w-auto py-1" value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term">
              {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        }
        actions={rows.length > 0 && types.length > 0 && (
          <ExportButtons
            onPdf={() => exportTablePDF({ school: db.school, title: 'School Fees', subtitle: term?.label, columns: cols, rows, summary: notes, filename: `School fees ${term?.label}` })}
            onExcel={() => exportExcel({ title: `School Fees ${term?.label}`, columns: cols.map((c) => ({ ...c, format: undefined })), rows, summary: notes })}
          />
        )}
      >
        {!types.length ? (
          <Empty title="No fees published for this term yet" message="The bursar has not set the fee structure for this term." />
        ) : (
          <>
            {/* Phones: one block per class */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className={`px-4 py-3 ${r.mine ? 'bg-accent-400/10' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{r.name}</span>
                    {r.mine && <Badge tone="amber">Your child</Badge>}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {types.map((ft) => (
                      <div key={ft.id} className="contents">
                        <dt className="text-slate-500">{ft.label}{newOnly.has(ft.id) && <span className="text-xs"> (new)</span>}</dt>
                        <dd className="text-right tabular-nums">{r[ft.id] ? num(r[ft.id]) : '—'}</dd>
                      </div>
                    ))}
                    <dt className="border-t border-slate-200 pt-1 font-semibold">Returning pupil</dt>
                    <dd className="border-t border-slate-200 pt-1 text-right font-semibold tabular-nums">{r.fresh ? money(r.returning, cur) : 'Not set'}</dd>
                    {newOnly.size > 0 && r.fresh > 0 && <><dt className="font-semibold">New pupil</dt><dd className="text-right font-semibold tabular-nums">{money(r.fresh, cur)}</dd></>}
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="table-base">
                <thead>
                  <tr>{cols.map((c) => <th key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.mine ? 'bg-accent-400/10' : ''}>
                      <td className="font-medium text-slate-800">{r.name} {r.mine && <Badge tone="amber" className="ml-1">Your child</Badge>}</td>
                      {types.map((ft) => <td key={ft.id} className="text-right tabular-nums">{r[ft.id] ? num(r[ft.id]) : <span className="text-slate-400">—</span>}</td>)}
                      <td className="text-right font-semibold tabular-nums">{r.fresh ? num(r.returning) : <span className="font-normal text-slate-400">Not set</span>}</td>
                      {newOnly.size > 0 && <td className="text-right font-semibold tabular-nums">{r.fresh ? num(r.fresh) : <span className="font-normal text-slate-400">Not set</span>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="space-y-1 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
          <p>Amounts in {cur} for one term.{newOnly.size > 0 && ` Charged only to pupils joining the school this session: ${types.filter((t) => newOnly.has(t.id)).map((t) => t.label).join(', ')}.`}</p>
          {discounts.length > 0 && <p>Tuition discounts: {discounts.map((c) => `${c.name} ${c.tuitionDiscount}%`).join(' · ')}.</p>}
        </div>
      </Card>
    </>
  );
}
