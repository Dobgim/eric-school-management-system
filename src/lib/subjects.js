// Subjects of the Cameroon nursery and primary curricula, offered as suggestions in the staff form.
export const SUBJECTS = [
  'English Language', 'French', 'Mathematics', 'Science and Technology', 'Social Studies', 'History', 'Geography',
  'Citizenship', 'National Languages and Cultures', 'ICT', 'Physical Education', 'Arts and Crafts', 'Music',
  'Religious Studies', 'Home Economics', 'Agriculture', 'Moral Education', 'Pre-reading', 'Pre-writing', 'Pre-maths',
];

/** "Mathematics: Class 5, Class 6" lines for a staff member's teaching assignments. */
export const teachingLines = (staff, classes) => (staff.teaching || [])
  .filter((t) => t.subject)
  .map((t) => ({ subject: t.subject, classes: classes.filter((c) => (t.classIds || []).includes(c.id)).sort((a, b) => a.order - b.order) }));
