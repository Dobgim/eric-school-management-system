// Data access and access control. The browser receives only what the signed-in role may see,
// and every change it sends is checked here before it reaches the database.
import { randomBytes } from 'node:crypto';
import { hashPassword, toClientUser } from './auth.js';
import { canEnterMarks, classSubjects, termSequences, weightedAverage } from '../src/lib/subjects.js';

export const COLLECTIONS = [
  'students', 'guardians', 'classes', 'facilities', 'sessions', 'calendarEvents', 'categories', 'feeItems',
  'payments', 'staff', 'salaryScales', 'salaryAdjustments', 'payrollRuns', 'inventory', 'stockMovements', 'sales',
  'academicRecords', 'promotionRecommendations', 'announcements', 'activityLog', 'paymentRequests', 'notifications',
  'admissionApplications', 'invites', 'attendance', 'expenses', 'marks', 'timetables', 'staffAttendance',
];

export const newId = (p = '') => p + Date.now().toString(36) + randomBytes(3).toString('hex');

export class Forbidden extends Error { status = 403; }
export class Invalid extends Error { status = 400; }

/** Everything in the database, shaped like the app's data model. `q` is a query function (inside a transaction or not). */
export async function loadAll(q) {
  const [records, kv, counters, users] = await Promise.all([
    q('select collection, data from records'),
    q('select key, value from kv'),
    q('select name, value from counters'),
    q('select * from users order by created_at'),
  ]);
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  for (const r of records.rows) if (out[r.collection]) out[r.collection].push(r.data);
  for (const r of kv.rows) out[r.key] = r.value;
  out.settings = { ...(out.settings || {}), counters: Object.fromEntries(counters.rows.map((r) => [r.name, r.value])) };
  out.users = users.rows.map(toClientUser);
  out.activityLog.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  out.notifications.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return out;
}

// Staff see only their own days in the staff register.
const ownStaffAttendance = (all, user) => all.staffAttendance.map((a) => ({ id: a.id, date: a.date, absent: (a.absent || []).filter((id) => id === user.staffId), late: (a.late || []).filter((id) => id === user.staffId) }));
const teacherClassId = (all, user) => all.classes.find((c) => c.teacherId && c.teacherId === user.staffId)?.id || null;
const parentChildIds = (all, user) => all.students.filter((s) => (s.guardianIds || []).includes(user.guardianId)).map((s) => s.id);
const forUser = (n, user) => n.by !== user.id && ((n.userIds || []).includes(user.id) || (n.roles || []).includes(user.role));
const minimalUsers = (all) => all.users.filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name, role: u.role }));
const staffCard = (s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, gender: s.gender, phone: s.phone, position: s.position, classId: s.classId, category: s.category, status: s.status, staffNo: s.staffNo, teaching: s.teaching || [] });
// Who teaches what, for every signed-in user: names, classes and subjects only, no contact details.
const isTeacher = (all, s) => s.status === 'active' && (s.category === 'teaching' || (s.teaching || []).length || all.classes.some((c) => c.teacherId === s.id));
const directoryCard = (s) => ({ ...staffCard(s), phone: undefined });
const teacherDirectory = (all, keep = () => false) => all.staff.filter((s) => isTeacher(all, s)).map((s) => (keep(s) ? staffCard(s) : directoryCard(s)));

