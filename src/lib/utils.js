export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Dates follow the chosen language (set by i18n.js); numbers keep the same grouping in both languages.
const LOCALE = () => (globalThis.__sisLang === 'fr' ? 'fr-FR' : 'en-GB');

export const money = (n, currency = 'XAF') =>
  `${Math.round(Number(n) || 0).toLocaleString('en-US')} ${currency}`;

export const num = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(LOCALE(), { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(LOCALE(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// Local calendar date (not UTC) so late-evening entries get the right day.
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => localDate();
export const thisMonth = () => localDate().slice(0, 7);

export const monthLabel = (ym) => {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE(), { month: 'long', year: 'numeric' });
};

export const age = (dob) => {
  if (!dob) return '—';
  const b = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
};

export const fullName = (p) => (p ? [p.firstName, p.otherNames, p.lastName].filter(Boolean).join(' ') : '—');

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export const byId = (list, id) => list.find((x) => x.id === id);

export const sum = (list, fn = (x) => x) => list.reduce((t, x) => t + (Number(fn(x)) || 0), 0);

export const groupBy = (list, fn) =>
  list.reduce((acc, x) => {
    const k = fn(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {});

export const pad = (n, len = 4) => String(n).padStart(len, '0');

export const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export async function hashPassword(pw) {
  const data = new TextEncoder().encode(`sis::${pw}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'mtn', label: 'MTN Mobile Money' },
  { id: 'orange', label: 'Orange Money' },
  { id: 'bank', label: 'Bank Transfer' },
];
export const methodLabel = (id) => PAYMENT_METHODS.find((m) => m.id === id)?.label || id;

export const FEE_TYPES = [
  { id: 'registration', label: 'Registration' },
  { id: 'tuition', label: 'Tuition' },
  { id: 'exam', label: 'Examination' },
  { id: 'pta', label: 'PTA Levy' },
  { id: 'activity', label: 'Activity / Sports' },
];
export const feeTypeLabel = (id) => FEE_TYPES.find((f) => f.id === id)?.label || id;

export const ROLES = {
  superadmin: 'Super Admin / Proprietor',
  admin: 'Admin / Secretary',
  bursar: 'Bursar / Accountant',
  teacher: 'Teacher',
  staff: 'Staff (general)',
  parent: 'Parent / Guardian',
};

export const REQUIRED_DOCS = ['Birth Certificate', 'Medical Certificate', 'Passport Photograph'];
export const OPTIONAL_DOCS = ['Previous School Report', 'Transfer Certificate', 'Vaccination Card', 'Other'];

export const STUDENT_STATUS = {
  active: ['green', 'Active'],
  graduated: ['blue', 'Graduated'],
  transferred: ['purple', 'Transferred'],
  withdrawn: ['slate', 'Withdrawn'],
};
