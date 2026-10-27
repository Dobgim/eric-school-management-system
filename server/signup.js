// Self sign-up for parents and staff, and the school's approval of those requests.
//
// Parents: if the child's registration number + date of birth match a pupil AND the phone number matches
// a parent already recorded for that pupil, the account opens immediately, linked to that parent record
// (and so to all their children). Otherwise it waits for the office to confirm.
// Staff: always wait for the super admin, who sets the real role — nobody can give themselves access.
import { hashPassword, setSessionCookie, toClientUser } from './auth.js';
import { Forbidden, Invalid, loadAll, newId, nextCounter } from './data.js';
import { db } from './db.js';
import { normalizePhone } from './momo.js';

export const STAFF_ROLES = ['admin', 'bursar', 'teacher', 'staff'];
const ROLE_LABEL = { admin: 'Admin / Secretary', bursar: 'Bursar / Accountant', teacher: 'Teacher', staff: 'Staff' };

// At most 30 sign-ups per IP address per hour: stops automated spam, but leaves room for many parents
// signing up over the school Wi-Fi or one mobile network address.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 3600_000);
  attempts.set(ip, list);
  if (list.length >= 30) return true;
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

/** Find the pupil and parent a parent's sign-up refers to (used at sign-up and when the office reviews it). */
export function matchParent(all, { childRegNo, childDob, phone }) {
  const student = all.students.find((s) => s.regNo?.toLowerCase() === String(childRegNo || '').trim().toLowerCase() && s.status === 'active');
  const dobOk = !!student && student.dob === childDob;
  const guardian = dobOk ? all.guardians.find((g) => (student.guardianIds || []).includes(g.id) && [g.phone, g.altPhone].some((p) => p && digits(p) === digits(phone))) : null;
  return { student: dobOk ? student : null, guardian, regNoFound: !!student };
}

export function signupRoutes(app, wrap, requireUser, broadcast) {
  app.post('/api/auth/signup', wrap(async (req, res) => {
    if (throttled(req.ip)) return res.status(429).json({ error: 'Too many sign-ups from this connection. Try again in an hour.' });
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

      if (type === 'parent') {
        const details = { childRegNo: clean(b.childRegNo, 40), childDob: clean(b.childDob, 10), relationship: clean(b.relationship, 30) || 'Parent' };
        if (!details.childRegNo || !/^\d{4}-\d{2}-\d{2}$/.test(details.childDob)) throw new Invalid("Enter your child's registration number and date of birth.");
        const all = await loadAll(q);
        const { student, guardian } = matchParent(all, { ...details, phone });
        const guardianHasAccount = guardian && all.users.some((u) => u.guardianId === guardian.id && u.status !== 'rejected');
        if (guardian && !guardianHasAccount) {
          // Verified against the school's records: open the account straight away.
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
      }

      const requestedRole = STAFF_ROLES.includes(b.role) ? b.role : 'staff';
      const details = { position: clean(b.position, 60), department: ROLE_LABEL[requestedRole], message: clean(b.message, 300) };
      if (!details.position) throw new Invalid('Enter your job title (e.g. Class Teacher, Bursar, Nurse).');
      // Placeholder role 'staff' until approved; the approver decides the real role.
      await q(`insert into users (id, username, password_hash, role, name, active, status, phone, email, requested_role, signup)
               values ($1, $2, $3, 'staff', $4, true, 'pending', $5, $6, $7, $8::jsonb)`, [id, username, hash, name, phone, email || null, requestedRole, JSON.stringify(details)]);
      await log(q, id, 'Staff sign-up waiting for approval', `${name} — ${ROLE_LABEL[requestedRole]} (${details.position})`);
      await notify(q, { roles: ['superadmin'], kind: 'verify', link: '/signups', title: `Staff sign-up to review: ${name}`, body: `${ROLE_LABEL[requestedRole]} · ${details.position} · ${phone}` });
      return { status: 'pending', id };
    });

    broadcast({ type: 'change', by: null, collections: ['users', 'notifications'] });
    if (result.status === 'active') {
      const { rows } = await conn.query('select * from users where id = $1', [result.id]);
      setSessionCookie(req, res, rows[0]);
      return res.json({ status: 'active', user: toClientUser(rows[0]) });
    }
    res.json({ status: 'pending' });
  }));

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
        const role = STAFF_ROLES.includes(b.role) ? b.role : 'staff';
        let staffId = b.staffId || null;
        if (staffId) {
          if (!all.staff.some((s) => s.id === staffId)) throw new Invalid('Choose a staff record.');
          if (all.users.some((u) => u.staffId === staffId && u.status === 'active')) throw new Invalid('That staff record already has an account.');
        } else if (b.createStaff) {
          const school = all.school || {};
          const [firstName, ...rest] = row.name.split(/\s+/);
          const s = {
            id: newId('st'), staffNo: `${school.regPrefix || 'SCH'}-STF-${String(await nextCounter(q, 'staff')).padStart(3, '0')}`,
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