/** The slice of the database a user is allowed to read. */
export function viewFor(user, all) {
  const base = {
    school: all.school, sessions: all.sessions, classes: all.classes, categories: all.categories,
    calendarEvents: all.calendarEvents, feeItems: all.feeItems,
    notifications: all.notifications.filter((n) => forUser(n, user)).slice(0, 200),
  };
  const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

  if (user.role === 'parent') {
    const kids = new Set(parentChildIds(all, user));
    const kidClassIds = new Set(all.students.filter((s) => kids.has(s.id)).map((s) => s.classId));
    const teacherIds = new Set(all.classes.filter((c) => kidClassIds.has(c.id)).map((c) => c.teacherId));
    return {
      ...empty, ...base,
      settings: { currentSessionId: all.settings.currentSessionId, currentTermId: all.settings.currentTermId, momo: all.settings.momo, counters: {} },
      students: all.students.filter((s) => kids.has(s.id)).map(({ documents, ...s }) => ({ ...s, documents: [] })),
      guardians: all.guardians.filter((g) => g.id === user.guardianId),
      payments: all.payments.filter((p) => kids.has(p.studentId)),
      sales: all.sales.filter((s) => kids.has(s.studentId)),
      academicRecords: all.academicRecords.filter((r) => kids.has(r.studentId)),
      paymentRequests: all.paymentRequests.filter((r) => r.guardianId === user.guardianId),
      timetables: all.timetables.filter((t) => kidClassIds.has(t.classId)),
      // Daily registers of the children's classes, reduced to their own children.
      attendance: all.attendance.filter((a) => kidClassIds.has(a.classId)).map((a) => ({
        id: a.id, classId: a.classId, date: a.date, absent: (a.absent || []).filter((id) => kids.has(id)), late: (a.late || []).filter((id) => kids.has(id)),
      })),
      admissionApplications: all.admissionApplications.filter((a) => a.guardianId && a.guardianId === user.guardianId),
      announcements: all.announcements.filter((a) => a.audience === 'all' || a.audience === 'parents' || (a.audience === 'personal' && (a.guardianIds || []).includes(user.guardianId))),
      staff: teacherDirectory(all, (s) => teacherIds.has(s.id)),
      users: minimalUsers(all),
    };
  }

  // Own payslips only, for any staff member who is not in charge of payroll.
  const ownPay = () => all.payrollRuns.map((r) => ({ ...r, items: r.items.filter((i) => i.staffId === user.staffId) })).filter((r) => user.staffId && r.items.length);
  const ownStaff = (list) => list.map((s) => (s.id === user.staffId ? all.staff.find((x) => x.id === s.id) : s));
  const ownScale = () => { const me = all.staff.find((s) => s.id === user.staffId); return all.salaryScales.filter((g) => g.id === me?.gradeId); };

  if (user.role === 'staff') {
    return {
      ...empty, ...base,
      settings: { currentSessionId: all.settings.currentSessionId, currentTermId: all.settings.currentTermId, counters: {} },
      staff: [...all.staff.filter((s) => s.id === user.staffId), ...teacherDirectory(all).filter((s) => s.id !== user.staffId)],
      staffAttendance: ownStaffAttendance(all, user),
      salaryScales: ownScale(),
      payrollRuns: ownPay(),
      announcements: all.announcements.filter((a) => a.audience === 'all' || a.audience === 'staff'),
      users: minimalUsers(all),
    };
  }

  if (user.role === 'teacher') {
    const classId = teacherClassId(all, user);
    const pupils = all.students.filter((s) => s.classId === classId || Object.values(s.enrollments || {}).includes(classId));
    const ids = new Set(pupils.map((s) => s.id));
    // Other classes where this teacher takes a subject: names only, to enter marks.
    const taught = new Set(markClasses(all, user));
    const others = all.students.filter((s) => !ids.has(s.id) && Object.values(s.enrollments || {}).some((c) => taught.has(c)))
      .map(({ id, firstName, otherNames, lastName, regNo, classId: cid, enrollments, status, gender }) => ({ id, firstName, otherNames, lastName, regNo, classId: cid, enrollments, status, gender, guardianIds: [] }));
    const guardianIds = new Set(pupils.flatMap((s) => s.guardianIds || []));
    return {
      ...empty, ...base,
      settings: { ...all.settings, momo: undefined },
      facilities: all.facilities,
      students: [...pupils, ...others],
      guardians: all.guardians.filter((g) => guardianIds.has(g.id)),
      academicRecords: all.academicRecords.filter((r) => ids.has(r.studentId) || r.classId === classId),
      marks: all.marks.filter((m) => m.classId === classId || taught.has(m.classId)),
      // Own class's timetable, and every timetable where this teacher has a lesson.
      timetables: all.timetables.filter((t) => t.classId === classId || Object.values(t.cells || {}).some((c) => c?.teacherId && c.teacherId === user.staffId)),
      staffAttendance: ownStaffAttendance(all, user),
      attendance: all.attendance.filter((a) => a.classId === classId),
      promotionRecommendations: all.promotionRecommendations.filter((r) => ids.has(r.studentId)),
      announcements: all.announcements.filter((a) => a.audience === 'all' || a.audience === 'staff'),
      staff: ownStaff(all.staff.map(staffCard)),
      salaryScales: ownScale(),
      payrollRuns: ownPay(),
      users: minimalUsers(all),
    };
  }

  // Office staff. The secretary does not see payroll; only the super admin sees account details.
  const view = { ...all, ...base, notifications: base.notifications };
  if (user.role === 'admin') { view.payrollRuns = ownPay(); view.salaryAdjustments = []; view.expenses = []; }
  if (user.role === 'bursar') view.admissionApplications = [];
  // Invitation codes are secrets: only the super admin sees them.
  if (user.role !== 'superadmin') view.invites = [];
  if (user.role !== 'superadmin') view.users = user.role === 'admin' ? all.users.filter((u) => u.role === 'parent').concat(minimalUsers(all).filter((u) => u.role !== 'parent')) : minimalUsers(all);
  return view;
}

