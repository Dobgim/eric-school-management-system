import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, Minus, PackagePlus, Pencil, Plus, ShoppingCart, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { PAYMENT_METHODS, fmtDate, fullName, methodLabel, money, pad, sum, today, uid } from '../lib/utils';
import { Badge, Button, Card, DataTable, Empty, ExportButtons, Field, Input, Modal, PageHeader, SearchInput, Select, StatCard, Tabs, useToast } from '../components/ui';

const CATEGORIES = ['Uniform', 'Book', 'Stationery', 'Material'];
const label = (it) => `${it.name}${it.size && it.size !== '—' ? ` (${it.size})` : ''}`;

export default function Inventory() {
  const { db } = useStore();
  const [tab, setTab] = useState('items');
  const [toast, notify] = useToast();
  const low = db.inventory.filter((i) => i.quantity <= i.reorderLevel);
  const cost = sum(db.inventory, (i) => i.quantity * i.costPrice);
  const retail = sum(db.inventory, (i) => i.quantity * i.sellPrice);
  const salesTotal = sum(db.sales, (s) => s.total);
  const cur = db.school.currency;
  return (
    <>
      {toast}
      <PageHeader title="Uniforms & School Materials" subtitle="Stock of uniforms, books and materials, sales to pupils, and low-stock alerts." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Items in catalogue" value={db.inventory.length} hint={`${sum(db.inventory, (i) => i.quantity)} units in stock`} />
        <StatCard label="Stock value (cost)" value={money(cost, cur)} tone="purple" hint={`Retail value ${money(retail, cur)}`} />
        <StatCard label="Sales to date" value={money(salesTotal, cur)} tone="green" hint={`${db.sales.length} sales`} />
        <StatCard label="Low-stock alerts" value={low.length} tone={low.length ? 'red' : 'green'} hint={low.length ? 'At or below reorder level' : 'All good'} />
      </div>
      <Tabs tabs={[{ id: 'items', label: 'Stock' }, { id: 'sell', label: 'New sale', icon: ShoppingCart }, { id: 'sales', label: 'Sales', count: db.sales.length }, { id: 'moves', label: 'Stock movements' }, { id: 'valuation', label: 'Valuation' }]} value={tab} onChange={setTab} />
      {tab === 'items' && <Items notify={notify} />}
      {tab === 'sell' && <NewSale notify={notify} onDone={() => setTab('sales')} />}
      {tab === 'sales' && <Sales />}
      {tab === 'moves' && <Movements />}
      {tab === 'valuation' && <Valuation />}
    </>
  );
}

