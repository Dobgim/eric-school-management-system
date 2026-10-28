import { FEE_TYPES, sum } from './utils.js';

export const allTerms = (db) =>
  db.sessions.flatMap((s) => s.terms.map((t) => ({ ...t, sessionId: s.id, sessionName: s.name, label: `${t.name} ${s.name}` }))).sort((a, b) => a.start.localeCompare(b.start));

export const termById = (db, id) => allTerms(db).find((t) => t.id === id);
export const currentSession = (db) => db.sessions.find((s) => s.id === db.settings.currentSessionId);
export const currentTerm = (db) => termById(db, db.settings.currentTermId);

/** Terms from the start of the student's enrolment up to (and including) the given term. */
export function termsUpTo(db, termId) {
  const terms = allTerms(db);
  const idx = terms.findIndex((t) => t.id === termId);
  return terms.slice(0, idx + 1);
}

/** Fee lines charged to a student for one term. */
export function billLines(db, student, termId) {
  const term = termById(db, termId);
  if (!term) return [];
  const classId = student.enrollments?.[term.sessionId];
  if (!classId) return [];
  // Students who left stop being billed after their exit date.
  if (student.exitDate && term.start > student.exitDate) return [];
  const cat = db.categories.find((c) => c.id === student.category);
  const disc = cat?.tuitionDiscount || 0;
  const isNewThisSession = student.isNew && student.sessionAdmitted === term.sessionId;
  return db.feeItems
    .filter((f) => f.termId === termId && f.classId === classId && (f.appliesTo === 'all' || isNewThisSession))
    .map((f) => {
      const amount = f.feeType === 'tuition' ? Math.round(f.amount * (1 - disc / 100)) : f.amount;
      return { feeType: f.feeType, amount, discount: f.feeType === 'tuition' ? f.amount - amount : 0 };
    })
    .sort((a, b) => FEE_TYPES.findIndex((x) => x.id === a.feeType) - FEE_TYPES.findIndex((x) => x.id === b.feeType));
}

export const termBill = (db, student, termId) => sum(billLines(db, student, termId), (l) => l.amount);

export const termPaid = (db, studentId, termId) =>
  sum(db.payments.filter((p) => p.studentId === studentId && p.termId === termId), (p) => p.amount);

/** Billed, paid and balance for the term, plus arrears carried from earlier terms. */
export function feeStatus(db, student, termId = db.settings.currentTermId) {
  const billed = termBill(db, student, termId);
  const paid = termPaid(db, student.id, termId);
  const earlier = termsUpTo(db, termId).slice(0, -1);
  const arrears = Math.max(0, sum(earlier, (t) => termBill(db, student, t.id) - termPaid(db, student.id, t.id)));
  const balance = Math.max(0, billed - paid);
  return {
    billed, paid, balance, arrears,
    totalDue: balance + arrears,
    state: billed === 0 ? 'none' : paid >= billed ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
  };
}

/** Allocate a term's total paid across fee lines in priority order (for receipts). */
export function allocate(lines, paid) {
  let left = paid;
  return lines.map((l) => {
    const take = Math.min(l.amount, Math.max(0, left));
    left -= take;
    return { ...l, paid: take, outstanding: l.amount - take };
  });
}

export function payrollTotals(run) {
  const items = run?.items || [];
  return {
    gross: sum(items, (i) => i.gross),
    net: sum(items, (i) => i.net),
    paid: sum(items.filter((i) => i.paid), (i) => i.net),
    unpaid: sum(items.filter((i) => !i.paid), (i) => i.net),
    paidCount: items.filter((i) => i.paid).length,
    count: items.length,
    deductions: sum(items, (i) => i.advance + i.cnps + i.otherDeductions),
  };
}