// Collections each office role may change. Teachers and parents are handled row by row below.
const WRITE = {
  admin: ['students', 'guardians', 'classes', 'facilities', 'sessions', 'calendarEvents', 'academicRecords', 'promotionRecommendations', 'announcements', 'staff', 'notifications', 'activityLog', 'attendance', 'timetables', 'staffAttendance'],
  bursar: ['payments', 'feeItems', 'categories', 'payrollRuns', 'salaryAdjustments', 'salaryScales', 'staff', 'inventory', 'stockMovements', 'sales', 'paymentRequests', 'notifications', 'activityLog', 'expenses'],
};
const KV_WRITE = { superadmin: ['school', 'settings'], admin: ['school', 'settings'] };
export const COUNTER_ACCESS = {
  superadmin: ['reg', 'receipt', 'staff', 'sale', 'request'],
  admin: ['reg', 'staff'],
  bursar: ['receipt', 'staff', 'sale', 'request'],
  parent: ['request'],
  teacher: [],
  staff: [],
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Only adding yourself to a notification's readBy list. */
function isMarkRead(user, before, after) {
  if (!before || !forUser(before, user)) return false;
  const { readBy: rb, ...restB } = before;
  const { readBy: ra, ...restA } = after;
  return same(restB, restA) && (ra || []).every((x) => (rb || []).includes(x) || x === user.id);
}

/**
 * Validate and apply a batch of changes inside one transaction.
 * ops: [{ t: 'put', c, v } | { t: 'del', c, id } | { t: 'kv', k, v }]
 * Returns { changed: Set<collection>, extra: notifications created by the server }.
 */
export async function applyOps(q, user, ops) {
  if (!Array.isArray(ops) || !ops.length) return { changed: new Set() };
  const all = await loadAll(q);
  const byId = (c, id) => (c === 'users' ? all.users : all[c] || []).find((x) => x.id === id);
  const changed = new Set();
  const now = new Date().toISOString();
  const kids = user.role === 'parent' ? new Set(parentChildIds(all, user)) : null;
  const tClass = user.role === 'teacher' ? teacherClassId(all, user) : null;

  const putRecord = async (c, v) => {
    await q(`insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)
             on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [c, v.id, JSON.stringify(v), user.id]);
    changed.add(c);
  };

  for (const op of ops) {
    const { t, c } = op;

    if (t === 'kv') {
      if (!(KV_WRITE[user.role] || []).includes(op.k)) throw new Forbidden(`You can't change the ${op.k} settings.`);
      const { counters, ...value } = op.v || {};
      await q(`insert into kv (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [op.k, JSON.stringify(value)]);
      changed.add(op.k);
      continue;
    }

    if (c === 'users') { await writeUser(q, user, all, op); changed.add('users'); continue; }
    if (c === 'marks' && op.t === 'put') { await writeMarks(all, user, op.v || {}, putRecord, now); continue; }
    if (c === 'academicRecords' && op.t === 'put' && ['superadmin', 'admin', 'teacher'].includes(user.role)) { await writeResultDetails(all, user, op.v || {}, putRecord, now); continue; }
    if (!COLLECTIONS.includes(c)) throw new Invalid(`Unknown data type: ${c}`);
    const id = t === 'del' ? op.id : op.v?.id;
    if (!id || typeof id !== 'string') throw new Invalid('Record without an id.');
    const before = byId(c, id);
    const after = op.v;

    // Activity log: anyone may add entries, stamped with their real identity; nobody edits history.
    if (c === 'activityLog') {
      if (t !== 'put' || before) throw new Forbidden('The activity log cannot be edited.');
      await putRecord(c, { ...after, userId: user.id, at: now });
      continue;
    }

    // Everyone may mark their own notifications as read.
    if (c === 'notifications' && t === 'put' && isMarkRead(user, before, after)) { await putRecord(c, after); continue; }

    if (user.role === 'superadmin') {
      // full access
    } else if (user.role === 'admin' || user.role === 'bursar') {
      if (!WRITE[user.role].includes(c)) throw new Forbidden(`Your role can't change ${c}.`);
    } else if (user.role === 'teacher') {
      const inClass = (studentId) => all.students.some((s) => s.id === studentId && (s.classId === tClass || Object.values(s.enrollments || {}).includes(tClass)));
      const rec = after || before;
      if (c === 'academicRecords' && tClass && rec.classId === tClass && inClass(rec.studentId)) { /* ok */ }
      else if (c === 'promotionRecommendations' && tClass && inClass(rec.studentId)) { /* ok */ }
      else if (c === 'attendance' && t === 'put' && tClass && rec.classId === tClass) { /* ok: own class register */ }
      else throw new Forbidden('Teachers can only record results, attendance and recommendations for their own class.');
    } else if (user.role === 'parent') {
      if (c === 'paymentRequests' && t === 'put' && !before) {
        const items = after.items || [];
        if (after.status !== 'pending' || after.channel !== 'manual') throw new Forbidden('Payments made by parents must be verified by the bursar.');
        if (!items.length || items.some((i) => !kids.has(i.studentId) || !(Number(i.amount) > 0))) throw new Forbidden('You can only pay for your own children.');
        const ref = String(after.reference || '').trim().toLowerCase();
        if (ref.length < 4) throw new Invalid('Enter the transaction ID.');
        if (all.payments.some((p) => (p.reference || '').toLowerCase() === ref) || all.paymentRequests.some((r) => r.status !== 'rejected' && (r.reference || '').toLowerCase() === ref)) throw new Invalid('This transaction ID has already been used.');
        const amount = items.reduce((s, i) => s + Math.round(Number(i.amount)), 0);
        // The server numbers it: the parent may have saved it offline and sent it later.
        const clean = { ...after, ref: `PAY-${String(await nextCounter(q, 'request')).padStart(5, '0')}`, guardianId: user.guardianId, userId: user.id, amount, createdAt: now };
        await putRecord(c, clean);
        // Tell the bursar straight away.
        const names = items.map((i) => { const s = all.students.find((x) => x.id === i.studentId); return `${s.firstName} ${s.lastName} (${Math.round(i.amount).toLocaleString('en-US')} XAF)`; }).join(', ');
        await putRecord('notifications', {
          id: newId('nt'), roles: ['bursar', 'superadmin'], userIds: [], kind: 'verify', link: '/fees/online', readBy: [], createdAt: now,
          title: `Payment to verify: ${amount.toLocaleString('en-US')} XAF from ${user.name}`,
          body: `${names} · ${clean.method?.toUpperCase()} · ${clean.reference}`,
        });
        continue;
      }
      if (c === 'admissionApplications' && t === 'put' && !before) {
        await addApplication(q, user, all, after, putRecord, now);
        continue;
      }
      throw new Forbidden('Parents can only submit payments for verification or apply to register children.');
    } else {
      throw new Forbidden('Not allowed.');
    }

    // Salaries are set by the super admin or the bursar only.
    if (c === 'staff' && t === 'put' && user.role === 'admin') { op.v = { ...after, salary: before?.salary, gradeId: before?.gradeId ?? after?.gradeId ?? '', bankName: before?.bankName ?? after?.bankName, accountNo: before?.accountNo ?? after?.accountNo, momoNumber: before?.momoNumber ?? after?.momoNumber }; await putRecord(c, op.v); continue; }
    if (c === 'announcements' && t === 'put') { await writeAnnouncement(all, user, before, after, putRecord, now); continue; }
    if (c === 'attendance' && t === 'put') { await writeAttendance(all, user, before, after, putRecord, now); continue; }
    if (t === 'put') await putRecord(c, after);
    else if (t === 'del') { await q('delete from records where collection = $1 and id = $2', [c, id]); changed.add(c); }
    else throw new Invalid(`Unknown operation ${t}`);
  }
  return { changed };
}

const cleanText = (v, max = 120) => String(v ?? '').trim().slice(0, max);

/** A parent applies to register one child. Everything is re-built here from allowed fields only. */
async function addApplication(q, user, all, v, putRecord, now) {
  if (!user.guardianId) throw new Forbidden('Your account is not linked to a parent record. Contact the school.');
  const pending = all.admissionApplications.filter((a) => a.guardianId === user.guardianId && a.status === 'pending').length;
  if (pending >= 15) throw new Invalid('You already have 15 applications waiting. Please wait for the school to review them.');
  const cls = all.classes.find((c) => c.id === v.classId);
  const firstName = cleanText(v.firstName, 60);
  const lastName = cleanText(v.lastName, 60);
  if (!firstName || !lastName) throw new Invalid("Enter each child's first name and surname.");
  if (!['M', 'F'].includes(v.gender)) throw new Invalid("Choose each child's sex.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dob || '') || v.dob > now.slice(0, 10)) throw new Invalid(`Enter a valid date of birth for ${firstName}.`);
  if (!cls) throw new Invalid(`Choose the class ${firstName} is applying for.`);
  const documents = (Array.isArray(v.documents) ? v.documents : []).slice(0, 3)
    .filter((d) => typeof d?.dataUrl === 'string' && /^data:(image\/|application\/pdf)/.test(d.dataUrl) && d.dataUrl.length < 2_200_000)
    .map((d) => ({ id: newId('doc'), name: cleanText(d.name, 60) || 'Document', fileName: cleanText(d.fileName, 120), size: Number(d.size) || 0, uploadedAt: now, verified: false, dataUrl: d.dataUrl }));
  const app = {
    id: v.id, ref: `APP-${String(await nextCounter(q, 'application')).padStart(5, '0')}`, status: 'pending',
    guardianId: user.guardianId, userId: user.id, createdAt: now,
    firstName, otherNames: cleanText(v.otherNames, 60), lastName, gender: v.gender, dob: v.dob,
    placeOfBirth: cleanText(v.placeOfBirth, 60), classId: cls.id, previousSchool: cleanText(v.previousSchool, 120),
    allergies: cleanText(v.allergies, 120), medicalNotes: cleanText(v.medicalNotes, 300), documents,
  };
  await putRecord('admissionApplications', app);
  await putRecord('notifications', {
    id: newId('nt'), roles: ['superadmin', 'admin'], userIds: [], kind: 'verify', link: '/admissions', readBy: [], createdAt: now,
    title: `Admission application: ${firstName} ${lastName} for ${cls.name}`,
    body: `From ${user.name} · ${app.ref}`,
  });
}

const STAFF_ROLES = ['superadmin', 'admin', 'bursar', 'teacher', 'staff'];

/**
 * Save a class's register for one day and tell the parents of every pupil newly marked absent
 * (in the app and on their phone), so they know the same morning.
 */
// ---------- Marks and term results ----------

/** Classes where this user may enter marks: the office everywhere; a teacher in their own class and where they take a subject. */
export function markClasses(all, user) {
  if (['superadmin', 'admin'].includes(user.role)) return all.classes.map((c) => c.id);
  if (user.role !== 'teacher') return [];
  const me = all.staff.find((s) => s.id === user.staffId);
  return [...new Set([teacherClassId(all, user), ...(me?.teaching || []).flatMap((t) => t.classIds || [])].filter(Boolean))];
}

/** May this user enter marks for this subject in this class? */
const termOf = (all, termId) => all.sessions.flatMap((s) => (s.terms || []).map((t) => ({ ...t, sessionId: s.id }))).find((t) => t.id === termId);
const autoRemark = (avg) => (avg >= 16 ? 'Outstanding performance, keep it up.' : avg >= 12 ? 'Good work. Can do better.' : avg >= 10 ? 'Average. Needs more effort.' : 'Weak. Needs close follow-up at home.');

/**
 * One subject's marks for one sequence (evaluation) in a class: entered only by the teacher of that subject.
 * A sheet entered by one teacher can't be changed by another; the proprietor can correct (it is logged).
 * Term results are then recalculated.
 */
async function writeMarks(all, user, v, putRecord, now) {
  const cls = all.classes.find((c) => c.id === v.classId);
  const term = termOf(all, v.termId);
  const subject = classSubjects(cls).find((s) => s.name.toLowerCase() === String(v.subject || '').trim().toLowerCase());
  if (!cls || !term || !subject) throw new Invalid('Choose the class, term and subject.');
  const sequences = termSequences(all.sessions, term.id);
  const sequence = Number(v.sequence);
  if (!sequences.includes(sequence)) throw new Invalid(`Choose sequence ${sequences.join(' or ')} for this term.`);
  if (!canEnterMarks(all.staff, user, cls, subject.name)) throw new Forbidden(`Only the teacher of ${subject.name} in ${cls.name} can enter these marks.`);
  const id = `mk-${term.id}-${cls.id}-${subject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-s${sequence}`;
  const existing = all.marks.find((m) => m.id === id);
  if (existing && existing.enteredBy !== user.id && user.role === 'teacher') {
    const by = all.users.find((u) => u.id === existing.enteredBy)?.name || 'another teacher';
    throw new Forbidden(`These marks were entered by ${by}. Only they can change them.`);
  }
  const enrolled = new Set(all.students.filter((s) => s.enrollments?.[term.sessionId] === cls.id).map((s) => s.id));
  const marks = {};
  for (const [sid, m] of Object.entries(v.marks || {})) {
    if (!enrolled.has(sid) || m === '' || m === null || m === undefined) continue;
    const n = Number(m);
    if (!(n >= 0 && n <= 20)) throw new Invalid('Marks must be between 0 and 20.');
    marks[sid] = Math.round(n * 100) / 100;
  }
  // The teacher who first entered the sheet stays its owner, even after a correction by the proprietor.
  const sheet = { id, classId: cls.id, termId: term.id, sessionId: term.sessionId, subject: subject.name, sequence, marks, enteredBy: existing?.enteredBy || user.id, updatedBy: user.id, updatedAt: now };
  await putRecord('marks', sheet);
  if (existing && existing.enteredBy !== user.id) {
    await putRecord('activityLog', { id: newId('lg'), userId: user.id, action: 'Corrected marks', details: `${subject.name} · ${cls.name} · sequence ${sequence}`, at: now });
  }
  all.marks = [...all.marks.filter((m) => m.id !== sheet.id), sheet];
  await recomputeResults(all, cls, term, putRecord);
}

/** Days present, conduct and remark: set by the class teacher or the office. Marks and positions are never taken from here. */
async function writeResultDetails(all, user, v, putRecord) {
  const cls = all.classes.find((c) => c.id === v.classId);
  const term = termOf(all, v.termId);
  if (!cls || !term) throw new Invalid('Choose the class and term.');
  if (user.role === 'teacher' && cls.teacherId !== user.staffId) throw new Forbidden('Only the class teacher can set conduct, attendance and remarks.');
  const student = all.students.find((s) => s.id === v.studentId && s.enrollments?.[term.sessionId] === cls.id);
  if (!student) throw new Invalid('This pupil is not in that class for the term.');
  const id = `ar-${term.id}-${student.id}`;
  const old = all.academicRecords.find((r) => r.id === id) || { id, studentId: student.id, sessionId: term.sessionId, termId: term.id, classId: cls.id, marks: {} };
  const remark = String(v.remark || '').trim().slice(0, 300);
  const rec = {
    ...old, classId: cls.id, conduct: String(v.conduct || old.conduct || 'Good').slice(0, 30),
    attendance: v.attendance === '' || v.attendance == null ? null : Math.max(0, Math.round(Number(v.attendance) || 0)),
    daysOpen: Number(v.daysOpen) || old.daysOpen || null, remarkCustom: !!remark, remark: remark || old.remark || '', enteredBy: user.id,
  };
  all.academicRecords = [...all.academicRecords.filter((r) => r.id !== id), rec];
  await putRecord('academicRecords', rec);
  await recomputeResults(all, cls, term, putRecord);
}

/**
 * Rebuild every pupil's average and position in a class for a term from the subject mark sheets
 * (plus any marks saved before mark sheets existed), keeping conduct, attendance and remarks.
 */
async function recomputeResults(all, cls, term, putRecord) {
  const subjects = classSubjects(cls);
  const sheets = all.marks.filter((m) => m.classId === cls.id && m.termId === term.id);
  const pupils = all.students.filter((s) => s.enrollments?.[term.sessionId] === cls.id);
  const rows = pupils.map((p) => {
    const old = all.academicRecords.find((r) => r.studentId === p.id && r.termId === term.id);
    const marks = { ...(old?.marks || {}) };
    const seqMarks = {};
    // A subject's sheets are the truth for that subject: its term mark is the average of its sequences.
    for (const subj of new Set(sheets.map((sh) => sh.subject))) {
      const ofSubject = sheets.filter((sh) => sh.subject === subj);
      const bySeq = ofSubject.filter((sh) => sh.sequence && sh.marks?.[p.id] !== undefined);
      const plain = ofSubject.find((sh) => !sh.sequence && sh.marks?.[p.id] !== undefined); // entered before sequences existed
      if (bySeq.length) {
        seqMarks[subj] = Object.fromEntries(bySeq.map((sh) => [sh.sequence, sh.marks[p.id]]));
        marks[subj] = Math.round((bySeq.reduce((t, sh) => t + sh.marks[p.id], 0) / bySeq.length) * 100) / 100;
      } else if (plain) marks[subj] = plain.marks[p.id];
      else delete marks[subj];
    }
    return { p, old, marks, seqMarks, avg: weightedAverage(marks, subjects) };
  }).filter((r) => r.old || r.avg !== null);
  const ranked = rows.filter((r) => r.avg !== null).sort((a, b) => b.avg - a.avg);
  const avgs = ranked.map((r) => r.avg);
  const classAverage = avgs.length ? Math.round((avgs.reduce((t, a) => t + a, 0) / avgs.length) * 100) / 100 : null;
  for (const r of rows) {
    const i = ranked.indexOf(r);
    // Ties share a position.
    const position = i < 0 ? null : ranked.findIndex((x) => x.avg === r.avg) + 1;
    const rec = {
      conduct: 'Good', attendance: null, daysOpen: null, ...(r.old || {}),
      id: `ar-${term.id}-${r.p.id}`, studentId: r.p.id, sessionId: term.sessionId, termId: term.id, classId: cls.id,
      marks: r.marks, seqMarks: r.seqMarks, sequences: termSequences(all.sessions, term.id), subjects, average: r.avg, position, outOf: ranked.length, classAverage, highest: avgs[0] ?? null, lowest: avgs.at(-1) ?? null,
    };
    if (!rec.remarkCustom && r.avg !== null) rec.remark = autoRemark(r.avg);
    if (JSON.stringify(rec) === JSON.stringify(r.old)) continue;
    all.academicRecords = [...all.academicRecords.filter((x) => x.id !== rec.id), rec];
    await putRecord('academicRecords', rec);
  }
}

async function writeAttendance(all, user, before, after, putRecord, now) {
  const cls = all.classes.find((c) => c.id === after.classId);
  if (!cls || !/^\d{4}-\d{2}-\d{2}$/.test(after.date || '')) throw new Invalid('Choose the class and the date.');
  // Dates are the school's local date (Cameroon is UTC+1); allow for time zones ahead of UTC.
  if (after.date > new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10)) throw new Invalid('You can’t take the register for a future date.');
  const inClass = new Set(all.students.filter((s) => s.classId === cls.id && s.status === 'active').map((s) => s.id));
  const absent = [...new Set(after.absent || [])].filter((id) => inClass.has(id));
  const late = [...new Set(after.late || [])].filter((id) => inClass.has(id) && !absent.includes(id));
  await putRecord('attendance', { id: `att-${cls.id}-${after.date}`, classId: cls.id, date: after.date, absent, late, present: inClass.size - absent.length, takenBy: user.id, takenAt: now });
  // Compare with the register already saved for this class and day, whatever id the browser sent.
  const saved = all.attendance.find((a) => a.classId === cls.id && a.date === after.date) || before;
  const was = new Set(saved?.absent || []);
  const when = after.date >= now.slice(0, 10) ? 'today' : `on ${after.date}`;
  for (const id of absent.filter((x) => !was.has(x))) {
    const s = all.students.find((x) => x.id === id);
    const userIds = all.users.filter((u) => u.role === 'parent' && u.status === 'active' && (s.guardianIds || []).includes(u.guardianId)).map((u) => u.id);
    if (!userIds.length) continue;
    await putRecord('notifications', {
      id: newId('nt'), userIds, roles: [], kind: 'info', sms: 'absence', link: `/portal/children?child=${s.id}&tab=attendance`, readBy: [], createdAt: now, by: user.id,
      title: `${s.firstName} was marked absent ${when}`,
      body: `${s.firstName} ${s.lastName} (${cls.name}) was not in class ${when}. If this is a mistake or your child is sick, please contact the school.`,
    });
  }
}

/**
 * Save an announcement and, when it is new, notify the people it is for (in the app and on their phones).
 * Audiences: all, parents, staff, or personal (chosen families only).
 */
async function writeAnnouncement(all, user, before, after, putRecord, now) {
  if (!['all', 'parents', 'staff', 'personal'].includes(after.audience)) throw new Invalid('Choose who the announcement is for.');
  if (!String(after.title || '').trim() || !String(after.body || '').trim()) throw new Invalid('Write a title and a message.');
  const guardianIds = after.audience === 'personal' ? [...new Set(after.guardianIds || [])].filter((id) => all.guardians.some((g) => g.id === id)) : [];
  if (after.audience === 'personal' && !guardianIds.length) throw new Invalid('Choose the parent(s) this message is for.');
  const a = { ...after, guardianIds, by: before?.by || user.id };
  await putRecord('announcements', a);
  if (before) return;
  const note = { kind: 'announcement', readBy: [], createdAt: now, by: user.id, title: a.title, body: String(a.body).slice(0, 180) };
  if (a.audience === 'personal') {
    const userIds = all.users.filter((u) => u.role === 'parent' && u.status === 'active' && guardianIds.includes(u.guardianId)).map((u) => u.id);
    if (userIds.length) await putRecord('notifications', { ...note, id: newId('nt'), userIds, roles: [], sms: 'personal', link: '/portal/news', title: `Message from the school: ${a.title}` });
    return;
  }
  // "Also send by SMS" on a general announcement texts parents too (it costs money, so it is a choice each time).
  if (a.audience !== 'staff') await putRecord('notifications', { ...note, id: newId('nt'), userIds: [], roles: ['parent'], link: '/portal/news', ...(after.sms ? { sms: 'announcement' } : {}) });
  if (a.audience !== 'parents') await putRecord('notifications', { ...note, id: newId('nt'), userIds: [], roles: STAFF_ROLES, link: '/announcements' });
}

async function writeUser(q, user, all, op) {
  const v = op.v || {};
  const existing = all.users.find((u) => u.id === (op.id || v.id));
  const canManage = user.role === 'superadmin' || (user.role === 'admin' && v.role === 'parent' && (!existing || existing.role === 'parent'));
  if (op.t !== 'put' || !canManage) throw new Forbidden('Only the super admin can manage these accounts.');
  if (!['superadmin', 'admin', 'bursar', 'teacher', 'staff', 'parent'].includes(v.role)) throw new Invalid('Invalid role.');
  if (existing && existing.status !== 'active') throw new Invalid('Approve or reject this sign-up from Sign-up requests first.');
  const username = String(v.username || '').trim();
  if (!username || !String(v.name || '').trim()) throw new Invalid('Name and username are required.');
  if (all.users.some((u) => u.id !== v.id && u.username.toLowerCase() === username.toLowerCase())) throw new Invalid('That username is taken.');
  if (existing && existing.id === user.id && (v.role !== 'superadmin' || v.active === false)) throw new Invalid("You can't demote or deactivate your own account.");
  if (v.password !== undefined && v.password !== '' && String(v.password).length < 6) throw new Invalid('Password must be at least 6 characters.');
  // Email doubles as a sign-in name, so it must be unique. Undefined = leave unchanged.
  const email = v.email === undefined ? undefined : String(v.email || '').trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Invalid('Enter a valid email address.');
  if (email && all.users.some((u) => u.id !== v.id && (u.email || '').toLowerCase() === email)) throw new Invalid('That email is already used by another account.');
  if (existing) {
    await q('update users set username = $2, role = $3, name = $4, staff_id = $5, guardian_id = $6, active = $7 where id = $1',
      [existing.id, username, v.role, v.name.trim(), v.staffId || null, v.guardianId || null, v.active !== false]);
    if (email !== undefined) await q('update users set email = $2 where id = $1', [existing.id, email]);
    if (v.password) await q('update users set password_hash = $2 where id = $1', [existing.id, await hashPassword(v.password)]);
  } else {
    if (!v.password) throw new Invalid('A password is required for new accounts.');
    await q('insert into users (id, username, password_hash, role, name, staff_id, guardian_id, active, email) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [v.id || newId('u'), username, await hashPassword(v.password), v.role, v.name.trim(), v.staffId || null, v.guardianId || null, v.active !== false, email || null]);
  }
}

export async function nextCounter(q, name) {
  const { rows } = await q(`insert into counters (name, value) values ($1, 1) on conflict (name) do update set value = counters.value + 1 returning value`, [name]);
  return rows[0].value;
}
