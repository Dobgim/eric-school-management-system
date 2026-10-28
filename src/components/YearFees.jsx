import { useEffect, useMemo, useState } from 'react';
import { Save, SplitSquareHorizontal } from 'lucide-react';
import { useStore } from '../lib/store';
import { FEE_TYPES, money } from '../lib/utils';
import { Button, Card, Field, Select } from './ui';

const round50 = (n) => Math.round(n / 50) * 50;

/**
 * Fees for the whole school year, entered once and divided into the terms automatically
 * (equally, or by the percentages the school chooses). Fees for new pupils only (e.g. registration) are charged
 * in full in the first term. Saving writes each term's fees, so balances, receipts and parents' pages follow.
 */
export default function YearFees({ notify }) {
  const { db, api } = useStore();
  const sessions = [...db.sessions].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const [sessionId, setSessionId] = useState(db.settings.currentSessionId || sessions[0]?.id);
  const session = db.sessions.find((s) => s.id === sessionId);
  const terms = useMemo(() => [...(session?.terms || [])].sort((a, b) => a.start.localeCompare(b.start)), [session]);
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const [grid, setGrid] = useState({});
  const [newOnly, setNewOnly] = useState({});
  const [split, setSplit] = useState([]);

  // Start from what is already set: the year's total per class and fee type, and the split last used.
  useEffect(() => {
    const g = {};
    const n = {};
    const ids = new Set(terms.map((t) => t.id));
    for (const f of db.feeItems.filter((x) => ids.has(x.termId))) {
      g[`${f.classId}:${f.feeType}`] = (Number(g[`${f.classId}:${f.feeType}`]) || 0) + f.amount;
      if (f.appliesTo === 'new') n[f.feeType] = true;
    }
    if (!Object.keys(g).length) n.registration = true;
    const saved = db.settings.feeSplit?.[sessionId];
    const even = terms.map((_, i) => (i === 0 ? 100 - Math.floor(100 / terms.length) * (terms.length - 1) : Math.floor(100 / terms.length)));
    setGrid(g);
    setNewOnly(n);
    setSplit(saved?.length === terms.length ? saved : even);
    // Reload only when the school year changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, terms.length]);

  const pctTotal = split.reduce((t, p) => t + (Number(p) || 0), 0);
  /** One fee divided into the terms: rounded to 50 XAF, with any rounding difference kept in the first term. */
  const divide = (amount, feeType) => {
    if (newOnly[feeType]) return terms.map((_, i) => (i === 0 ? amount : 0));
    const parts = terms.map((_, i) => round50((amount * (Number(split[i]) || 0)) / 100));
    parts[0] += amount - parts.reduce((t, p) => t + p, 0);
    return parts;
  };
  const perTerm = (classId, isNew) => terms.map((_, i) => FEE_TYPES.reduce((t, ft) => t + (!isNew && newOnly[ft.id] ? 0 : divide(Number(grid[`${classId}:${ft.id}`]) || 0, ft.id)[i]), 0));

  const save = () => {
    if (pctTotal !== 100) return notify('The term percentages must add up to 100%.');
    const ids = new Set(terms.map((t) => t.id));
    api.mutate((d) => {
      d.feeItems = d.feeItems.filter((f) => !ids.has(f.termId));
      for (const c of classes) {
        for (const ft of FEE_TYPES) {
          const amount = Number(grid[`${c.id}:${ft.id}`]) || 0;
          if (amount <= 0) continue;
          divide(amount, ft.id).forEach((part, i) => {
            if (part > 0) d.feeItems.push({ id: `fi-${terms[i].id}-${c.id}-${ft.id}`, sessionId, termId: terms[i].id, classId: c.id, feeType: ft.id, amount: part, appliesTo: newOnly[ft.id] ? 'new' : 'all' });
          });
        }
      }
      return d;
    });
    api.setSettings({ feeSplit: { ...(db.settings.feeSplit || {}), [sessionId]: split.map(Number) } });
    api.log('Updated fee structure (whole year)', `${session.name} · ${split.join('/')}%`);
    notify(`Fees saved for ${session.name}, divided into ${terms.length} terms. Parents see each term’s amount.`);
  };

  if (!session || !terms.length) return <Card><p className="text-sm text-slate-500">Create the school year and its terms under School Profile → Sessions &amp; Calendar first.</p></Card>;

  return (
    <Card
      bodyClass=""
      title={<div className="flex items-center gap-2"><span>School year</span><select className="input w-auto py-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="School year">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
      actions={<Button icon={Save} onClick={save}>Save and divide into terms</Button>}
    >
      <div className="border-b border-slate-100 bg-slate-50 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><SplitSquareHorizontal className="size-4 text-brand-700" />How the year’s fees are divided</p>
        <div className="flex flex-wrap items-end gap-3">
          {terms.map((t, i) => (
            <Field key={t.id} label={t.name}>
              <div className="relative w-28">
                <input className="input pr-8 text-right tabular-nums" type="number" min="0" max="100" value={split[i] ?? ''} onChange={(e) => setSplit(split.map((p, j) => (j === i ? e.target.value : p)))} aria-label={`${t.name} %`} />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
            </Field>
          ))}
          <Select className="w-52" value="" onChange={(e) => e.target.value && setSplit(e.target.value.split('/').map(Number))} placeholder="Quick choice…"
            options={[
              { value: terms.map((_, i) => (i === 0 ? 100 - Math.floor(100 / terms.length) * (terms.length - 1) : Math.floor(100 / terms.length))).join('/'), label: 'Equal parts' },
              ...(terms.length === 3 ? [{ value: '40/30/30', label: '40% / 30% / 30%' }, { value: '50/25/25', label: '50% / 25% / 25%' }, { value: '50/30/20', label: '50% / 30% / 20%' }] : []),
            ]} />
          <span className={`pb-2 text-sm font-semibold ${pctTotal === 100 ? 'text-emerald-700' : 'text-rose-600'}`}>Total {pctTotal}%</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Fees ticked “new pupils only” (such as registration) are charged in full in the first term.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Class</th>
              {FEE_TYPES.map((ft) => (
                <th key={ft.id} className="min-w-32">
                  {ft.label} <span className="font-normal normal-case">(year)</span>
                  <label className="mt-1 flex items-center gap-1 text-[10px] font-medium tracking-normal normal-case">
                    <input type="checkbox" checked={!!newOnly[ft.id]} onChange={(e) => setNewOnly({ ...newOnly, [ft.id]: e.target.checked })} /> new pupils only
                  </label>
                </th>
              ))}
              <th className="text-right">Year total</th>
              <th className="min-w-56">Per term (returning pupil)</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => {
              const parts = perTerm(c.id, false);
              const fresh = perTerm(c.id, true);
              const year = parts.reduce((t, p) => t + p, 0);
              return (
                <tr key={c.id}>
                  <td className="font-semibold whitespace-nowrap text-slate-800">{c.name}</td>
                  {FEE_TYPES.map((ft) => (
                    <td key={ft.id}>
                      <input className="input tabular-nums" type="number" min="0" step="500" value={grid[`${c.id}:${ft.id}`] ?? ''} placeholder="0"
                        onChange={(e) => setGrid({ ...grid, [`${c.id}:${ft.id}`]: e.target.value })} aria-label={`${c.name} ${ft.label} for the year`} />
                    </td>
                  ))}
                  <td className="text-right font-semibold whitespace-nowrap tabular-nums">{money(year, '')}</td>
                  <td className="text-xs whitespace-nowrap text-slate-600 tabular-nums">
                    {year ? terms.map((t, i) => <span key={t.id} className="mr-3 inline-block"><b className="text-slate-800">{money(parts[i], '')}</b> <span className="text-slate-400">{t.name.replace(/ Term$/, '')}</span></span>) : '—'}
                    {fresh[0] !== parts[0] && year > 0 && <span className="block text-brand-700">New pupil, first term: {money(fresh[0], '')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
