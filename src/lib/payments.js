import { allocateToScope, allocateToTerms } from './finance.js';
import { pad, today, uid } from './utils.js';

/**
 * Record money received for one pupil. The amount goes to the chosen term(s) when `scope` is given
 * (a term id or 'year'), otherwise across terms oldest debt first,
 * producing one receipt per term touched. Receipt numbers come from the server. Returns the new payment records.
 */
export async function recordPayment(db, api, { studentId, amount, method, reference = '', date = today(), receivedBy, channel = 'office', note = '', requestId, scope }) {
  const student = db.students.find((s) => s.id === studentId);
  const created = [];
  for (const p of scope ? allocateToScope(db, student, amount, scope) : allocateToTerms(db, student, amount)) {
    created.push({
      id: uid('pay'),
      receiptNo: `RCT-${date.slice(0, 4)}-${pad(await api.nextCounter('receipt'), 5)}`,
      studentId, sessionId: p.sessionId, termId: p.termId, date, amount: p.amount,
      method, reference, note, receivedBy, channel, ...(requestId ? { requestId } : {}),
    });
  }
  api.mutate((d) => { d.payments.push(...created); return d; });
  return created;
}

export const nextRequestRef = async (api) => `PAY-${pad(await api.nextCounter('request'), 5)}`;
