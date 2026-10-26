import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentTerm } from '../lib/finance';
import { exportExcel, exportTablePDF } from '../lib/exporters';
import { age, fmtDate, fullName } from '../lib/utils';
import { Avatar, Badge, Button, Card, DataTable, Empty, ExportButtons, PageHeader, Select, StatCard, Tabs, useToast } from '../components/ui';
import Academics from './Academics';
import { AnnouncementList, visibleAnnouncements } from './Announcements';

export default function MyClass() {
  const { db, user } = useStore();
  const [tab, setTab] = useState('list');
  const cls = db.classes.find((c) => c.teacherId === user.staffId);
  const term = currentTerm(db);
  if (!cls) return <><PageHeader title="My Class" /><Empty title="No class assigned yet" message="Ask the administrator to assign you to a class under School Profile → Classes." /></>;
  const pupils = db.students.filter((s) => s.status === 'active' && s.classId === cls.id).sort((a, b) => a.lastName.localeCompare(b.lastName));
  const boys = pupils.filter((s) => s.gender === 'M').length;
  return (
    <>
      <PageHeader title={`My Class · ${cls.name}`} subtitle={`${term.label} · ${db.facilities.find((f) => f.id === cls.facilityId)?.name || ''}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pupils" value={`${pupils.length} / ${cls.capacity}`} icon={Users} />
        <StatCard label="Boys" value={boys} tone="blue" />
        <StatCard label="Girls" value={pupils.length - boys} tone="purple" />
      </div>
      <Tabs tabs={[{ id: 'list', label: 'Class list', count: pupils.length }, { id: 'results', label: 'Term results' }, { id: 'promotion', label: 'Promotion recommendations' }, { id: 'news', label: 'Announcements' }]} value={tab} onChange={setTab} />
      {tab === 'list' && <ClassList cls={cls} pupils={pupils} />}
      {tab === 'results' && <Academics lockedClassId={cls.id} />}
      {tab === 'promotion' && <Recommendations cls={cls} pupils={pupils} />}
      {tab === 'news' && <div className="max-w-3xl"><AnnouncementList items={visibleAnnouncements(db, user)} /></div>}
    </>
  );
}

function ClassList({ cls, pupils }) {
  const { db } = useStore();
  const rows = pupils.map((s, i) => { const g = db.guardians.find((x) => x.id === s.guardianIds[0]); return { ...s, n: i + 1, name: fullName(s), parent: g?.name, phone: g?.phone, dobText: fmtDate(s.dob), ageN: age(s.dob) }; });
  const cols = [{ key: 'n', label: '#' }, { key: 'regNo', label: 'Reg. No' }, { key: 'name', label: 'Name' }, { key: 'gender', label: 'Sex' }, { key: 'dobText', label: 'Date of birth' }, { key: 'parent', label: 'Parent' }, { key: 'phone', label: 'Phone' }];
  return (
    <Card bodyClass="" title="Pupils" actions={<ExportButtons onPdf={() => exportTablePDF({ school: db.school, title: `Class List - ${cls.name}`, columns: cols, rows })} onExcel={() => exportExcel({ title: `Class List ${cls.name}`, columns: cols, rows })} />}>
      <DataTable
        rows={rows}
        pageSize={50}
        columns={[
          { key: 'n', label: '#' },
          { key: 'name', label: 'Pupil', render: (s) => <Link to={`/students/${s.id}`} className="flex items-center gap-3"><Avatar name={s.name} src={s.photo} size="sm" /><div><p className="font-semibold text-slate-800 hover:text-brand-700">{s.name}</p><p className="font-mono text-xs text-slate-500">{s.regNo}</p></div></Link> },
          { key: 'gender', label: 'Sex', render: (s) => (s.gender === 'M' ? 'Boy' : 'Girl') },
          { key: 'ageN', label: 'Age' },
          { key: 'parent', label: 'Parent', render: (s) => <div><p>{s.parent}</p><p className="text-xs text-slate-500">{s.phone}</p></div> },
          { key: 'med', label: 'Health', render: (s) => (s.allergies || s.medicalNotes ? <Badge tone="red" className="max-w-48 truncate">{s.allergies ? `Allergy: ${s.allergies}` : s.medicalNotes}</Badge> : '—') },
        ]}
      />
    </Card>
  );
}

function Recommendations({ cls, pupils }) {
  const { db, api, user } = useStore();
  const [toast, notify] = useToast();
  const sessionId = db.settings.currentSessionId;
  const [recs, setRecs] = useState(() => Object.fromEntries(pupils.map((p) => {
    const r = db.promotionRecommendations.find((x) => x.studentId === p.id && x.sessionId === sessionId);
    return [p.id, { recommendation: r?.recommendation || '', remark: r?.remark || '' }];
  })));
  const avg = (id) => {
    const list = db.academicRecords.filter((r) => r.studentId === id && r.sessionId === sessionId);
    return list.length ? (list.reduce((t, r) => t + r.average, 0) / list.length).toFixed(2) : null;
  };
  const save = () => {
    api.mutate((d) => {
      d.promotionRecommendations = d.promotionRecommendations.filter((r) => !(r.sessionId === sessionId && pupils.some((p) => p.id === r.studentId)));
      Object.entries(recs).forEach(([studentId, r]) => { if (r.recommendation) d.promotionRecommendations.push({ studentId, sessionId, ...r, by: user.id, at: new Date().toISOString() }); });
      return d;
    });
    api.log('Submitted promotion recommendations', `${cls.name} — ${Object.values(recs).filter((r) => r.recommendation).length} pupil(s)`);
    notify('Recommendations sent to the office.');
  };
  return (
    <Card title={`End-of-year recommendations · ${db.sessions.find((s) => s.id === sessionId)?.name}`} bodyClass="" actions={<Button icon={Save} onClick={save}>Submit</Button>}>
      {toast}
      <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">Your recommendation is shown to the office when they run promotion. The final decision is made there.</p>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Pupil</th><th className="text-right">Session avg</th><th className="w-48">Recommendation</th><th>Remark</th></tr></thead>
          <tbody>
            {pupils.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold text-slate-800">{fullName(p)}</td>
                <td className="text-right tabular-nums">{avg(p.id) ?? '—'}</td>
                <td><Select value={recs[p.id]?.recommendation || ''} onChange={(e) => setRecs({ ...recs, [p.id]: { ...recs[p.id], recommendation: e.target.value } })} placeholder="— Not set —" options={[{ value: 'promote', label: 'Promote' }, { value: 'repeat', label: 'Repeat' }]} /></td>
                <td><input className="input min-w-56" value={recs[p.id]?.remark || ''} onChange={(e) => setRecs({ ...recs, [p.id]: { ...recs[p.id], remark: e.target.value } })} aria-label="Remark" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
