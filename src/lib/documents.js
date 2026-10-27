import { allocate, billLines, feeStatus, termById } from './finance';
import { payslipPDF, receiptPDF } from './exporters';
import { feeTypeLabel, methodLabel, monthLabel } from './utils';

/** Build and download the official receipt for one payment. */
export function downloadReceipt(db, payment) {
  const student = db.students.find((s) => s.id === payment.studentId);
  const term = termById(db, payment.termId);
  const classId = student.enrollments?.[term.sessionId] || student.classId;
  const lines = billLines(db, student, payment.termId);
  // "Paid to date" on the receipt covers payments up to and including this one.
  const paidToDate = db.payments
    .filter((p) => p.studentId === student.id && p.termId === payment.termId && (p.date < payment.date || (p.date === payment.date && p.receiptNo <= payment.receiptNo)))
    .reduce((t, p) => t + p.amount, 0);
  const status = feeStatus(db, student, payment.termId);
  const allocated = allocate(lines, paidToDate).map((l) => ({ ...l, label: feeTypeLabel(l.feeType) }));
  const billed = lines.reduce((t, l) => t + l.amount, 0);
  receiptPDF({
    school: db.school,
    payment: { ...payment, methodLabel: methodLabel(payment.method) },
    student,
    className: db.classes.find((c) => c.id === classId)?.name || '',
    term: term.label,
    lines: allocated,
    status: { ...status, billed, paid: paidToDate, balance: Math.max(0, billed - paidToDate) },
    receivedBy: payment.channel === 'online'
      ? 'Online payment (parent portal)'
      : db.users.find((u) => u.id === payment.receivedBy)?.name || 'Bursar',
  });
}

export function downloadPayslip(db, run, item) {
  const staff = db.staff.find((s) => s.id === item.staffId);
  payslipPDF({
    school: db.school,
    staff,
    grade: db.salaryScales.find((g) => g.id === staff.gradeId),
    item: { ...item, methodLabel: methodLabel(item.method) },
    month: monthLabel(run.month),
  });
}
