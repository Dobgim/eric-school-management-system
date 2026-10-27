// Accounts people create themselves, and the school's decisions on them.
//
// Parents:
//   - "My child already attends": the child's registration number + date of birth + the parent's phone must match
//     the school's records to open immediately; otherwise the office confirms which pupil(s) are theirs.
//   - "New family": opens immediately with a fresh parent record and no pupils. The parent can then apply to
//     register their children; nothing private is visible until the office accepts an application.
// Staff: only with an invitation code created by the super admin. The invitation fixes the role, so nobody can
//   sign up as staff (or give themselves more access) on their own.
import { randomInt } from 'node:crypto';
import { hashPassword, setSessionCookie, toClientUser } from './auth.js';
import { Forbidden, Invalid, loadAll, newId, nextCounter } from './data.js';
import { db } from './db.js';
import { normalizePhone } from './momo.js';

export const STAFF_ROLES = ['admin', 'bursar', 'teacher', 'staff'];
const ROLE_LABEL = { admin: 'Admin / Secretary', bursar: 'Bursar / Accountant', teacher: 'Teacher', staff: 'Staff (general)' };

// Per-IP brakes. 30 sign-ups per hour leaves room for many parents on the school Wi-Fi or one mobile network
// address; invitation look-ups are capped so codes can't be guessed by brute force.
const buckets = new Map();
function throttled(kind, ip, limit) {
  const key = `${kind}|${ip}`;
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < 3600_000);
  buckets.set(key, list);
  if (list.length >= limit) return true;
  list.push(now);
  return false;
}

