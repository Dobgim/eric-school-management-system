import { ALL_SUBJECTS, defaultSubjects } from './levels.js';
// Subject names offered as suggestions (nursery, primary and secondary, English- and French-speaking).
export const SUBJECTS = [...new Set([
  ...ALL_SUBJECTS, 'Music', 'Home Economics', 'Agriculture', 'Moral Education', 'Commerce', 'Accounting', 'Food and Nutrition',
  'Technical Drawing', 'Logic', 'Additional Mathematics', 'Physics with Chemistry',
])];

/** "Mathematics: Class 5, Class 6" lines for a staff member's teaching assignments. */
export const teachingLines = (staff, classes) => (staff.teaching || [])
  .filter((t) => t.subject)
  .map((t) => ({ subject: t.subject, classes: classes.filter((c) => (t.classIds || []).includes(c.id)).sort((a, b) => a.order - b.order) }));

// Default subjects and coefficients when the school hasn't set a class's own list yet.

/** A class's subjects with coefficients: [{ name, coef }]. */
export function classSubjects(cls) {
  if (cls?.subjects?.length) return cls.subjects;
  return defaultSubjects(cls);
}

/** Weighted average out of 20 of the subjects that have a mark, or null when none has. */
export function weightedAverage(marks, subjects) {
  let total = 0;
  let coefs = 0;
  for (const s of subjects) {
    const m = marks?.[s.name];
    if (m === '' || m === null || m === undefined || Number.isNaN(Number(m))) continue;
    total += Number(m) * (Number(s.coef) || 1);
    coefs += Number(s.coef) || 1;
  }
  return coefs ? Math.round((total / coefs) * 100) / 100 : null;
}

/** Comment printed beside a mark on the report card. */
export const markRemark = (m) => (m >= 18 ? 'Excellent' : m >= 16 ? 'Very good' : m >= 14 ? 'Good' : m >= 12 ? 'Fairly good' : m >= 10 ? 'Average' : m >= 8 ? 'Weak' : 'Poor');

export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** The two evaluation sequences of a term: First Term → 1 and 2, Second → 3 and 4, Third → 5 and 6. */
export function termSequences(sessions, termId) {
  for (const s of sessions || []) {
    const terms = [...(s.terms || [])].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const i = terms.findIndex((t) => t.id === termId);
    if (i >= 0) return [2 * i + 1, 2 * i + 2];
  }
  return [1, 2];
}

/**
 * Who may enter one subject's marks in one class: the teacher assigned that subject in that class;
 * the class teacher for the subjects of their class that no other teacher is assigned; and the proprietor
 * (super admin) to correct. Nobody else — so no teacher can change another teacher's marks.
 */
export function canEnterMarks(staffList, user, cls, subject) {
  if (user.role === 'superadmin') return true;
  if (user.role !== 'teacher' || !cls) return false;
  const assigned = (staffList || []).filter((s) => s.status !== 'left' && (s.teaching || []).some((t) => sameName(t.subject, subject) && (t.classIds || []).includes(cls.id)));
  if (assigned.some((s) => s.id === user.staffId)) return true;
  return !!cls.teacherId && cls.teacherId === user.staffId && assigned.length === 0;
}
