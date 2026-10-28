// Teachers create their own account, saying which classes and subjects they teach. Only the school's real teachers
// can get in, in one of two ways:
//   1. an invitation code from the school (made by the super admin for a teacher) — the account opens at once;
//   2. their phone number is on a teaching staff record the office already created — the account waits until
//      the super admin approves it.
// Either way, the classes and subjects they declare only take effect once the office confirms them (those decide
// whose marks they may enter), so a teacher can't give themselves access to other classes.
import { classSubjects } from '../src/lib/subjects.js';
import { hashPassword, setSessionCookie, toClientUser } from './auth.js';
import { Forbidden, Invalid, loadAll, newId, nextCounter } from './data.js';
import { db } from './db.js';
import { normalizePhone } from './momo.js';

const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const digits = (p) => normalizePhone(p).replace(/\D/g, '');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const putRecord = (q, c, v, by) => q(`insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)
  on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [c, v.id, JSON.stringify(v), by]);
const notify = (q, n) => putRecord(q, 'notifications', { id: newId('nt'), userIds: [], roles: [], readBy: [], createdAt: new Date().toISOString(), kind: 'info', ...n }, 'system');
const log = (q, userId, action, details = '') => { const e = { id: newId('lg'), userId, action, details, at: new Date().toISOString() }; return putRecord(q, 'activityLog', e, userId || 'system'); };

const buckets = new Map();
function throttled(ip, limit = 20) {
  const now = Date.now();
  const list = (buckets.get(ip) || []).filter((t) => now - t < 3600_000);
  buckets.set(ip, list);
  if (list.length >= limit) return true;
  list.push(now);
  return false;
}

/** Check the declared classes and subjects against the school's classes; returns a clean request. */
function teachingRequest(all, b) {
  const classes = all.classes;
  const teaching = [];
  for (const t of Array.isArray(b.teaching) ? b.teaching : []) {
    const subject = clean(t.subject, 60);
    const classIds = [...new Set((t.classIds || []).filter((id) => classes.some((c) => c.id === id)))];
    if (!subject || !classIds.length) continue;
    // The subject must be one taught in each chosen class (same names the report cards use).
    const bad = classIds.map((id) => classes.find((c) => c.id === id)).filter((c) => !classSubjects(c).some((s) => s.name.toLowerCase() === subject.toLowerCase()));
    if (bad.length) throw new Invalid(`${subject} is not a subject of ${bad.map((c) => c.name).join(', ')}.`);
    const name = classSubjects(classes.find((c) => c.id === classIds[0])).find((s) => s.name.toLowerCase() === subject.toLowerCase()).name;
    const same = teaching.find((x) => x.subject === name);
    if (same) same.classIds = [...new Set([...same.classIds, ...classIds])];
    else teaching.push({ subject: name, classIds });
  }
  const classTeacherOf = classes.some((c) => c.id === b.classTeacherOf) ? b.classTeacherOf : null;
  if (!teaching.length && !classTeacherOf) throw new Invalid('Choose the classes and subjects you teach.');
  return { teaching, classTeacherOf };
}

export function teacherRoutes(app, wrap, requireUser, broadcast) {
  // Classes and their subjects, for the sign-up form (no private data).
  app.get('/api/public/classes', wrap(async (req, res) => {
    const conn = await db();
    const { rows } = await conn.query(`select data from records where collection = 'classes'`);
    res.json(rows.map((r) => r.data).sort((a, b) => a.order - b.order).map((c) => ({ id: c.id, name: c.name, subjects: classSubjects(c).map((s) => s.name) })));
  }));

  app.post('/api/auth/teacher-signup', wrap(async (req, res) => {
    if (throttled(req.ip)) return res.status(429).json({ error: 'Too many sign-ups from this connection. Try again in an hour.' });
    const b = req.body || {};
    const name = clean(b.name);
    const phone = digits(b.phone);
    const email = clean(b.email).toLowerCase();
    const password = String(b.password || '');
    const username = clean(b.username, 40).toLowerCase();
    if (name.split(/\s+/).length < 2) throw new Invalid('Enter your full name (first name and surname).');
    if (!/^\d{9}$/.test(phone)) throw new Invalid('Enter a valid 9-digit phone number, e.g. 677 12 34 56.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Invalid('Enter a valid email address or leave it empty.');
    if (password.length < 8) throw new Invalid('Choose a password of at least 8 characters.');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Invalid('Username: 3–40 letters, numbers, dots, dashes or underscores.');

    const conn = await db();
    const result = await conn.tx(async (q) => {
      if ((await q('select 1 from users where lower(username) = $1', [username])).rows.length) throw new Invalid('That username is taken. Choose another one.');
      if (email && (await q('select 1 from users where lower(email) = $1', [email])).rows.length) throw new Invalid('That email is already used by another account.');
      const all = await loadAll(q);
      const request = teachingRequest(all, b);
      const now = new Date().toISOString();
      const id = newId('u');
      const hash = await hashPassword(password);
      const linked = (staffId) => all.users.some((u) => u.staffId === staffId && u.status !== 'rejected');
      let staff;
      let status;
      let via;

      if (normCode(b.inviteCode)) {
        // 1. Invitation code: proves the school invited this person as a teacher.
        const inv = all.invites.find((i) => i.code === normCode(b.inviteCode));
        if (!inv || inv.revoked || inv.usedBy || inv.expiresAt < now) throw new Forbidden('This invitation code is not valid, already used or expired. Ask the school for a new one.');
        if (inv.role !== 'teacher') throw new Forbidden('This invitation is not for a teacher. Use “Staff: I have an invitation” on the sign-in page.');
        staff = inv.staffId ? all.staff.find((s) => s.id === inv.staffId) : null;
        if (staff && linked(staff.id)) throw new Invalid('That staff record already has an account. Ask the school for help.');
        await putRecord(q, 'invites', { ...inv, usedBy: id, usedAt: now, usedByName: name }, id);
        status = 'active';
        via = `invitation ${inv.code.slice(0, 4)}-${inv.code.slice(4)}`;
      } else {
        // 2. Phone number on a teaching staff record the office created; the super admin approves the account.
        staff = all.staff.find((s) => s.status === 'active' && s.category === 'teaching' && digits(s.phone) === phone && !linked(s.id));
        if (!staff) throw new Forbidden('Your phone number is not on the school’s list of teachers. Ask the school office to add you under Staff, or to give you an invitation code.');
        status = 'pending';
        via = 'phone number on the staff list';
      }

      if (!staff) {
        const [firstName, ...rest] = name.split(/\s+/);
        staff = {
          id: newId('st'), staffNo: `${all.school?.regPrefix || 'SCH'}-STF-${String(await nextCounter(q, 'staff')).padStart(3, '0')}`,
          firstName, lastName: rest.join(' '), gender: ['M', 'F'].includes(b.gender) ? b.gender : 'F', category: 'teaching', position: 'Teacher',
          qualification: '', phone, email, dateEmployed: now.slice(0, 10), dob: '', address: '', gradeId: '', bankName: '', accountNo: '', momoNumber: '', classId: null, status: 'active', photo: '', teaching: [],
        };
      }
      await putRecord(q, 'staff', { ...staff, teachingRequest: { ...request, userId: id, name, phone, at: now, pendingAccount: status === 'pending' } }, id);
      await q(`insert into users (id, username, password_hash, role, name, staff_id, active, status, phone, email, requested_role, signup)
               values ($1, $2, $3, 'teacher', $4, $5, true, $6, $7, $8, 'teacher', $9::jsonb)`,
      [id, username, hash, name, staff.id, status, phone, email || null, JSON.stringify({ teacher: true, via })]);
      const classesText = [...new Set(request.teaching.flatMap((t) => t.classIds).concat(request.classTeacherOf || []))].map((cid) => all.classes.find((c) => c.id === cid)?.name).join(', ');
      await log(q, id, status === 'active' ? 'Teacher joined' : 'Teacher sign-up waiting for approval', `${name} — via ${via}`);
      await notify(q, {
        roles: status === 'active' ? ['superadmin', 'admin'] : ['superadmin'], kind: 'verify', link: '/signups',
        title: status === 'active' ? `Confirm the classes of ${name}` : `Teacher sign-up to approve: ${name}`,
        body: `${request.teaching.map((t) => t.subject).join(', ') || 'Class teacher'} · ${classesText} · via ${via}`,
      });
      return { status, id };
    });

    broadcast({ type: 'change', by: null, collections: ['users', 'staff', 'invites', 'notifications'] });
    if (result.status === 'active') {
      const { rows } = await conn.query('select * from users where id = $1', [result.id]);
      setSessionCookie(req, res, rows[0]);
      return res.json({ status: 'active', user: toClientUser(rows[0]) });
    }
    res.json({ status: 'pending' });
  }));

  /**
   * The office confirms what a teacher said they teach (it may correct it first). A sign-up still waiting for
   * approval is activated at the same time — only the super admin can do that.
   */
  app.post('/api/teachers/:staffId/confirm', requireUser, wrap(async (req, res) => {
    if (!['superadmin', 'admin'].includes(req.user.role)) throw new Forbidden('Only the office can confirm teachers.');
    const conn = await db();
    await conn.tx(async (q) => {
      const all = await loadAll(q);
      const staff = all.staff.find((s) => s.id === req.params.staffId);
      if (!staff?.teachingRequest) throw new Invalid('There is nothing to confirm for this teacher.');
      const reqd = staff.teachingRequest;
      if (reqd.pendingAccount && req.user.role !== 'superadmin') throw new Forbidden('Only the super admin can approve a new teacher account.');
      const final = req.body?.teaching || req.body?.classTeacherOf !== undefined ? teachingRequest(all, { teaching: req.body.teaching ?? reqd.teaching, classTeacherOf: req.body.classTeacherOf ?? reqd.classTeacherOf }) : reqd;
      const { teachingRequest: _, ...rest } = staff;
      await putRecord(q, 'staff', { ...rest, category: 'teaching', teaching: final.teaching }, req.user.id);
      if (final.classTeacherOf) {
        const cls = all.classes.find((c) => c.id === final.classTeacherOf);
        await putRecord(q, 'classes', { ...cls, teacherId: staff.id }, req.user.id);
      }
      if (reqd.pendingAccount) await q(`update users set status = 'active', active = true where id = $1 and status = 'pending'`, [reqd.userId]);
      await notify(q, { userIds: [reqd.userId], kind: 'confirmed', link: '/academics', title: reqd.pendingAccount ? 'Welcome! Your teacher account is approved' : 'Your classes and subjects are confirmed', body: `Confirmed by ${req.user.name}. You can now enter marks for your subjects.` });
      await log(q, req.user.id, 'Confirmed teacher', `${reqd.name} — ${final.teaching.map((t) => t.subject).join(', ')}`);
    });
    broadcast({ type: 'change', by: null, collections: ['users', 'staff', 'classes', 'notifications'] });
    res.json({ ok: true });
  }));

  app.post('/api/teachers/:staffId/reject', requireUser, wrap(async (req, res) => {
    if (!['superadmin', 'admin'].includes(req.user.role)) throw new Forbidden('Only the office can decide on teachers.');
    const reason = clean(req.body?.reason, 300);
    if (!reason) throw new Invalid('Give a reason so the person knows what to do.');
    const conn = await db();
    await conn.tx(async (q) => {
      const all = await loadAll(q);
      const staff = all.staff.find((s) => s.id === req.params.staffId);
      if (!staff?.teachingRequest) throw new Invalid('There is nothing to decide for this teacher.');
      const reqd = staff.teachingRequest;
      if (reqd.pendingAccount && req.user.role !== 'superadmin') throw new Forbidden('Only the super admin can refuse a new teacher account.');
      const { teachingRequest: _, ...rest } = staff;
      await putRecord(q, 'staff', rest, req.user.id);
      if (reqd.pendingAccount) await q(`update users set status = 'rejected', active = false, review_note = $2 where id = $1`, [reqd.userId, reason]);
      else await notify(q, { userIds: [reqd.userId], kind: 'rejected', link: '/my-class', title: 'Your classes and subjects were not confirmed', body: reason });
      await log(q, req.user.id, 'Refused teacher request', `${reqd.name} — ${reason}`);
    });
    broadcast({ type: 'change', by: null, collections: ['users', 'staff', 'notifications'] });
    res.json({ ok: true });
  }));
}
