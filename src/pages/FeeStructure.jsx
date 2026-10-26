import { useEffect, useState } from 'react';
import { Copy, Save } from 'lucide-react';
import { useStore } from '../lib/store';
import { allTerms } from '../lib/finance';
import { FEE_TYPES, money } from '../lib/utils';
import { Button, Card, Field, Input, Modal, PageHeader, Select, useToast } from '../components/ui';

export default function FeeStructure() {
  const { db, api } = useStore();
  const [toast, notify] = useToast();
  const terms = allTerms(db);
  const [termId, setTermId] = useState(db.settings.currentTermId);
  const term = terms.find((t) => t.id === termId);
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const [grid, setGrid] = useState({});
  const [newOnly, setNewOnly] = useState({});
  const [copy, setCopy] = useState(null);
  const [cats, setCats] = useState(db.categories);

  useEffect(() => {
    const g = {};
    const n = {};
    db.feeItems.filter((f) => f.termId === termId).forEach((f) => {
      g[`${f.classId}:${f.feeType}`] = f.amount;
      if (f.appliesTo === 'new') n[f.feeType] = true;
    });
    if (!Object.keys(g).length) n.registration = true;
    setGrid(g);
    setNewOnly(n);
    // reload only when switching term
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const total = (classId, isNew) => FEE_TYPES.reduce((t, ft) => t + (!isNew && newOnly[ft.id] ? 0 : Number(grid[`${classId}:${ft.id}`]) || 0), 0);

  const save = () => {
    api.mutate((d) => {
      d.feeItems = d.feeItems.filter((f) => f.termId !== termId);
      classes.forEach((c) => FEE_TYPES.forEach((ft) => {
        const amount = Number(grid[`${c.id}:${ft.id}`]) || 0;
        if (amount > 0) d.feeItems.push({ id: `fi-${termId}-${c.id}-${ft.id}`, sessionId: term.sessionId, termId, classId: c.id, feeType: ft.id, amount, appliesTo: newOnly[ft.id] ? 'new' : 'all' });
      }));
      return d;
    });
    api.log('Updated fee structure', term.label);
    notify(`Fee structure saved for ${term.label}.`);
  };

  const doCopy = () => {
    const src = db.feeItems.filter((f) => f.termId === copy.from);
    const g = {};
    const n = {};
    const pct = Number(copy.increase) || 0;
    src.forEach((f) => {
      g[`${f.classId}:${f.feeType}`] = Math.round((f.amount * (1 + pct / 100)) / 500) * 500;
      if (f.appliesTo === 'new') n[f.feeType] = true;
    });
    setGrid(g);
    setNewOnly(n);
    setCopy(null);
    notify('Copied — review the amounts, then click Save.');
  };

  return (
    <>
      {toast}
      <PageHeader title="Fee Structure" subtitle="Set what each class pays per term and per fee category. Changes affect balances for that term immediately." />
      <Card
        bodyClass=""
        actions={<><Button variant="secondary" icon={Copy} onClick={() => setCopy({ from: terms[Math.max(0, terms.findIndex((t) => t.id === termId) - 1)]?.id, increase: 0 })}>Copy from another term</Button><Button icon={Save} onClick={save}>Save</Button></>}
        title={
          <div className="flex items-center gap-2">
            <span>Fees for</span>
            <select className="input w-auto py-1" value={termId} onChange={(e) => setTermId(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Class</th>
                {FEE_TYPES.map((ft) => (
                  <th key={ft.id} className="min-w-32">
                    {ft.label}
                    <label className="mt-1 flex items-center gap-1 text-[10px] font-medium tracking-normal normal-case">
                      <input type="checkbox" checked={!!newOnly[ft.id]} onChange={(e) => setNewOnly({ ...newOnly, [ft.id]: e.target.checked })} /> new pupils only
                    </label>
                  </th>
                ))}
                <th className="text-right">Returning pupil</th>
                <th className="text-right">New pupil</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold whitespace-nowrap text-slate-800">{c.name}</td>
                  {FEE_TYPES.map((ft) => (
                    <td key={ft.id}>
                      <input className="input tabular-nums" type="number" min="0" step="500" value={grid[`${c.id}:${ft.id}`] ?? ''} placeholder="0" onChange={(e) => setGrid({ ...grid, [`${c.id}:${ft.id}`]: e.target.value })} aria-label={`${c.name} ${ft.label}`} />
                    </td>
                  ))}
                  <td className="text-right font-semibold whitespace-nowrap tabular-nums">{money(total(c.id, false), '')}</td>
                  <td className="text-right font-semibold whitespace-nowrap text-brand-700 tabular-nums">{money(total(c.id, true), '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Pupil fee categories (tuition discounts)" className="mt-6" actions={<Button icon={Save} onClick={() => { api.mutate((d) => { d.categories = cats; return d; }); api.log('Updated fee categories'); notify('Categories saved.'); }}>Save categories</Button>}>
        <div className="grid gap-4 sm:grid-cols-3">
          {cats.map((c, i) => (
            <div key={c.id} className="rounded-xl border border-slate-200 p-4">
              <Field label="Category name"><Input value={c.name} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
              <Field label="Tuition discount (%)" className="mt-3"><Input type="number" min="0" max="100" value={c.tuitionDiscount} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, tuitionDiscount: Number(e.target.value) } : x)))} /></Field>
              <p className="mt-2 text-xs text-slate-500">{db.students.filter((s) => s.status === 'active' && s.category === c.id).length} active pupils</p>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={!!copy} onClose={() => setCopy(null)} title="Copy fees from another term" size="sm" footer={<><Button variant="secondary" onClick={() => setCopy(null)}>Cancel</Button><Button onClick={doCopy}>Copy</Button></>}>
        {copy && (
          <div className="space-y-4">
            <Field label="Copy from"><Select value={copy.from} onChange={(e) => setCopy({ ...copy, from: e.target.value })} options={terms.filter((t) => t.id !== termId).map((t) => ({ value: t.id, label: t.label }))} /></Field>
            <Field label="Increase by (%)" hint="Rounded to the nearest 500. Use 0 to copy as is."><Input type="number" value={copy.increase} onChange={(e) => setCopy({ ...copy, increase: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
