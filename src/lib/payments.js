import { allocateToTerms } from './finance';
import { pad, today, uid } from './utils';

/**
 * Record money received for one pupil. The amount is split across terms (oldest debt first),
 * producing one receipt per term touched. Returns the new payment records.
 */
export function recordPayment(db, api, { studentId, amount, method, reference = '', date = today(), receivedBy, channel = 'office', note = '', requestId }) {
  const student = db.students.find((s) => s.id === studentId);
  const parts = allocateToTerms(db, student, amount);
  const created = parts.map((p) => ({
    id: uid('pay'),
    receiptNo: `RCT-${date.slice(0, 4)}-${pad(api.nextCounter('receipt'), 5)}`,
    studentId, sessionId: p.sessionId, termId: p.termId, date, amount: p.amount,
    method, reference, note, receivedBy, channel, ...(requestId ? { requestId } : {}),
  }));
  api.mutate((d) => { d.payments.push(...created); return d; });
  return created;
}

export const nextRequestRef = (api) => `PAY-${pad(api.nextCounter('request'), 5)}`;