export function computePayrollItem(db, staff, month) {
  const g = db.salaryScales.find((x) => x.id === staff.gradeId) || { basic: 0, housing: 0, transport: 0 };
  const adj = db.salaryAdjustments.filter((a) => a.staffId === staff.id && a.month === month);
  const bonus = sum(adj.filter((a) => a.type === 'bonus'), (a) => a.amount);
  const advance = sum(adj.filter((a) => a.type === 'advance'), (a) => a.amount);
  const otherDeductions = sum(adj.filter((a) => a.type === 'deduction'), (a) => a.amount);
  const cnps = Math.round((g.basic * (Number(db.settings.cnpsRate) || 0)) / 100);
  const gross = g.basic + g.housing + g.transport + bonus;
  return {
    staffId: staff.id, basic: g.basic, housing: g.housing, transport: g.transport,
    bonus, advance, cnps, otherDeductions, gross,
    net: Math.max(0, gross - advance - cnps - otherDeductions),
    paid: false, paidDate: null,
    method: staff.bankName === 'MTN Mobile Money' ? 'mtn' : staff.bankName === 'Orange Money' ? 'orange' : staff.accountNo ? 'bank' : 'cash',
  };
}

/** Split an amount across the oldest unpaid terms first; any surplus is credited to the current term. */
export function allocateToTerms(db, student, amount) {
  const current = termById(db, db.settings.currentTermId);
  const out = [];
  let left = Math.round(Number(amount) || 0);
  for (const t of termsUpTo(db, current.id)) {
    const due = termBill(db, student, t.id) - termPaid(db, student.id, t.id);
    if (due <= 0 || left <= 0) continue;
    const take = Math.min(due, left);
    out.push({ termId: t.id, sessionId: t.sessionId, amount: take });
    left -= take;
  }
  if (left > 0) {
    const cur = out.find((x) => x.termId === current.id);
    if (cur) cur.amount += left;
    else out.push({ termId: current.id, sessionId: current.sessionId, amount: left });
  }
  return out;
}

/** Amount already submitted by a parent but not yet verified, per pupil. */
export const pendingFor = (db, studentId) =>
  sum((db.paymentRequests || []).filter((r) => r.status === 'pending').flatMap((r) => r.items).filter((i) => i.studentId === studentId), (i) => i.amount);

/** Terms a parent can pay for: each term of the current session, or 'year' for all of them. */
export const sessionTerms = (db) => allTerms(db).filter((t) => t.sessionId === db.settings.currentSessionId);
export const scopeTerms = (db, scope) => (scope === 'year' ? sessionTerms(db) : allTerms(db).filter((t) => t.id === scope));
export const scopeLabel = (db, scope) => (scope === 'year' ? `Whole year ${currentSession(db)?.name || ''}`.trim() : termById(db, scope)?.label || '');

/** Still to pay for one term, or for the whole year. */
export const dueForScope = (db, student, scope) =>
  sum(scopeTerms(db, scope), (t) => Math.max(0, termBill(db, student, t.id) - termPaid(db, student.id, t.id)));

/** Split an amount over the chosen term(s), earliest first; any surplus stays on the last one. */
export function allocateToScope(db, student, amount, scope) {
  const terms = scopeTerms(db, scope);
  if (!terms.length) return allocateToTerms(db, student, amount);
  const out = [];
  let left = Math.round(Number(amount) || 0);
  for (const t of terms) {
    const due = termBill(db, student, t.id) - termPaid(db, student.id, t.id);
    if (due <= 0 || left <= 0) continue;
    const take = Math.min(due, left);
    out.push({ termId: t.id, sessionId: t.sessionId, amount: take });
    left -= take;
  }
  if (left > 0) {
    const last = terms[terms.length - 1];
    const hit = out.find((x) => x.termId === last.id);
    if (hit) hit.amount += left;
    else out.push({ termId: last.id, sessionId: last.sessionId, amount: left });
  }
  return out;
}

/** Fee position for a term or the whole year: what was billed, paid and is left, and whether it is complete. */
export function scopeStatus(db, student, scope) {
  const terms = scopeTerms(db, scope);
  const billed = sum(terms, (t) => termBill(db, student, t.id));
  const paid = sum(terms, (t) => termPaid(db, student.id, t.id));
  return { billed, paid, left: Math.max(0, billed - paid), complete: billed > 0 && paid >= billed };
}
