// School levels and ready-made class lists, for nursery, primary and secondary schools in both of Cameroon's
// sub-systems (English-speaking and French-speaking). Each class carries its own subjects with coefficients,
// which the school then adjusts under Academics → Subjects by class.

export const LEVELS = [
  { id: 'nursery', label: 'Nursery', tone: 'purple' },
  { id: 'primary', label: 'Primary', tone: 'blue' },
  { id: 'secondary', label: 'Secondary', tone: 'green' },
];
export const levelLabel = (id) => LEVELS.find((l) => l.id === id)?.label || 'Primary';
export const levelTone = (id) => LEVELS.find((l) => l.id === id)?.tone || 'blue';

const s = (list) => list.map(([name, coef]) => ({ name, coef }));

// English-speaking sub-system
const EN_NURSERY = s([['Pre-reading', 1], ['Pre-writing', 1], ['Pre-maths', 1], ['Rhymes and Songs', 1], ['Arts and Crafts', 1], ['Physical Education', 1], ['Social Habits', 1]]);
const EN_PRIMARY = s([['English Language', 2], ['French', 2], ['Mathematics', 2], ['Science and Technology', 1], ['Social Studies', 1], ['Citizenship', 1], ['National Languages and Cultures', 1], ['ICT', 1], ['Physical Education', 1], ['Arts and Crafts', 1]]);
const EN_FORMS = s([['English Language', 3], ['French', 3], ['Mathematics', 4], ['Biology', 2], ['Chemistry', 2], ['Physics', 2], ['Geography', 2], ['History', 2], ['Economics', 2], ['Literature in English', 2], ['Computer Science', 2], ['Citizenship', 1], ['Religious Studies', 1], ['Physical Education', 1]]);
const EN_SIXTH = s([['English Language', 2], ['French', 2], ['Mathematics', 4], ['Further Mathematics', 3], ['Physics', 4], ['Chemistry', 4], ['Biology', 4], ['Economics', 3], ['Geography', 3], ['History', 3], ['Literature in English', 3], ['Computer Science', 3], ['Religious Studies', 1], ['Physical Education', 1]]);

// French-speaking sub-system
const FR_NURSERY = s([['Langage', 1], ['Graphisme', 1], ['Pré-calcul', 1], ['Éveil scientifique', 1], ['Chants et comptines', 1], ['Arts plastiques', 1], ['Éducation physique', 1]]);
const FR_PRIMARY = s([['Français', 2], ['Anglais', 2], ['Mathématiques', 2], ['Sciences et technologie', 1], ['Histoire', 1], ['Géographie', 1], ['Éducation civique et morale', 1], ['Langues et cultures nationales', 1], ['Informatique', 1], ['Éducation physique et sportive', 1], ['Arts plastiques', 1]]);
const FR_FIRST_CYCLE = s([['Français', 4], ['Anglais', 3], ['Mathématiques', 4], ['Sciences de la vie et de la terre', 2], ['Physique-chimie-technologie', 2], ['Histoire', 2], ['Géographie', 2], ['Éducation à la citoyenneté et à la morale', 1], ['Informatique', 2], ['Langues et cultures nationales', 1], ['Allemand / Espagnol', 2], ['Éducation physique et sportive', 1]]);
const FR_SECOND_CYCLE = s([['Français', 3], ['Anglais', 2], ['Philosophie', 2], ['Mathématiques', 4], ['Physique', 3], ['Chimie', 3], ['Sciences de la vie et de la terre', 3], ['Histoire', 2], ['Géographie', 2], ['Éducation à la citoyenneté et à la morale', 1], ['Informatique', 2], ['Allemand / Espagnol', 2], ['Éducation physique et sportive', 1]]);

/** Ready-made classes: [name, subjects]. */
export const PRESETS = {
  en: {
    nursery: [['Pre-Nursery', EN_NURSERY], ['Nursery 1', EN_NURSERY], ['Nursery 2', EN_NURSERY]],
    primary: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'].map((n) => [n, EN_PRIMARY]),
    secondary: [...['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5'].map((n) => [n, EN_FORMS]), ['Lower Sixth', EN_SIXTH], ['Upper Sixth', EN_SIXTH]],
  },
  fr: {
    nursery: [['Petite section', FR_NURSERY], ['Moyenne section', FR_NURSERY], ['Grande section', FR_NURSERY]],
    primary: ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].map((n) => [n, FR_PRIMARY]),
    secondary: [...['6e', '5e', '4e', '3e'].map((n) => [n, FR_FIRST_CYCLE]), ...['2nde', '1ère', 'Terminale'].map((n) => [n, FR_SECOND_CYCLE])],
  },
};

/** Default subjects for a class that has none of its own yet, from its level and name. */
export function defaultSubjects(cls) {
  const name = `${cls?.name || ''}`;
  const fr = cls?.subsystem === 'fr' || /^(petite|moyenne|grande) section|^(sil|cp|ce1|ce2|cm1|cm2|6e|5e|4e|3e|2nde|1(è|e)re|terminale|tle)\b/i.test(name);
  const level = cls?.level || (/nursery|section/i.test(name) ? 'nursery' : /form|sixth|^(6e|5e|4e|3e|2nde|1(è|e)re|terminale|tle)/i.test(name) ? 'secondary' : 'primary');
  if (level === 'nursery') return fr ? FR_NURSERY : EN_NURSERY;
  if (level === 'secondary') {
    if (fr) return /^(2nde|1(è|e)re|terminale|tle)/i.test(name) ? FR_SECOND_CYCLE : FR_FIRST_CYCLE;
    return /sixth/i.test(name) ? EN_SIXTH : EN_FORMS;
  }
  return fr ? FR_PRIMARY : EN_PRIMARY;
}

/** Every subject name used by the presets (suggestions when editing subjects). */
export const ALL_SUBJECTS = [...new Set([EN_NURSERY, EN_PRIMARY, EN_FORMS, EN_SIXTH, FR_NURSERY, FR_PRIMARY, FR_FIRST_CYCLE, FR_SECOND_CYCLE].flat().map((x) => x.name))];
