import { allTerms, allocate, billLines, feeStatus, staffPay, termById } from './finance';
import { payslipPDF, receiptPDF, reportCardsPDF, timetablePDF } from './exporters';
import { DAYS } from './timetable';
import { classSubjects } from './subjects';
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
    grade: staffPay(db, staff),
    item: { ...item, methodLabel: methodLabel(item.method) },
    month: monthLabel(run.month),
  });
}

/** Report cards for one or more term records (one page each), in the order given. */
export function downloadReportCards(db, records, filename) {
  const terms = allTerms(db);
  const cards = records.map((r) => {
    const student = db.students.find((s) => s.id === r.studentId);
    const cls = db.classes.find((c) => c.id === r.classId);
    const term = termById(db, r.termId);
    const teacher = db.staff.find((s) => s.id === cls?.teacherId);
    const next = terms[terms.findIndex((t) => t.id === r.termId) + 1];
    // Subjects as they were when the marks were entered, falling back to the class's current list.
    const subjects = r.subjects?.length ? r.subjects : classSubjects(cls);
    return { student, className: cls?.name || '', term: term?.label || '', record: r, subjects, teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : '', nextTerm: next?.start };
  }).filter((c) => c.student);
  if (cards.length) reportCardsPDF({ school: db.school, cards, filename });
}

/** PDF of a class timetable, or (with `teacher`) of one teacher's week. */
export function exportTimetable(db, tt, teacher) {
  const short = (id) => { const s = db.staff.find((x) => x.id === id); return s ? `${s.firstName[0]}. ${s.lastName}` : ''; };
  const days = DAYS.map(([, label]) => label);
  if (teacher) {
    // One row per distinct time slot the teacher has a lesson in.
    const slots = [...new Map(teacher.lessons.map((l) => [`${l.period.start}-${l.period.end}`, l.period])).values()].sort((a, b) => a.start.localeCompare(b.start));
    const rows = slots.map((p) => ({ time: `${p.start}-${p.end}`, kind: 'lesson', cells: DAYS.map(([d]) => teacher.lessons.filter((l) => l.day === d && l.period.start === p.start).map((l) => `${l.subject} - ${db.classes.find((c) => c.id === l.classId)?.name || ''}`).join(' / ')) }));
    return timetablePDF({ school: db.school, title: 'TEACHER TIMETABLE', subtitle: teacher.name, days, rows, filename: `Timetable - ${teacher.name}` });
  }
  const cls = db.classes.find((c) => c.id === tt.classId);
  const rows = tt.periods.map((p, i) => ({
    time: `${p.start}-${p.end}`, kind: p.kind, label: p.label,
    cells: DAYS.map(([d]) => { const c = tt.cells?.[`${d}-${i}`]; return c?.subject ? `${c.subject}${c.teacherId ? `
${short(c.teacherId)}` : ''}` : ''; }),
  }));
  return timetablePDF({ school: db.school, title: 'CLASS TIMETABLE', subtitle: cls?.name, days, rows, filename: `Timetable - ${cls?.name}` });
}