function Items({ notify }) {
  const { db, api, user } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [move, setMove] = useState(null);
  const rows = db.inventory
    .filter((i) => !cat || i.category === cat)
    .filter((i) => !onlyLow || i.quantity <= i.reorderLevel)
    .filter((i) => !q.trim() || `${i.name} ${i.sku} ${i.size}`.toLowerCase().includes(q.trim().toLowerCase()));
  const levelLabel = (l) => (l === 'all' ? 'All classes' : l === 'nursery' ? 'Nursery' : l === 'primary' ? 'Primary' : db.classes.find((c) => c.id === l)?.name || l);

  const save = () => {
    const it = { ...editing, costPrice: Number(editing.costPrice) || 0, sellPrice: Number(editing.sellPrice) || 0, reorderLevel: Number(editing.reorderLevel) || 0 };
    if (!it.name.trim()) return notify('Item name is required.');
    if (it.id) {
      const { quantity, ...rest } = it;
      api.update('inventory', it.id, rest);
      api.log('Updated inventory item', label(it));
    } else {
      const opening = Number(it.quantity) || 0;
      const created = api.add('inventory', { ...it, id: uid('it'), quantity: opening, sku: `${it.category.slice(0, 3).toUpperCase()}-${pad(db.inventory.length + 1, 3)}` });
      if (opening) api.add('stockMovements', { id: uid('sm'), itemId: created.id, type: 'in', qty: opening, unitCost: it.costPrice, date: today(), note: 'Opening stock', by: user.id });
      api.log('Added inventory item', label(it));
    }
    setEditing(null);
  };

  const saveMove = () => {
    const qty = Number(move.qty);
    if (!qty || qty <= 0) return notify('Enter a quantity.');
    const it = db.inventory.find((i) => i.id === move.itemId);
    const delta = move.type === 'in' ? qty : -qty;
    if (it.quantity + delta < 0) return notify(`Only ${it.quantity} in stock.`);
    api.update('inventory', it.id, (cur) => ({ quantity: cur.quantity + delta, ...(move.type === 'in' && move.unitCost ? { costPrice: Number(move.unitCost) } : {}) }));
    api.add('stockMovements', { id: uid('sm'), itemId: it.id, type: move.type, qty, unitCost: Number(move.unitCost) || it.costPrice, date: move.date, note: move.note, by: user.id });
    api.log(move.type === 'in' ? 'Stock in' : 'Stock out', `${qty} × ${label(it)}${move.note ? ` — ${move.note}` : ''}`);
    notify(`${label(it)}: ${it.quantity} → ${it.quantity + delta}`);
    setMove(null);
  };

  return (
    <Card bodyClass="">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <SearchInput value={q} onChange={setQ} placeholder="Item, SKU or size…" className="w-full sm:w-64" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={CATEGORIES} className="sm:w-44" />
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Low stock only</label>
        <Button className="ml-auto" size="sm" icon={Plus} onClick={() => setEditing({ name: '', category: 'Uniform', size: '—', classLevel: 'all', costPrice: '', sellPrice: '', quantity: '', reorderLevel: db.settings.lowStockDefault })}>New item</Button>
      </div>
      <DataTable
        rows={rows}
        pageSize={25}
        columns={[
          { key: 'name', label: 'Item', render: (i) => <div><p className="font-semibold text-slate-800">{i.name}</p><p className="font-mono text-xs text-slate-500">{i.sku}</p></div> },
          { key: 'size', label: 'Size' },
          { key: 'category', label: 'Category', render: (i) => <Badge tone={i.category === 'Uniform' ? 'blue' : i.category === 'Book' ? 'purple' : 'slate'}>{i.category}</Badge> },
          { key: 'level', label: 'For', render: (i) => levelLabel(i.classLevel) },
          { key: 'cost', label: 'Cost', align: 'right', render: (i) => money(i.costPrice, '') },
          { key: 'price', label: 'Price', align: 'right', render: (i) => <b>{money(i.sellPrice, '')}</b> },
          { key: 'qty', label: 'In stock', align: 'right', render: (i) => <span className={i.quantity <= i.reorderLevel ? 'font-bold text-rose-600' : 'font-semibold'}>{i.quantity}</span> },
          { key: 'alert', label: '', render: (i) => (i.quantity === 0 ? <Badge tone="red">Out of stock</Badge> : i.quantity <= i.reorderLevel ? <Badge tone="amber">Reorder (≤{i.reorderLevel})</Badge> : null) },
          { key: 'a', label: '', align: 'right', render: (i) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={ArrowDownToLine} onClick={() => setMove({ itemId: i.id, type: 'in', qty: '', unitCost: i.costPrice, date: today(), note: '' })}>In</Button>
              <Button size="sm" variant="ghost" icon={Minus} onClick={() => setMove({ itemId: i.id, type: 'out', qty: '', date: today(), note: '' })}>Out</Button>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...i })} aria-label="Edit" />
            </div>
          ) },
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit item' : 'New item'} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Item name" className="sm:col-span-2"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Category"><Select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} options={CATEGORIES} /></Field>
            <Field label="Size"><Input value={editing.size} onChange={(e) => setEditing({ ...editing, size: e.target.value })} placeholder="S, M, L, XL or —" /></Field>
            <Field label="For class category"><Select value={editing.classLevel} onChange={(e) => setEditing({ ...editing, classLevel: e.target.value })} options={[{ value: 'all', label: 'All classes' }, { value: 'nursery', label: 'Nursery' }, { value: 'primary', label: 'Primary' }, ...[...db.classes].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name }))]} /></Field>
            <Field label="Reorder level" hint="Alert when stock falls to this number."><Input type="number" min="0" value={editing.reorderLevel} onChange={(e) => setEditing({ ...editing, reorderLevel: e.target.value })} /></Field>
            <Field label="Cost price"><Input type="number" min="0" value={editing.costPrice} onChange={(e) => setEditing({ ...editing, costPrice: e.target.value })} /></Field>
            <Field label="Selling price"><Input type="number" min="0" value={editing.sellPrice} onChange={(e) => setEditing({ ...editing, sellPrice: e.target.value })} /></Field>
            {!editing.id && <Field label="Opening quantity"><Input type="number" min="0" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} /></Field>}
          </div>
        )}
      </Modal>
      <Modal open={!!move} onClose={() => setMove(null)} size="sm" title={move?.type === 'in' ? 'Stock in (receive)' : 'Stock out (issue / damage)'} footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button onClick={saveMove}>Save</Button></>}>
        {move && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">{label(db.inventory.find((i) => i.id === move.itemId))} · {db.inventory.find((i) => i.id === move.itemId)?.quantity} in stock</p>
            <Field label="Quantity"><Input type="number" min="1" value={move.qty} onChange={(e) => setMove({ ...move, qty: e.target.value })} autoFocus /></Field>
            {move.type === 'in' && <Field label="Unit cost"><Input type="number" min="0" value={move.unitCost} onChange={(e) => setMove({ ...move, unitCost: e.target.value })} /></Field>}
            <Field label="Date"><Input type="date" value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} /></Field>
            <Field label={move.type === 'in' ? 'Supplier / note' : 'Reason'}><Input value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} placeholder={move.type === 'in' ? 'e.g. Tailor delivery' : 'e.g. Damaged, given to staff child'} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function NewSale({ notify, onDone }) {
  const { db, api, user } = useStore();
  const [q, setQ] = useState('');
  const [studentId, setStudentId] = useState('');
  const [lines, setLines] = useState([]);
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(today());
  const [pick, setPick] = useState('');
  const student = db.students.find((s) => s.id === studentId);
  const level = student && db.classes.find((c) => c.id === student.classId)?.level;
  const matches = q.trim().length >= 2 ? db.students.filter((s) => s.status === 'active' && `${fullName(s)} ${s.regNo}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const items = db.inventory.filter((i) => i.quantity > 0).sort((a, b) => {
    const fits = (x) => (x.classLevel === 'all' || x.classLevel === level || x.classLevel === student?.classId ? 0 : 1);
    return fits(a) - fits(b) || a.name.localeCompare(b.name);
  });
  const total = sum(lines, (l) => l.qty * l.price);

  const add = () => {
    const it = db.inventory.find((i) => i.id === pick);
    if (!it) return;
    setLines((ls) => (ls.some((l) => l.itemId === it.id) ? ls.map((l) => (l.itemId === it.id ? { ...l, qty: Math.min(it.quantity, l.qty + 1) } : l)) : [...ls, { itemId: it.id, name: label(it), qty: 1, price: it.sellPrice, max: it.quantity }]));
    setPick('');
  };

  const save = async () => {
    if (!student) return notify('Choose the pupil.');
    if (!lines.length) return notify('Add at least one item.');
    let saleNo;
    try { saleNo = `SAL-${pad(await api.nextCounter('sale'), 5)}`; } catch (e) { return notify(e.message); }
    const saleId = uid('sl');
    api.mutate((d) => {
      d.sales.push({ id: saleId, saleNo, studentId, date, items: lines.map(({ max, ...l }) => l), total, method, by: user.id });
      lines.forEach((l) => {
        const it = d.inventory.find((i) => i.id === l.itemId);
        it.quantity -= l.qty;
        d.stockMovements.push({ id: uid('sm'), itemId: l.itemId, type: 'sale', qty: l.qty, unitCost: it.costPrice, date, note: `Sale ${saleNo}`, by: user.id, saleId });
      });
      return d;
    });
    api.log('Sold uniforms/materials', `${saleNo} — ${fullName(student)} — ${money(total, db.school.currency)}`);
    notify(`Sale ${saleNo} saved.`);
    onDone();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card title="Items">
        {!student ? (
          <Field label="Sell to pupil">
            <SearchInput value={q} onChange={setQ} placeholder="Type a name or reg. no…" />
            {matches.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {matches.map((s) => <li key={s.id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setStudentId(s.id)}><b>{fullName(s)}</b><span className="text-slate-500">{db.classes.find((c) => c.id === s.classId)?.name}</span></button></li>)}
              </ul>
            )}
          </Field>
        ) : (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
            <div><p className="font-bold text-brand-900">{fullName(student)}</p><p className="text-xs text-brand-700">{db.classes.find((c) => c.id === student.classId)?.name} · {student.regNo}</p></div>
            <Button size="sm" variant="ghost" onClick={() => setStudentId('')}>Change</Button>
          </div>
        )}
        {student && (
          <>
            <div className="flex gap-2">
              <Select value={pick} onChange={(e) => setPick(e.target.value)} placeholder="— Choose item —" options={items.map((i) => ({ value: i.id, label: `${label(i)} · ${money(i.sellPrice, '')} · ${i.quantity} left` }))} />
              <Button icon={Plus} onClick={add} disabled={!pick}>Add</Button>
            </div>
            {lines.length ? (
              <table className="table-base mt-4">
                <thead><tr><th>Item</th><th className="w-24">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th><th /></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.itemId}>
                      <td>{l.name}</td>
                      <td><input className="input" type="number" min="1" max={l.max} value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.itemId === l.itemId ? { ...x, qty: Math.max(1, Math.min(l.max, Number(e.target.value) || 1)) } : x)))} aria-label="Quantity" /></td>
                      <td className="text-right tabular-nums">{money(l.price, '')}</td>
                      <td className="text-right font-semibold tabular-nums">{money(l.qty * l.price, '')}</td>
                      <td className="text-right"><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLines(lines.filter((x) => x.itemId !== l.itemId))} aria-label="Remove" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty title="No items yet" message="Items for the pupil’s class are listed first." />}
          </>
        )}
      </Card>
      <Card title="Payment" className="h-fit">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">Total</span><span className="text-2xl font-bold tabular-nums">{money(total, db.school.currency)}</span></div>
          <Field label="Paid by"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))} /></Field>
          <Field label="Date"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Button className="w-full" icon={ShoppingCart} onClick={save} disabled={!student || !lines.length}>Complete sale</Button>
        </div>
      </Card>
    </div>
  );
}

function Sales() {
  const { db } = useStore();
  const [f, setF] = useState({ q: '', from: '', to: '' });
  const rows = useMemo(() => db.sales
    .map((s) => ({ ...s, student: db.students.find((x) => x.id === s.studentId) }))
    .filter((s) => (!f.from || s.date >= f.from) && (!f.to || s.date <= f.to))
    .filter((s) => !f.q.trim() || `${s.saleNo} ${fullName(s.student)} ${s.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(f.q.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date)), [db, f]);
  const total = sum(rows, (r) => r.total);
  const cols = [{ key: 'saleNo', label: 'Sale No' }, { key: 'date', label: 'Date', format: fmtDate }, { key: 'pupil', label: 'Pupil' }, { key: 'className', label: 'Class' }, { key: 'itemsText', label: 'Items' }, { key: 'method', label: 'Paid by', format: methodLabel }, { key: 'total', label: 'Total', align: 'right', format: (v) => money(v, '') }];
  const exportRows = () => rows.map((r) => ({ ...r, pupil: fullName(r.student), className: db.classes.find((c) => c.id === r.student?.classId)?.name, itemsText: r.items.map((i) => `${i.qty}x ${i.name}`).join(', ') }));
  return (
    <Card bodyClass="">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Sale no, pupil or item…" className="w-full sm:w-64" />
        <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="sm:w-40" aria-label="From" />
        <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="sm:w-40" aria-label="To" />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-slate-500">{rows.length} sales · <b className="text-slate-800">{money(total, db.school.currency)}</b></span>
          <ExportButtons onPdf={() => exportTablePDF({ school: db.school, title: 'Uniform & Materials Sales', columns: cols, rows: exportRows(), summary: [['Sales', String(rows.length)], ['Total', money(total, db.school.currency)]], landscape: true })} onExcel={() => exportExcel({ title: 'Uniform & Materials Sales', columns: cols, rows: exportRows(), summary: [['Total', total]] })} />
        </div>
      </div>
      <DataTable
        rows={rows}
        pageSize={20}
        columns={[
          { key: 'saleNo', label: 'Sale', render: (s) => <span className="font-mono text-xs">{s.saleNo}</span> },
          { key: 'date', label: 'Date', render: (s) => fmtDate(s.date) },
          { key: 'pupil', label: 'Pupil', render: (s) => <Link to={`/students/${s.studentId}`} className="font-semibold text-slate-800 hover:text-brand-700">{fullName(s.student)}</Link> },
          { key: 'items', label: 'Items', render: (s) => <span className="text-slate-600">{s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span> },
          { key: 'method', label: 'Paid by', render: (s) => methodLabel(s.method) },
          { key: 'total', label: 'Total', align: 'right', render: (s) => <b>{money(s.total, '')}</b> },
        ]}
      />
    </Card>
  );
}

function Movements() {
  const { db } = useStore();
  const [itemId, setItemId] = useState('');
  const rows = db.stockMovements.filter((m) => !itemId || m.itemId === itemId).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card bodyClass="" title="Stock movements" actions={<Select value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="All items" options={db.inventory.map((i) => ({ value: i.id, label: label(i) }))} className="w-64" />}>
      <DataTable
        rows={rows}
        pageSize={25}
        columns={[
          { key: 'date', label: 'Date', render: (m) => fmtDate(m.date) },
          { key: 'item', label: 'Item', render: (m) => label(db.inventory.find((i) => i.id === m.itemId) || { name: '(deleted)' }) },
          { key: 'type', label: 'Type', render: (m) => <Badge tone={m.type === 'in' ? 'green' : m.type === 'sale' ? 'blue' : 'red'}>{m.type === 'in' ? 'Stock in' : m.type === 'sale' ? 'Sale' : 'Stock out'}</Badge> },
          { key: 'qty', label: 'Qty', align: 'right', render: (m) => <span className={m.type === 'in' ? 'text-emerald-700' : 'text-rose-600'}>{m.type === 'in' ? '+' : '−'}{m.qty}</span> },
          { key: 'note', label: 'Note', className: 'text-slate-600' },
          { key: 'by', label: 'By', render: (m) => db.users.find((u) => u.id === m.by)?.name || '—' },
        ]}
      />
    </Card>
  );
}

