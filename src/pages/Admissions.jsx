import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { age, fmtDate, fmtDateTime, today } from '../lib/utils';
import { Badge, Button, Card, DataTable, Empty, Field, Info, Input, Modal, PageHeader, Select, Tabs, Textarea, useToast } from '../components/ui';
import { APPLICATION_STATUS } from './ParentAdmissions';

/** Office review of children registered online by parents. */
export default function Admissions() {
  const { db, api } = useStore();
  const [tab, setTab] = useState('pending');
  const [accept, setAccept] = useState(null);
  const [reject, setReject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast();
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const className = (id) => db.classes.find((c) => c.id === id)?.name || '—';
  const parent = (a) => db.guardians.find((g) => g.id === a.guardianId);
  const all = [...db.admissionApplications].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const rows = all.filter((a) => (tab === 'pending' ? a.status === 'pending' : a.status !== 'pending'));
  const pending = all.filter((a) => a.status === 'pending');
  const fill = (classId) => { const c = db.classes.find((x) => x.id === classId); const n = db.students.filter((s) => s.status === 'active' && s.classId === classId).length; return c ? `${n}/${c.capacity}` : ''; };

  const doAccept = async () => {
    setBusy(true);
    try {
      const r = await api.request(`/api/admissions/${accept.a.id}/accept`, { method: 'POST', body: { classId: accept.classId, category: accept.category, admissionDate: accept.admissionDate, note: accept.note } });
      await api.reload();
      notify(`${accept.a.firstName} admitted — registration number ${r.regNo}.`);
      setAccept(null);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };
  const doReject = async () => {
    setBusy(true);
    try {
      await api.request(`/api/admissions/${reject.a.id}/reject`, { method: 'POST', body: { reason: reject.reason } });
      await api.reload();
      notify('Application declined. The parent has been told why.');
      setReject(null);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };
  const openDoc = (d) => { const w = window.open(); if (w) w.document.write(`<title>${d.name}</title><iframe src="${d.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`); };

  return (
    <>
      {toast}
      <PageHeader title="Admission applications" subtitle="Children registered online by their parents. Accepting creates the pupil, linked to the parent’s account." />
      <Tabs tabs={[{ id: 'pending', label: 'To review', count: pending.length }, { id: 'done', label: 'Decided' }]} value={tab} onChange={setTab} />
      <Card bodyClass="">
        <DataTable
          rows={rows}
          pageSize={25}
          empty={<Empty title={tab === 'pending' ? 'No applications waiting' : 'No decisions yet'} message={tab === 'pending' ? 'When parents register children from their portal, they appear here.' : undefined} />}
          columns={[
            { key: 'child', label: 'Child', render: (a) => <div><p className="font-semibold text-slate-800">{a.firstName} {a.otherNames} {a.lastName}</p><p className="text-xs text-slate-500">{a.gender === 'M' ? 'Boy' : 'Girl'} · {age(a.dob)} yrs · born {fmtDate(a.dob)} · <span className="font-mono">{a.ref}</span></p></div> },
            { key: 'class', label: 'Class wanted', render: (a) => <div>{className(a.classId)}<p className="text-xs text-slate-500">now {fill(a.classId)}</p></div> },
            { key: 'parent', label: 'Parent', render: (a) => { const g = parent(a); return g ? <div><p>{g.name}</p><p className="text-xs text-slate-500">{g.phone} · {db.admissionApplications.filter((x) => x.guardianId === a.guardianId).length} child(ren) applied</p></div> : '—'; } },
            { key: 'when', label: 'Applied', render: (a) => fmtDateTime(a.createdAt) },
            { key: 'status', label: 'Status', render: (a) => <div><Badge tone={APPLICATION_STATUS[a.status][0]}>{APPLICATION_STATUS[a.status][1]}</Badge>{a.regNo && <p className="mt-0.5 text-xs"><Link to={`/students/${a.studentId}`} className="font-mono text-brand-700 hover:underline">{a.regNo}</Link> · {className(a.admittedClassId)}</p>}{a.status === 'rejected' && a.reviewNote && <p className="mt-0.5 max-w-56 text-xs text-slate-500">{a.reviewNote}</p>}</div> },
            { key: 'a', label: '', align: 'right', render: (a) => a.status === 'pending' && (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setReject({ a, reason: '' })}>Decline</Button>
                <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setAccept({ a, classId: a.classId, category: 'regular', admissionDate: today(), note: '' })}>Review</Button>
              </div>
            ) },
          ]}
        />
      </Card>

      <Modal open={!!accept} onClose={() => setAccept(null)} title={accept && `Admit ${accept.a.firstName} ${accept.a.lastName}`} footer={<><Button variant="secondary" onClick={() => setAccept(null)}>Cancel</Button><Button variant="success" icon={CheckCircle2} disabled={busy} onClick={doAccept}>{busy ? 'Admitting…' : 'Admit pupil'}</Button></>}>
        {accept && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
              <Info label="Date of birth">{fmtDate(accept.a.dob)} ({age(accept.a.dob)} yrs)</Info>
              <Info label="Place of birth">{accept.a.placeOfBirth}</Info>
              <Info label="Previous school">{accept.a.previousSchool}</Info>
              <Info label="Allergies">{accept.a.allergies || 'None given'}</Info>
              <Info label="Health notes">{accept.a.medicalNotes || 'None given'}</Info>
              <Info label="Parent">{parent(accept.a)?.name} · {parent(accept.a)?.phone}</Info>
            </dl>
            {accept.a.documents?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {accept.a.documents.map((d) => <Button key={d.id} size="sm" variant="secondary" icon={Eye} onClick={() => openDoc(d)}>{d.name}</Button>)}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Admit into class" hint={`Asked for ${className(accept.a.classId)}`}><Select value={accept.classId} onChange={(e) => setAccept({ ...accept, classId: e.target.value })} options={classes.map((c) => ({ value: c.id, label: `${c.name} (${fill(c.id)})` }))} /></Field>
              <Field label="Fee category"><Select value={accept.category} onChange={(e) => setAccept({ ...accept, category: e.target.value })} options={db.categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
              <Field label="Admission date"><Input type="date" value={accept.admissionDate} onChange={(e) => setAccept({ ...accept, admissionDate: e.target.value })} /></Field>
            </div>
            <Field label="Message to the parent (optional)"><Input value={accept.note} onChange={(e) => setAccept({ ...accept, note: e.target.value })} placeholder="e.g. Please bring the original birth certificate on the first day." /></Field>
            <p className="text-xs text-slate-500">A registration number is generated and the pupil is linked to the parent’s account straight away. First-term fees (including registration) apply from the fee structure.</p>
          </div>
        )}
      </Modal>
      <Modal open={!!reject} onClose={() => setReject(null)} size="sm" title={reject && `Decline ${reject.a.firstName}`} footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={doReject}>Decline</Button></>}>
        {reject && <Field label="Reason (the parent will see this)"><Textarea value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} placeholder="e.g. Class 4 is full this term — we have placed you on the waiting list." /></Field>}
      </Modal>
    </>
  );
}
