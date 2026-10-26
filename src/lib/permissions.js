// Permission keys per role. Super admin implicitly has everything.
const MATRIX = {
  admin: [
    'dashboard', 'school.view', 'school.edit', 'calendar.edit',
    'students.view', 'students.edit', 'guardians.edit', 'promotion', 'academics.edit',
    'staff.view', 'staff.edit', 'announcements.edit', 'reports.academic',
  ],
  bursar: [
    'dashboard', 'school.view', 'students.view',
    'fees.view', 'fees.collect', 'fees.setup', 'staff.view', 'payroll', 'inventory',
    'reports.financial', 'reports.academic',
  ],
  teacher: ['myclass', 'academics.edit', 'school.view'],
  parent: ['portal'],
};

export function can(user, perm) {
  if (!user) return false;
  if (user.role === 'superadmin') return perm !== 'portal' && perm !== 'myclass';
  return (MATRIX[user.role] || []).includes(perm);
}

export function homePath(user) {
  if (!user) return '/login';
  if (user.role === 'parent') return '/portal';
  if (user.role === 'teacher') return '/my-class';
  return '/';
}