function Valuation() {
  const { db } = useStore();
  const cur = db.school.currency;
  const sold = (id) => sum(db.stockMovements.filter((m) => m.itemId === id && m.type === 'sale'), (m) => m.qty);
  const rows = db.inventory.map((i) => ({ ...i, label: label(i), costValue: i.quantity * i.costPrice, retailValue: i.quantity * i.sellPrice, sold: sold(i.id), revenue: sold(i.id) * i.sellPrice }));
  const byCat = CATEGORIES.map((c) => ({ c, cost: sum(rows.filter((r) => r.category === c), (r) => r.costValue), retail: sum(rows.filter((r) => r.category === c), (r) => r.retailValue) }));
  const cols = [{ key: 'sku', label: 'SKU' }, { key: 'label', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'quantity', label: 'Qty', align: 'right' }, { key: 'costPrice', label: 'Unit cost', align: 'right' }, { key: 'costValue', label: 'Cost value', align: 'right' }, { key: 'retailValue', label: 'Retail value', align: 'right' }, { key: 'sold', label: 'Units sold', align: 'right' }];
  const pdfCols = cols.map((c) => (['costPrice', 'costValue', 'retailValue'].includes(c.key) ? { ...c, format: (v) => money(v, '') } : c));
  const summary = [['Total cost value', money(sum(rows, (r) => r.costValue), cur)], ['Total retail value', money(sum(rows, (r) => r.retailValue), cur)], ['Potential margin', money(sum(rows, (r) => r.retailValue - r.costValue), cur)]];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {byCat.map((x) => <StatCard key={x.c} label={x.c} value={money(x.cost, cur)} hint={`Retail ${money(x.retail, cur)}`} icon={x.c === 'Uniform' ? SlidersHorizontal : PackagePlus} />)}
      </div>
      <Card title="Inventory valuation" bodyClass="" actions={<ExportButtons onPdf={() => exportTablePDF({ school: db.school, title: 'Inventory Valuation Report', columns: pdfCols, rows, summary, landscape: true })} onExcel={() => exportExcel({ title: 'Inventory Valuation', columns: cols, rows })} />}>
        <DataTable
          rows={rows}
          pageSize={30}
          columns={[
            { key: 'label', label: 'Item', render: (r) => <span className="font-semibold text-slate-800">{r.label}</span> },
            { key: 'category', label: 'Category' },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'costValue', label: 'Cost value', align: 'right', render: (r) => money(r.costValue, '') },
            { key: 'retailValue', label: 'Retail value', align: 'right', render: (r) => money(r.retailValue, '') },
            { key: 'sold', label: 'Units sold', align: 'right' },
            { key: 'revenue', label: 'Sales revenue', align: 'right', render: (r) => money(r.revenue, '') },
          ]}
          footer={<tr className="bg-slate-50 font-bold"><td className="px-4 py-3" colSpan={3}>Total</td><td className="px-4 py-3 text-right tabular-nums">{money(sum(rows, (r) => r.costValue), '')}</td><td className="px-4 py-3 text-right tabular-nums">{money(sum(rows, (r) => r.retailValue), '')}</td><td className="px-4 py-3 text-right tabular-nums">{sum(rows, (r) => r.sold)}</td><td className="px-4 py-3 text-right tabular-nums">{money(sum(rows, (r) => r.revenue), '')}</td></tr>}
        />
      </Card>
    </div>
  );
}
