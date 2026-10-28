// Weekly class timetables: periods (lessons and breaks) down the side, Monday to Friday across.
export const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday']];

export const DEFAULT_PERIODS = [
  { start: '08:00', end: '08:45', kind: 'lesson' }, { start: '08:45', end: '09:30', kind: 'lesson' }, { start: '09:30', end: '10:15', kind: 'lesson' },
  { start: '10:15', end: '10:45', kind: 'break', label: 'Break' },
  { start: '10:45', end: '11:30', kind: 'lesson' }, { start: '11:30', end: '12:15', kind: 'lesson' },
  { start: '12:15', end: '13:00', kind: 'break', label: 'Lunch' },
  { start: '13:00', end: '13:45', kind: 'lesson' }, { start: '13:45', end: '14:30', kind: 'lesson' },
];

export const timetableOf = (db, classId) => (db.timetables || []).find((t) => t.classId === classId) || { id: `tt-${classId}`, classId, periods: DEFAULT_PERIODS, cells: {} };
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Every lesson of one teacher across all classes: [{ day, period, classId, subject }]. */
export function teacherLessons(db, staffId) {
  const out = [];
  for (const tt of db.timetables || []) {
    for (const [key, cell] of Object.entries(tt.cells || {})) {
      if (cell?.teacherId !== staffId) continue;
      const [day, i] = key.split('-');
      const period = tt.periods?.[Number(i)];
      if (period) out.push({ day, period, classId: tt.classId, subject: cell.subject });
    }
  }
  return out.sort((a, b) => DAYS.findIndex(([d]) => d === a.day) - DAYS.findIndex(([d]) => d === b.day) || a.period.start.localeCompare(b.period.start));
}

/** Lessons in this timetable whose teacher is already teaching another class at that time. */
export function clashes(db, tt) {
  const out = [];
  for (const [key, cell] of Object.entries(tt.cells || {})) {
    if (!cell?.teacherId) continue;
    const [day, i] = key.split('-');
    const period = tt.periods?.[Number(i)];
    if (!period) continue;
    const other = teacherLessons({ ...db, timetables: (db.timetables || []).filter((t) => t.classId !== tt.classId) }, cell.teacherId)
      .find((l) => l.day === day && overlaps(l.period, period));
    if (other) out.push({ key, day, period, teacherId: cell.teacherId, otherClassId: other.classId });
  }
  return out;
}
