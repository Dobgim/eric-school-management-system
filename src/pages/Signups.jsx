import { useMemo, useState } from 'react';
import { CheckCircle2, UserCheck, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { ROLES, fmtDate, fmtDateTime, fullName } from '../lib/utils';
import { Badge, Button, Card, DataTable, Empty, Field, Info, Input, Modal, PageHeader, Select, Tabs, Textarea, useToast } from '../components/ui';

const digits = (p = '') => String(p).replace(/\D/g, '').replace(/^237/, '');
const STAFF_ROLES = ['teacher', 'admin', 'bursar', 'staff'];

/** Review self sign-ups. The super admin handles everyone; the secretary handles parents. */
export default function Signups() {
  const { db, user, api } = useStore();
  const [tab, setTab] = useState('pending');
  const [approve, setApprove] = useState(null);
  const [reject, setReject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast();
  // Teachers who signed up themselves are handled in “Teachers to confirm” below.
  const requests = db.users.filter((u) => u.requestedRole && !u.signup?.teacher && (user.role === 'superadmin' || u.requestedRole === 'parent'));
  const rows = requests.filter((u) => (tab === 'pending' ? u.status === 'pending' : u.status !== 'pending')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const openApprove = (u) => {
    if (u.requestedRole === 'parent') {
      const s = db.students.find((x) => x.regNo?.toLowerCase() === u.signup?.childRegNo?.toLowerCase());
      const byPhone = db.guardians.find((g) => [g.phone, g.altPhone].some((p) => p && digits(p) === digits(u.phone)) && !db.users.some((x) => x.guardianId === g.id && x.status === 'active'));
      setApprove({ u, mode: byPhone ? 'link' : 'new', guardianId: byPhone?.id || '', studentIds: s ? [s.id] : [], matched: s, note: '' });
    } else {
      const name = u.name.toLowerCase();
      const staff = db.staff.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === name || (s.phone && digits(s.phone) === digits(u.phone)));
      setApprove({ u, role: u.requestedRole, mode: staff ? 'link' : 'new', staffId: staff?.id || '', category: u.requestedRole === 'teacher' ? 'teaching' : 'non-teaching', position: u.signup?.position || '', gender: 'F', note: '' });
    }
  };

  const doApprove = async () => {
    const a = approve;
    const body = a.u.requestedRole === 'parent'
      ? (a.mode === 'link' ? { guardianId: a.guardianId } : { studentIds: a.studentIds })
      : { role: a.role, ...(a.mode === 'link' ? { staffId: a.staffId } : a.mode === 'new' ? { createStaff: true, category: a.category, position: a.position, gender: a.gender } : {}) };
    setBusy(true);
    try {
      await api.request(`/api/signups/${a.u.id}/approve`, { method: 'POST', body: { ...body, note: a.note } });
      await api.reload();
      notify(`${a.u.name} can now sign in.`);
      setApprove(null);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  const doReject = async () => {
    setBusy(true);
    try {
      await api.request(`/api/signups/${reject.u.id}/reject`, { method: 'POST', body: { reason: reject.reason } });
      await api.reload();
      notify('Sign-up rejected.');
      setReject(null);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  const pendingCount = requests.filter((u) => u.status === 'pending').length;
  const guardianOptions = useMemo(() => db.guardians
    .filter((g) => !db.users.some((x) => x.guardianId === g.id && x.status === 'active'))
    .map((g) => ({ value: g.id, label: `${g.name} · ${g.phone} · ${db.students.filter((s) => s.guardianIds.includes(g.id)).map((s) => s.firstName).join(', ') || 'no pupils'}` })), [db]);
  const freeStaff = db.staff.filter((s) => s.status === 'active' && !db.users.some((x) => x.staffId === s.id && x.status === 'active'));

  return (
    <>
      {toast}
      <PageHeader title="Sign-up requests" subtitle="Teachers who signed up, and parents whose details couldn’t be matched to a pupil automatically." />
      <TeacherRequests notify={notify} />
      <Tabs tabs={[{ id: 'pending', label: 'Waiting', count: pendingCount }, { id: 'done', label: 'Handled' }]} value={tab} onChange={setTab} />
      <Card bodyClass="">
        <DataTable
          rows={rows}
          empty={<Empty title={tab === 'pending' ? 'No sign-ups waiting' : 'Nothing here yet'} message={tab === 'pending' ? 'New requests appear here and on the bell.' : undefined} />}
          columns={[
            { key: 'name', label: 'Person', render: (u) => <div><p className="font-semibold text-slate-800">{u.name}</p><p className="text-xs text-slate-500">@{u.username} · {u.phone}{u.email ? ` · ${u.email}` : ''}</p></div> },
            { key: 'type', label: 'Asked for', render: (u) => <Badge tone={u.requestedRole === 'parent' ? 'purple' : 'blue'}>{u.requestedRole === 'parent' ? `Parent (${u.signup?.relationship || ''})` : ROLES[u.requestedRole]}</Badge> },
            { key: 'details', label: 'Details', render: (u) => (u.requestedRole === 'parent'
              ? <span className="text-sm text-slate-600">Child {u.signup?.childRegNo} · born {fmtDate(u.signup?.childDob)}</span>
              : <span className="text-sm text-slate-600">{u.signup?.position}{u.signup?.message ? ` — “${u.signup.message}”` : ''}</span>) },
            { key: 'when', label: 'Signed up', render: (u) => fmtDateTime(u.createdAt) },
            { key: 'status', label: 'Status', render: (u) => (u.status === 'pending' ? <Badge tone="amber">Waiting</Badge> : u.status === 'active' ? <Badge tone="green">Approved{u.signup?.autoLinked ? ' (automatic)' : ''} · {ROLES[u.role]}</Badge> : <div><Badge tone="red">Rejected</Badge>{u.reviewNote && <p className="mt-0.5 max-w-56 text-xs text-slate-500">{u.reviewNote}</p>}</div>) },
            { key: 'a', label: '', align: 'right', render: (u) => u.status === 'pending' && (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setReject({ u, reason: '' })}>Reject</Button>
                <Button size="sm" variant="success" icon={UserCheck} onClick={() => openApprove(u)}>Review</Button>
              </div>
            ) },
          ]}
        />
      </Card>

      <Modal open={!!approve} onClose={() => setApprove(null)} title={approve && `Approve ${approve.u.name}`} footer={<><Button variant="secondary" onClick={() => setApprove(null)}>Cancel</Button><Button variant="success" icon={CheckCircle2} disabled={busy} onClick={doApprove}>{busy ? 'Approving…' : 'Approve account'}</Button></>}>
        {approve && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
              <Info label="Phone">{approve.u.phone}</Info>
              <Info label="Email">{approve.u.email}</Info>
              {approve.u.requestedRole === 'parent'
                ? <><Info label="Child reg. no given">{approve.u.signup?.childRegNo}</Info><Info label="Child date of birth given">{fmtDate(approve.u.signup?.childDob)}</Info></>
                : <><Info label="Department asked for">{ROLES[approve.u.requestedRole]}</Info><Info label="Job title">{approve.u.signup?.position}</Info></>}
            </dl>

            {approve.u.requestedRole === 'parent' ? (
              <>
                {approve.matched
                  ? <p className="text-sm text-slate-600">Registration number matches <b>{fullName(approve.matched)}</b>{approve.matched.dob === approve.u.signup?.childDob ? ' and the date of birth matches.' : <span className="text-rose-600"> but the date of birth does NOT match ({fmtDate(approve.matched.dob)} on record).</span>}</p>
                  : <p className="text-sm text-rose-600">No pupil has the registration number they entered. Check with the parent before approving.</p>}
                <div className="flex flex-wrap gap-2">
                  {[['link', 'Link to an existing parent record'], ['new', 'Create a new parent record']].map(([m, l]) => (
                    <button key={m} type="button" onClick={() => setApprove({ ...approve, mode: m })} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${approve.mode === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>{l}</button>
                  ))}
                </div>
                {approve.mode === 'link'
                  ? <Field label="Parent record" hint="The account will see every pupil linked to this parent."><Select value={approve.guardianId} onChange={(e) => setApprove({ ...approve, guardianId: e.target.value })} placeholder="— Choose —" options={guardianOptions} /></Field>
                  : (
                    <Field label="Pupils this parent may see" hint="A new parent record is created with their name and phone, and linked to these pupils.">
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {db.students.filter((s) => s.status === 'active').sort((a, b) => a.lastName.localeCompare(b.lastName)).map((s) => (
                          <label key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                            <input type="checkbox" checked={approve.studentIds.includes(s.id)} onChange={(e) => setApprove({ ...approve, studentIds: e.target.checked ? [...approve.studentIds, s.id] : approve.studentIds.filter((x) => x !== s.id) })} />
                            {fullName(s)} <span className="text-xs text-slate-500">{s.regNo} · {db.classes.find((c) => c.id === s.classId)?.name}</span>
                          </label>
                        ))}
                      </div>
                    </Field>
                  )}
              </>
            ) : (
              <>
                <Field label="Role (what they can access)"><Select value={approve.role} onChange={(e) => setApprove({ ...approve, role: e.target.value })} options={STAFF_ROLES.map((r) => ({ value: r, label: ROLES[r] }))} /></Field>
                <div className="flex flex-wrap gap-2">
                  {[['link', 'Link to existing staff record'], ['new', 'Create staff record'], ['none', 'No staff record']].map(([m, l]) => (
                    <button key={m} type="button" onClick={() => setApprove({ ...approve, mode: m })} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${approve.mode === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>{l}</button>
                  ))}
                </div>
                {approve.mode === 'link' && <Field label="Staff record" hint="Teachers see the class assigned to this record; everyone sees their own payslips."><Select value={approve.staffId} onChange={(e) => setApprove({ ...approve, staffId: e.target.value })} placeholder="— Choose —" options={freeStaff.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} · ${s.position}` }))} /></Field>}
                {approve.mode === 'new' && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Category"><Select value={approve.category} onChange={(e) => setApprove({ ...approve, category: e.target.value })} options={[{ value: 'teaching', label: 'Teaching' }, { value: 'non-teaching', label: 'Non-teaching' }]} /></Field>
                    <Field label="Position"><Input value={approve.position} onChange={(e) => setApprove({ ...approve, position: e.target.value })} /></Field>
                    <Field label="Sex"><Select value={approve.gender} onChange={(e) => setApprove({ ...approve, gender: e.target.value })} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} /></Field>
                  </div>
                )}
                {approve.role === 'teacher' && <p className="text-xs text-slate-500">After approving, assign the teacher’s class under School Profile → Classes.</p>}
              </>
            )}
            <Field label="Note (optional)"><Input value={approve.note} onChange={(e) => setApprove({ ...approve, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!reject} onClose={() => setReject(null)} size="sm" title={reject && `Reject ${reject.u.name}`} footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={doReject}>Reject</Button></>}>
        {reject && <Field label="Reason (shown when they try to sign in)"><Textarea value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} placeholder="e.g. We could not match your child — please visit the office with the admission letter." /></Field>}
      </Modal>
    </>
  );
}

/**
 * Teachers who signed up and said what they teach. Nothing they declared counts until confirmed here; a teacher
 * who joined with their phone number (no invitation) also needs the super admin to approve the account itself.
 */
function TeacherRequests({ notify }) {
  const { db, api, user } = useStore();
  const [editing, setEditing] = useState(null);
  const [refuse, setRefuse] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = db.staff.filter((s) => s.teachingRequest);
  if (!list.length) return null;
  const className = (id) => db.classes.find((c) => c.id === id)?.name || '?';

  const confirm = async (s, body = {}) => {
    setBusy(true);
    try {
      await api.request(`/api/teachers/${s.id}/confirm`, { method: 'POST', body });
      await api.reload();
      notify(`${s.teachingRequest.name} confirmed. They can now enter marks for their subjects.`);
      setEditing(null);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };
  const doRefuse = async () => {
    setBusy(true);
    try {
      await api.request(`/api/teachers/${refuse.s.id}/reject`, { method: 'POST', body: { reason: refuse.reason } });
      await api.reload();
      notify('Refused. The person sees your reason.');
      setRefuse(null);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  return (
    <Card title="Teachers to confirm" className="mb-6" bodyClass="">
      <ul className="divide-y divide-slate-100">
        {list.map((s) => {
          const r = s.teachingRequest;
          const onRecord = s.phone && r.phone && digits(s.phone) === digits(r.phone);
          const superOnly = r.pendingAccount && user.role !== 'superadmin';
          return (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{r.name} {r.pendingAccount ? <Badge tone="amber">New account to approve</Badge> : <Badge tone="blue">Account open · classes to confirm</Badge>}</p>
                <p className="text-xs text-slate-500">{r.phone} · staff record {s.staffNo} ({s.firstName} {s.lastName}) · {fmtDateTime(r.at)}</p>
                {r.pendingAccount && <p className={`mt-1 text-xs ${onRecord ? 'text-emerald-700' : 'text-rose-700'}`}>{onRecord ? 'Phone number matches this staff record. Check it is really this teacher before approving.' : 'Phone number does not match the staff record.'}</p>}
                <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
                  {r.classTeacherOf && <li><b>Class teacher of</b> {className(r.classTeacherOf)}</li>}
                  {r.teaching.map((t) => <li key={t.subject}><b>{t.subject}</b> · {t.classIds.map(className).join(', ')}</li>)}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={XCircle} disabled={busy || superOnly} onClick={() => setRefuse({ s, reason: '' })}>Refuse</Button>
                <Button size="sm" variant="secondary" disabled={busy || superOnly} onClick={() => setEditing({ s, teaching: r.teaching.map((t) => ({ ...t })), classTeacherOf: r.classTeacherOf || '' })}>Adjust</Button>
                <Button size="sm" icon={CheckCircle2} disabled={busy || superOnly} onClick={() => confirm(s)}>{r.pendingAccount ? 'Approve' : 'Confirm'}</Button>
              </div>
              {superOnly && <p className="w-full text-xs text-slate-500">Only the super admin can approve a new teacher account.</p>}
            </li>
          );
        })}
      </ul>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`What ${editing.s.teachingRequest.name} teaches`} size="lg" footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button icon={CheckCircle2} disabled={busy} onClick={() => confirm(editing.s, { teaching: editing.teaching, classTeacherOf: editing.classTeacherOf || null })}>{editing.s.teachingRequest.pendingAccount ? 'Approve' : 'Confirm'}</Button>
        </>}>
          <Field label="Class teacher of"><Select value={editing.classTeacherOf} onChange={(e) => setEditing({ ...editing, classTeacherOf: e.target.value })} placeholder="— Not a class teacher —" options={db.classes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <div className="mt-4 space-y-3">
            {editing.teaching.map((t, i) => (
              <div key={i} className="rounded-md bg-slate-50 p-3">
                <div className="flex items-center justify-between"><b className="text-sm">{t.subject}</b><button type="button" className="text-xs font-semibold text-rose-600" onClick={() => setEditing({ ...editing, teaching: editing.teaching.filter((_, j) => j !== i) })}>Remove</button></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {db.classes.map((c) => {
                    const on = t.classIds.includes(c.id);
                    return <button key={c.id} type="button" aria-pressed={on} onClick={() => setEditing({ ...editing, teaching: editing.teaching.map((x, j) => (j === i ? { ...x, classIds: on ? x.classIds.filter((id) => id !== c.id) : [...x.classIds, c.id] } : x)) })} className={`rounded-sm border px-2 py-1 text-xs font-medium ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{c.name}</button>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {refuse && (
        <Modal open onClose={() => setRefuse(null)} title={`Refuse ${refuse.s.teachingRequest.name}`} footer={<>
          <Button variant="secondary" onClick={() => setRefuse(null)}>Cancel</Button>
          <Button variant="danger" disabled={busy || !refuse.reason.trim()} onClick={doRefuse}>Refuse</Button>
        </>}>
          <Field label="Reason (the person sees this)"><Textarea value={refuse.reason} onChange={(e) => setRefuse({ ...refuse, reason: e.target.value })} placeholder="e.g. You are not on our staff list — please see the head teacher." /></Field>
        </Modal>
      )}
    </Card>
  );
}
