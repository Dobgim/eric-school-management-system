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
  const requests = db.users.filter((u) => u.requestedRole && (user.role === 'superadmin' || u.requestedRole === 'parent'));
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
      <PageHeader title="Sign-up requests" subtitle={user.role === 'superadmin' ? 'Parents and staff who created an account and are waiting for access.' : 'Parents who created an account and are waiting for you to confirm their children.'} />
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