const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const digits = (p) => normalizePhone(p).replace(/\D/g, '');
const putRecord = (q, c, v, by) => q(`insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)
  on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [c, v.id, JSON.stringify(v), by]);
const notify = (q, n) => putRecord(q, 'notifications', { id: newId('nt'), userIds: [], roles: [], readBy: [], createdAt: new Date().toISOString(), kind: 'info', ...n }, 'system');
const log = (q, userId, action, details = '') => {
  const e = { id: newId('lg'), userId, action, details, at: new Date().toISOString() };
  return putRecord(q, 'activityLog', e, userId || 'system');
};

// Invitation codes: 8 characters without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

function inviteProblem(inv) {
  if (!inv) return 'This invitation code is not valid. Check it, or ask the school for a new one.';
  if (inv.revoked) return 'This invitation was cancelled by the school.';
  if (inv.usedBy) return 'This invitation has already been used.';
  if (inv.expiresAt < new Date().toISOString()) return 'This invitation has expired. Ask the school for a new one.';
  return null;
}

/** Find the pupil and parent a parent's sign-up refers to (used at sign-up and when the office reviews it). */
export function matchParent(all, { childRegNo, childDob, phone }) {
  const student = all.students.find((s) => s.regNo?.toLowerCase() === String(childRegNo || '').trim().toLowerCase() && s.status === 'active');
  const dobOk = !!student && student.dob === childDob;
  const guardian = dobOk ? all.guardians.find((g) => (student.guardianIds || []).includes(g.id) && [g.phone, g.altPhone].some((p) => p && digits(p) === digits(phone))) : null;
  return { student: dobOk ? student : null, guardian, regNoFound: !!student };
}

export function signupRoutes(app, wrap, requireUser, broadcast) {
  const superOnly = (req) => { if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin can manage staff invitations.'); };
  const officeOnly = (req) => { if (!['superadmin', 'admin'].includes(req.user.role)) throw new Forbidden('Only the office can decide on admissions.'); };

  // ---------- Sign-up ----------
  app.post('/api/auth/signup', wrap(async (req, res) => {
    if (throttled('signup', req.ip, 30)) return res.status(429).json({ error: 'Too many sign-ups from this connection. Try again in an hour.' });
    const b = req.body || {};
    const type = b.type === 'staff' ? 'staff' : 'parent';
    const name = clean(b.name);
    const phone = digits(b.phone);
    const email = clean(b.email).toLowerCase();
    const password = String(b.password || '');
    if (name.length < 3) throw new Invalid('Enter your full name.');
    if (!/^\d{9}$/.test(phone)) throw new Invalid('Enter a valid 9-digit phone number, e.g. 677 12 34 56.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Invalid('Enter a valid email address or leave it empty.');
    if (password.length < 8) throw new Invalid('Choose a password of at least 8 characters.');
    const username = type === 'parent' ? phone : clean(b.username, 40).toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Invalid('Username: 3–40 letters, numbers, dots, dashes or underscores.');

    const conn = await db();
    const result = await conn.tx(async (q) => {
      const taken = await q('select status from users where lower(username) = $1', [username]);
      if (taken.rows[0]) {
        throw new Invalid(type === 'parent'
          ? (taken.rows[0].status === 'pending' ? 'A sign-up with this phone number is already waiting for approval.' : 'An account with this phone number already exists. Sign in, or ask the school to reset your password.')
          : 'That username is taken. Choose another one.');
      }
      const id = newId('u');
      const hash = await hashPassword(password);
      const all = await loadAll(q);
      const now = new Date().toISOString();

      if (type === 'staff') {
        const code = normCode(b.inviteCode);
        const inv = all.invites.find((i) => i.code === code);
        const problem = inviteProblem(inv);
        if (problem) throw new Forbidden(problem);
        let staffId = inv.staffId || null;
        if (staffId && all.users.some((u) => u.staffId === staffId && u.status === 'active')) throw new Invalid('That staff record already has an account. Ask the school for help.');
        if (!staffId) {
          const [firstName, ...rest] = name.split(/\s+/);
          const s = {
            id: newId('st'), staffNo: `${all.school?.regPrefix || 'SCH'}-STF-${String(await nextCounter(q, 'staff')).padStart(3, '0')}`,
            firstName, lastName: rest.join(' '), gender: ['M', 'F'].includes(b.gender) ? b.gender : 'F',
            category: inv.role === 'teacher' ? 'teaching' : 'non-teaching', position: clean(b.position, 60) || inv.position || ROLE_LABEL[inv.role],
            qualification: '', phone, email, dateEmployed: now.slice(0, 10), dob: '', address: '', gradeId: '', bankName: '', accountNo: '', momoNumber: '', classId: null, status: 'active', photo: '',
          };
          await putRecord(q, 'staff', s, id);
          staffId = s.id;
        }
        await q(`insert into users (id, username, password_hash, role, name, staff_id, active, status, phone, email, requested_role, signup)
                 values ($1, $2, $3, $4, $5, $6, true, 'active', $7, $8, $4, $9::jsonb)`,
        [id, username, hash, inv.role, name, staffId, phone, email || null, JSON.stringify({ invite: showCode(inv.code), position: clean(b.position, 60) })]);
        await putRecord(q, 'invites', { ...inv, usedBy: id, usedAt: now, usedByName: name }, id);
        await log(q, id, 'Joined with a staff invitation', `${name} — ${ROLE_LABEL[inv.role]} (${showCode(inv.code)})`);
        await notify(q, { roles: ['superadmin'], kind: 'confirmed', link: '/users', title: `${name} joined as ${ROLE_LABEL[inv.role]}`, body: `Used invitation ${showCode(inv.code)}.` });
        return { status: 'active', id };
      }

      const relationship = clean(b.relationship, 30) || 'Parent';
      if (b.mode === 'new') {
        // New family: a parent record of their own, no pupils until the office accepts an application.
        const known = all.guardians.find((g) => [g.phone, g.altPhone].some((p) => p && digits(p) === phone));
        if (known) throw new Invalid('This phone number is already on the school’s records as a parent. Choose “My child already attends” and enter your child’s registration number and date of birth.');
        const g = { id: newId('g'), name, relationship, phone, altPhone: '', email, occupation: clean(b.occupation, 60), address: clean(b.address, 120) };
        await putRecord(q, 'guardians', g, id);
        await q(`insert into users (id, username, password_hash, role, name, guardian_id, active, status, phone, email, requested_role, signup)
                 values ($1, $2, $3, 'parent', $4, $5, true, 'active', $6, $7, 'parent', $8::jsonb)`,
        [id, username, hash, name, g.id, phone, email || null, JSON.stringify({ newFamily: true, relationship })]);
        await log(q, id, 'New family signed up', name);
        await notify(q, { roles: ['superadmin', 'admin'], kind: 'info', link: '/guardians', title: `New family account: ${name}`, body: 'They can now apply to register their children.' });
        return { status: 'active', id };
      }

      const details = { childRegNo: clean(b.childRegNo, 40), childDob: clean(b.childDob, 10), relationship };
      if (!details.childRegNo || !/^\d{4}-\d{2}-\d{2}$/.test(details.childDob)) throw new Invalid("Enter your child's registration number and date of birth.");
      const { student, guardian } = matchParent(all, { ...details, phone });
      const guardianHasAccount = guardian && all.users.some((u) => u.guardianId === guardian.id && u.status !== 'rejected');
      if (guardian && !guardianHasAccount) {
        await q(`insert into users (id, username, password_hash, role, name, guardian_id, active, status, phone, email, requested_role, signup)
                 values ($1, $2, $3, 'parent', $4, $5, true, 'active', $6, $7, 'parent', $8::jsonb)`, [id, username, hash, name, guardian.id, phone, email || null, JSON.stringify({ ...details, autoLinked: true })]);
        if (email && !guardian.email) await putRecord(q, 'guardians', { ...guardian, email }, id);
        await log(q, id, 'Parent signed up (verified automatically)', `${name} — linked to ${student.firstName} ${student.lastName}`);
        await notify(q, { roles: ['superadmin', 'admin'], kind: 'info', link: '/guardians', title: `${name} created a parent account`, body: `Verified automatically for ${student.firstName} ${student.lastName} (${student.regNo}).` });
        return { status: 'active', id };
      }
      await q(`insert into users (id, username, password_hash, role, name, active, status, phone, email, requested_role, signup)
               values ($1, $2, $3, 'parent', $4, true, 'pending', $5, $6, 'parent', $7::jsonb)`, [id, username, hash, name, phone, email || null, JSON.stringify(details)]);
      await log(q, id, 'Parent sign-up waiting for approval', `${name} — child ${details.childRegNo}`);
      await notify(q, { roles: ['superadmin', 'admin'], kind: 'verify', link: '/signups', title: `Parent sign-up to review: ${name}`, body: `Phone ${phone} · child reg. no ${details.childRegNo} · ${guardianHasAccount ? 'that parent already has an account' : "couldn't be matched automatically"}` });
      return { status: 'pending', id };
    });

    broadcast({ type: 'change', by: null, collections: ['users', 'notifications', 'guardians', 'staff', 'invites'] });
    if (result.status === 'active') {
      const { rows } = await conn.query('select * from users where id = $1', [result.id]);
      setSessionCookie(req, res, rows[0]);
      return res.json({ status: 'active', user: toClientUser(rows[0]) });
    }
    res.json({ status: 'pending' });
  }));

  // ---------- Staff invitations ----------
  app.get('/api/invites/check', wrap(async (req, res) => {
    if (throttled('invite-check', req.ip, 60)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const conn = await db();
    const { rows } = await conn.query(`select data from records where collection = 'invites' and data->>'code' = $1`, [normCode(req.query.code)]);
    const inv = rows[0]?.data;
    const problem = inviteProblem(inv);
    if (problem) return res.json({ valid: false, reason: problem });
    res.json({ valid: true, role: inv.role, roleLabel: ROLE_LABEL[inv.role], name: inv.name || '', position: inv.position || '', expiresAt: inv.expiresAt });
  }));

  app.post('/api/invites', requireUser, wrap(async (req, res) => {
    superOnly(req);
    const b = req.body || {};
    if (!STAFF_ROLES.includes(b.role)) throw new Invalid('Choose the role for this person.');
    const days = Math.min(30, Math.max(1, Number(b.days) || 7));
    const conn = await db();
    const inv = await conn.tx(async (q) => {
      const all = await loadAll(q);
      if (b.staffId && !all.staff.some((s) => s.id === b.staffId)) throw new Invalid('Choose a staff record.');
      if (b.staffId && all.users.some((u) => u.staffId === b.staffId && u.status === 'active')) throw new Invalid('That staff record already has an account.');
      let code;
      do { code = newCode(); } while (all.invites.some((i) => i.code === code));
      const v = {
        id: newId('inv'), code, role: b.role, name: clean(b.name, 80), position: clean(b.position, 60), staffId: b.staffId || null,
        createdBy: req.user.id, createdByName: req.user.name, createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + days * 86400_000).toISOString(), usedBy: null, usedAt: null, revoked: false,
      };
      await putRecord(q, 'invites', v, req.user.id);
      await log(q, req.user.id, 'Created staff invitation', `${v.name || 'unnamed'} — ${ROLE_LABEL[v.role]} (${showCode(code)})`);
      return v;
    });
    broadcast({ type: 'change', by: null, collections: ['invites'] });
    res.json({ invite: inv });
  }));

  app.post('/api/invites/:id/revoke', requireUser, wrap(async (req, res) => {
    superOnly(req);
    const conn = await db();
    await conn.tx(async (q) => {
      const { rows } = await q(`select data from records where collection = 'invites' and id = $1`, [req.params.id]);
      const inv = rows[0]?.data;
      if (!inv) throw new Invalid('Invitation not found.');
      if (inv.usedBy) throw new Invalid('This invitation has already been used — deactivate the account under Users instead.');
      await putRecord(q, 'invites', { ...inv, revoked: true }, req.user.id);
      await log(q, req.user.id, 'Cancelled staff invitation', showCode(inv.code));
    });
    broadcast({ type: 'change', by: null, collections: ['invites'] });
    res.json({ ok: true });
  }));

  // ---------- Admission applications (parents registering children) ----------
  app.post('/api/admissions/:id/accept', requireUser, wrap(async (req, res) => {
    officeOnly(req);
    const b = req.body || {};
    const conn = await db();
    const student = await conn.tx(async (q) => {
      const all = await loadAll(q);
      const appl = all.admissionApplications.find((a) => a.id === req.params.id);
      if (!appl || appl.status !== 'pending') throw new Invalid('This application has already been handled.');
      const cls = all.classes.find((c) => c.id === (b.classId || appl.classId));
      if (!cls) throw new Invalid('Choose a class.');
      const guardian = all.guardians.find((g) => g.id === appl.guardianId);
      const sessionId = all.settings.currentSessionId;
      const admissionDate = /^\d{4}-\d{2}-\d{2}$/.test(b.admissionDate || '') ? b.admissionDate : new Date().toISOString().slice(0, 10);
      const regNo = `${all.school?.regPrefix || 'SCH'}/${admissionDate.slice(0, 4)}/${String(await nextCounter(q, 'reg')).padStart(4, '0')}`;
      const s = {
        id: newId('p'), regNo, firstName: appl.firstName, otherNames: appl.otherNames || '', lastName: appl.lastName, gender: appl.gender,
        dob: appl.dob, placeOfBirth: appl.placeOfBirth || '', nationality: 'Cameroonian', religion: '', bloodGroup: '',
        allergies: appl.allergies || '', medicalNotes: appl.medicalNotes || '', address: guardian?.address || '', previousSchool: appl.previousSchool || '',
        classId: cls.id, category: all.categories.some((c) => c.id === b.category) ? b.category : 'regular', admissionDate,
        sessionAdmitted: sessionId, isNew: true, enrollments: { [sessionId]: cls.id }, status: 'active',
        guardianIds: appl.guardianId ? [appl.guardianId] : [], photo: '', documents: appl.documents || [],
        history: [{ sessionId, classId: cls.id, action: 'admitted', date: admissionDate, note: `Online application ${appl.ref}` }],
      };
      await putRecord(q, 'students', s, req.user.id);
      await putRecord(q, 'admissionApplications', { ...appl, documents: [], status: 'accepted', studentId: s.id, regNo, admittedClassId: cls.id, reviewedBy: req.user.id, reviewedByName: req.user.name, reviewedAt: new Date().toISOString(), reviewNote: clean(b.note, 300) }, req.user.id);
      const parentUsers = all.users.filter((u) => u.guardianId === appl.guardianId && u.status === 'active').map((u) => u.id);
      await notify(q, { userIds: parentUsers, kind: 'confirmed', link: '/portal/children', title: `${appl.firstName} has been admitted to ${cls.name}`, body: `Registration number ${regNo}.${b.note ? ` ${clean(b.note, 300)}` : ''}` });
      await log(q, req.user.id, 'Accepted admission application', `${appl.ref} — ${appl.firstName} ${appl.lastName} → ${cls.name} (${regNo})`);
      return s;
    });
    broadcast({ type: 'change', by: null, collections: ['students', 'admissionApplications', 'notifications'] });
    res.json({ ok: true, regNo: student.regNo, studentId: student.id });
  }));

  app.post('/api/admissions/:id/reject', requireUser, wrap(async (req, res) => {
    officeOnly(req);
    const reason = clean(req.body?.reason, 300);
    if (!reason) throw new Invalid('Give the parent a reason.');
    const conn = await db();
    await conn.tx(async (q) => {
      const all = await loadAll(q);
      const appl = all.admissionApplications.find((a) => a.id === req.params.id);
      if (!appl || appl.status !== 'pending') throw new Invalid('This application has already been handled.');
      await putRecord(q, 'admissionApplications', { ...appl, status: 'rejected', reviewedBy: req.user.id, reviewedByName: req.user.name, reviewedAt: new Date().toISOString(), reviewNote: reason }, req.user.id);
      const parentUsers = all.users.filter((u) => u.guardianId === appl.guardianId && u.status === 'active').map((u) => u.id);
      await notify(q, { userIds: parentUsers, kind: 'rejected', link: '/portal/admissions', title: `Application for ${appl.firstName} not accepted`, body: reason });
      await log(q, req.user.id, 'Declined admission application', `${appl.ref} — ${reason}`);
    });
    broadcast({ type: 'change', by: null, collections: ['admissionApplications', 'notifications'] });
    res.json({ ok: true });
  }));

  // ---------- Office decisions on parent sign-ups that couldn't be matched ----------
  async function loadPending(q, id, user) {
    const { rows } = await q('select * from users where id = $1', [id]);
    const row = rows[0];
    if (!row || row.status !== 'pending') throw new Invalid('This sign-up has already been handled.');
    const isParent = row.requested_role === 'parent';
    if (!(user.role === 'superadmin' || (user.role === 'admin' && isParent))) throw new Forbidden(isParent ? 'Not allowed.' : 'Only the super admin can approve staff accounts.');
    return { row, isParent };
  }

  app.post('/api/signups/:id/approve', requireUser, wrap(async (req, res) => {
    const conn = await db();
    const b = req.body || {};
    await conn.tx(async (q) => {
      const { row, isParent } = await loadPending(q, req.params.id, req.user);
      const all = await loadAll(q);
      const now = new Date().toISOString();
      if (isParent) {
        let guardianId = b.guardianId;
        if (guardianId) {
          const g = all.guardians.find((x) => x.id === guardianId);
          if (!g) throw new Invalid('Choose a parent record.');
          if (all.users.some((u) => u.guardianId === guardianId && u.status === 'active')) throw new Invalid('That parent record already has an account.');
        } else {
          const studentIds = (b.studentIds || []).filter((sid) => all.students.some((s) => s.id === sid));
          if (!studentIds.length) throw new Invalid('Choose at least one pupil, or link to an existing parent record.');
          const g = { id: newId('g'), name: row.name, relationship: row.signup?.relationship || 'Parent', phone: row.phone || '', altPhone: '', email: row.email || '', occupation: '', address: '' };
          await putRecord(q, 'guardians', g, req.user.id);
          for (const sid of studentIds) {
            const s = all.students.find((x) => x.id === sid);
            await putRecord(q, 'students', { ...s, guardianIds: [...new Set([...(s.guardianIds || []), g.id])] }, req.user.id);
          }
          guardianId = g.id;
        }
        await q(`update users set status = 'active', role = 'parent', guardian_id = $2 where id = $1`, [row.id, guardianId]);
      } else {
        // Staff sign-ups made before invitations existed.
        const role = STAFF_ROLES.includes(b.role) ? b.role : 'staff';
        let staffId = b.staffId || null;
        if (staffId) {
          if (!all.staff.some((s) => s.id === staffId)) throw new Invalid('Choose a staff record.');
          if (all.users.some((u) => u.staffId === staffId && u.status === 'active')) throw new Invalid('That staff record already has an account.');
        } else if (b.createStaff) {
          const [firstName, ...rest] = row.name.split(/\s+/);
          const s = {
            id: newId('st'), staffNo: `${all.school?.regPrefix || 'SCH'}-STF-${String(await nextCounter(q, 'staff')).padStart(3, '0')}`,
            firstName, lastName: rest.join(' ') || '', gender: b.gender || 'F', category: b.category === 'teaching' ? 'teaching' : 'non-teaching',
            position: clean(b.position, 60) || row.signup?.position || ROLE_LABEL[role], qualification: '', phone: row.phone || '', email: row.email || '',
            dateEmployed: now.slice(0, 10), dob: '', address: '', gradeId: '', bankName: '', accountNo: '', momoNumber: '', classId: null, status: 'active', photo: '',
          };
          await putRecord(q, 'staff', s, req.user.id);
          staffId = s.id;
        }
        await q(`update users set status = 'active', role = $2, staff_id = $3 where id = $1`, [row.id, role, staffId]);
      }
      await q('update users set review_note = $2 where id = $1', [row.id, clean(b.note, 300) || null]);
      await notify(q, { userIds: [row.id], kind: 'confirmed', link: '/', title: 'Welcome! Your account has been approved', body: `Approved by ${req.user.name}.` });
      await log(q, req.user.id, 'Approved sign-up', `${row.name} (@${row.username})`);
    });
    broadcast({ type: 'change', by: null, collections: ['users', 'guardians', 'students', 'staff', 'notifications'] });
    res.json({ ok: true });
  }));

  app.post('/api/signups/:id/reject', requireUser, wrap(async (req, res) => {
    const reason = clean(req.body?.reason, 300);
    if (!reason) throw new Invalid('Give a reason so the person knows what to do.');
    const conn = await db();
    await conn.tx(async (q) => {
      const { row } = await loadPending(q, req.params.id, req.user);
      await q(`update users set status = 'rejected', active = false, review_note = $2 where id = $1`, [row.id, reason]);
      await log(q, req.user.id, 'Rejected sign-up', `${row.name} (@${row.username}) — ${reason}`);
    });
    broadcast({ type: 'change', by: null, collections: ['users'] });
    res.json({ ok: true });
  }));
}
