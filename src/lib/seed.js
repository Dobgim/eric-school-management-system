import { hashPassword, pad } from './utils';

// Deterministic PRNG so the demo data is identical on every fresh install.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const FIRST_M = ['Junior', 'Brandon', 'Emmanuel', 'Ryan', 'Kelvin', 'Ethan', 'Prince', 'Daniel', 'Joel', 'Samuel', 'Ivan', 'Nathan', 'Godwill', 'Blessing', 'Clinton', 'Derick', 'Wilfried', 'Loic', 'Aurel', 'Franck', 'Joshua', 'Elvis', 'Bryan', 'Caleb'];
const FIRST_F = ['Precious', 'Mercy', 'Gloria', 'Brenda', 'Ange', 'Diane', 'Esther', 'Faith', 'Grace', 'Joy', 'Larissa', 'Michelle', 'Naomi', 'Princess', 'Ruth', 'Sandra', 'Tracy', 'Vanessa', 'Winnie', 'Yvette', 'Cynthia', 'Mirabel', 'Peace', 'Favour'];
const SURNAMES = ['Tabi', 'Ngwa', 'Fon', 'Nkwenti', 'Ebai', 'Tanyi', 'Mbah', 'Ndip', 'Ayuk', 'Che', 'Fru', 'Akwa', 'Enow', 'Nji', 'Tambe', 'Mukete', 'Eyong', 'Besong', 'Atanga', 'Ngu', 'Ndi', 'Fomba', 'Nchinda', 'Bate', 'Kum', 'Wirba', 'Asong', 'Nfor', 'Mokoko', 'Nana'];
const OCCUPATIONS = ['Teacher', 'Trader', 'Nurse', 'Civil Servant', 'Farmer', 'Engineer', 'Business Owner', 'Driver', 'Accountant', 'Tailor', 'Mechanic', 'Banker', 'Pastor', 'Police Officer'];
const QUARTERS = ['Molyko', 'Bonduma', 'Mile 16', 'Mile 17', 'Bokwai', 'Great Soppo', 'Small Soppo', 'Muea', 'Bomaka', 'Check Point'];

export const PREFIX = 'BFS';

export async function buildSeed() {
  const r = rng(237);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (a, b) => Math.floor(a + r() * (b - a + 1));
  const dateBetween = (from, to) => {
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    return new Date(a + r() * (b - a)).toISOString().slice(0, 10);
  };
  const phone = () => `6${pick(['7', '5', '9', '8', '2'])}${between(0, 9)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`;

  const school = {
    name: 'Bright Future Nursery & Primary School',
    shortName: 'Bright Future School',
    motto: 'Learning Today, Leading Tomorrow',
    logo: '',
    address: 'P.O. Box 412, Mile 17, Buea',
    region: 'South West Region, Cameroon',
    phone: '+237 677 12 34 56',
    altPhone: '+237 699 65 43 21',
    email: 'info@brightfutureschool.cm',
    website: 'www.brightfutureschool.cm',
    whatsapp: '+237 677 12 34 56',
    founded: '2012',
    authorization: 'MINEDUB/SWR/2012/0418',
    currency: 'XAF',
    regPrefix: PREFIX,
  };

  const sessions = [
    {
      id: 's2526', name: '2025/2026', start: '2025-09-08', end: '2026-07-03',
      terms: [
        { id: 's2526-t1', name: 'First Term', start: '2025-09-08', end: '2025-12-12' },
        { id: 's2526-t2', name: 'Second Term', start: '2026-01-05', end: '2026-03-27' },
        { id: 's2526-t3', name: 'Third Term', start: '2026-04-13', end: '2026-07-03' },
      ],
    },
    {
      id: 's2627', name: '2026/2027', start: '2026-09-07', end: '2027-07-02',
      terms: [
        { id: 's2627-t1', name: 'First Term', start: '2026-09-07', end: '2026-12-11' },
        { id: 's2627-t2', name: 'Second Term', start: '2027-01-04', end: '2027-03-26' },
        { id: 's2627-t3', name: 'Third Term', start: '2027-04-12', end: '2027-07-02' },
      ],
    },
  ];

  const facilities = [
    ...['Pre-Nursery', 'Nursery 1', 'Nursery 2'].map((n, i) => ({ id: `f-n${i}`, name: `${n} Classroom`, type: 'Classroom', block: 'Nursery Block', capacity: 25, condition: 'Good', notes: '' })),
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `f-c${n}`, name: `Class ${n} Classroom`, type: 'Classroom', block: n <= 3 ? 'Block A' : 'Block B', capacity: 40, condition: n === 5 ? 'Needs repair' : 'Good', notes: n === 5 ? 'Two windows broken, roof leak near the door.' : '' })),
    { id: 'f-lib', name: 'Library', type: 'Library', block: 'Block A', capacity: 30, condition: 'Good', notes: '1,200 books' },
    { id: 'f-ict', name: 'ICT Room', type: 'Laboratory', block: 'Block B', capacity: 20, condition: 'Good', notes: '12 desktop computers' },
    { id: 'f-off', name: 'Administration Office', type: 'Office', block: 'Admin Block', capacity: 6, condition: 'Good', notes: '' },
    { id: 'f-stf', name: 'Staff Room', type: 'Office', block: 'Admin Block', capacity: 20, condition: 'Good', notes: '' },
    { id: 'f-hall', name: 'Multipurpose Hall', type: 'Hall', block: 'Main', capacity: 250, condition: 'Fair', notes: 'Used for assemblies and PTA meetings' },
    { id: 'f-play', name: 'Playground', type: 'Playground', block: 'Main', capacity: 300, condition: 'Good', notes: '' },
    { id: 'f-sick', name: 'Sick Bay', type: 'Health', block: 'Admin Block', capacity: 4, condition: 'Good', notes: '' },
    { id: 'f-store', name: 'Store', type: 'Store', block: 'Admin Block', capacity: 0, condition: 'Good', notes: 'Uniforms and books' },
    { id: 'f-wc', name: 'Toilets (Boys & Girls)', type: 'Sanitation', block: 'Main', capacity: 16, condition: 'Fair', notes: '8 cubicles each' },
  ];

  const classDefs = [
    ['Pre-Nursery', 'nursery'], ['Nursery 1', 'nursery'], ['Nursery 2', 'nursery'],
    ['Class 1', 'primary'], ['Class 2', 'primary'], ['Class 3', 'primary'], ['Class 4', 'primary'], ['Class 5', 'primary'], ['Class 6', 'primary'],
  ];
  const classes = classDefs.map(([name, level], i) => ({
    id: `c${i}`, name, level, order: i, capacity: level === 'nursery' ? 25 : 40,
    facilityId: i < 3 ? `f-n${i}` : `f-c${i - 2}`, teacherId: null, section: 'A',
  }));

  // ---- Staff ----
  const salaryScales = [
    { id: 'g1', name: 'Grade I – Head', basic: 220000, housing: 40000, transport: 20000 },
    { id: 'g2', name: 'Grade II – Senior Teacher', basic: 120000, housing: 20000, transport: 15000 },
    { id: 'g3', name: 'Grade III – Teacher', basic: 90000, housing: 15000, transport: 10000 },
    { id: 'g4', name: 'Grade IV – Assistant', basic: 65000, housing: 10000, transport: 10000 },
    { id: 'g5', name: 'Grade V – Support Staff', basic: 50000, housing: 5000, transport: 5000 },
    { id: 'g6', name: 'Grade A – Administration', basic: 140000, housing: 25000, transport: 15000 },
  ];
  const staffDefs = [
    ['Eric', 'Tanyi', 'M', 'teaching', 'Head Teacher', 'g1', null, 'Grade I Teacher (CAPIEMP), B.Ed'],
    ['Comfort', 'Enow', 'F', 'teaching', 'Class Teacher', 'g3', 0, 'CAPIEMP'],
    ['Lydia', 'Ngwa', 'F', 'teaching', 'Class Teacher', 'g3', 1, 'CAPIEMP'],
    ['Beatrice', 'Fon', 'F', 'teaching', 'Class Teacher', 'g3', 2, 'CAPIEMP'],
    ['Patience', 'Ayuk', 'F', 'teaching', 'Class Teacher', 'g3', 3, 'CAPIEMP'],
    ['Stephen', 'Mbah', 'M', 'teaching', 'Class Teacher', 'g3', 4, 'CAPIEMP, HND'],
    ['Grace', 'Nkwenti', 'F', 'teaching', 'Class Teacher', 'g2', 5, 'CAPIEMP, B.Ed'],
    ['Peter', 'Eyong', 'M', 'teaching', 'Class Teacher', 'g2', 6, 'CAPIEMP, B.Sc'],
    ['Agnes', 'Tambe', 'F', 'teaching', 'Class Teacher', 'g2', 7, 'CAPIEMP, B.Ed'],
    ['Collins', 'Besong', 'M', 'teaching', 'Class Teacher', 'g2', 8, 'CAPIEMP, B.Ed'],
    ['Delphine', 'Nji', 'F', 'teaching', 'ICT / French Teacher', 'g3', null, 'B.Sc Computer Science'],
    ['Florence', 'Che', 'F', 'non-teaching', 'Nursery Assistant', 'g4', null, 'GCE A Level'],
    ['Martha', 'Fru', 'F', 'non-teaching', 'Bursar', 'g6', null, 'HND Accounting'],
    ['Rita', 'Ebai', 'F', 'non-teaching', 'Secretary', 'g6', null, 'HND Secretarial Studies'],
    ['Paul', 'Akwa', 'M', 'non-teaching', 'Security Guard', 'g5', null, 'FSLC'],
    ['Juliana', 'Ndip', 'F', 'non-teaching', 'Cook / Cleaner', 'g5', null, 'FSLC'],
  ];
  const staff = staffDefs.map(([firstName, lastName, gender, category, position, gradeId, classIdx, qualification], i) => ({
    id: `st${i + 1}`,
    staffNo: `${PREFIX}-STF-${pad(i + 1, 3)}`,
    firstName, lastName, gender, category, position, gradeId, qualification,
    phone: phone(),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@brightfutureschool.cm`,
    dateEmployed: dateBetween('2013-09-01', '2024-09-01'),
    dob: dateBetween('1975-01-01', '1998-12-31'),
    address: `${pick(QUARTERS)}, Buea`,
    bankName: i % 3 === 0 ? 'Afriland First Bank' : i % 3 === 1 ? 'MTN Mobile Money' : 'CCA Bank',
    accountNo: i % 3 === 1 ? '' : `100${between(10000000, 99999999)}`,
    momoNumber: phone(),
    classId: classIdx === null ? null : `c${classIdx}`,
    status: 'active',
    photo: '',
  }));
  staff.forEach((s) => { if (s.classId) classes.find((c) => c.id === s.classId).teacherId = s.id; });

  // ---- Guardians & students ----
  const guardians = [];
  const students = [];
  let regSeq = 0;
  const regNo = (year) => `${PREFIX}/${year}/${pad(++regSeq)}`;
  const classCounts = [12, 15, 16, 18, 17, 16, 15, 14, 13];

  // Build families first, then hand out children to class slots.
  const slots = [];
  classCounts.forEach((n, ci) => { for (let k = 0; k < n; k++) slots.push(ci); });
  slots.sort(() => r() - 0.5);

  while (slots.length) {
    const surname = pick(SURNAMES);
    const gId = `g${guardians.length + 1}`;
    const isMother = r() < 0.45;
    const gFirst = isMother ? pick(['Mary', 'Elizabeth', 'Bridget', 'Christiana', 'Judith', 'Odette', 'Pauline', 'Susan', 'Hilda']) : pick(['John', 'Peter', 'Francis', 'Martin', 'George', 'Ernest', 'Simon', 'Divine', 'Felix']);
    guardians.push({
      id: gId,
      name: `${isMother ? 'Mrs.' : 'Mr.'} ${gFirst} ${surname}`,
      relationship: isMother ? 'Mother' : 'Father',
      phone: phone(), altPhone: r() < 0.5 ? phone() : '',
      email: r() < 0.6 ? `${gFirst.toLowerCase()}${surname.toLowerCase()}@gmail.com` : '',
      occupation: pick(OCCUPATIONS),
      address: `${pick(QUARTERS)}, Buea`,
    });
    const kids = r() < 0.6 ? 1 : r() < 0.8 ? 2 : 3;
    for (let k = 0; k < kids && slots.length; k++) {
      const ci = slots.pop();
      const gender = r() < 0.5 ? 'M' : 'F';
      const birthYear = 2026 - (2 + ci) - 1 + (r() < 0.3 ? -1 : 0);
      const isNew = ci === 0 || r() < 0.12;
      const admittedYear = isNew ? 2026 : 2026 - between(1, Math.min(ci, 5));
      const sessionAdmitted = isNew ? 's2627' : 's2526';
      const enrollments = { s2627: `c${ci}` };
      if (!isNew) enrollments.s2526 = `c${Math.max(0, ci - 1)}`;
      students.push({
        id: `p${students.length + 1}`,
        regNo: regNo(admittedYear),
        firstName: gender === 'M' ? pick(FIRST_M) : pick(FIRST_F),
        otherNames: r() < 0.4 ? pick(gender === 'M' ? FIRST_M : FIRST_F) : '',
        lastName: surname,
        gender,
        dob: dateBetween(`${birthYear}-01-01`, `${birthYear}-12-31`),
        placeOfBirth: pick(['Buea', 'Limbe', 'Kumba', 'Bamenda', 'Douala', 'Yaoundé', 'Tiko']),
        nationality: 'Cameroonian',
        religion: pick(['Christian', 'Christian', 'Christian', 'Muslim']),
        bloodGroup: pick(['O+', 'O+', 'A+', 'B+', 'AB+', 'O-', '']),
        allergies: r() < 0.08 ? pick(['Peanuts', 'Penicillin', 'Dust']) : '',
        medicalNotes: r() < 0.05 ? 'Asthmatic — inhaler kept in sick bay' : '',
        address: guardians.at(-1).address,
        classId: `c${ci}`,
        category: r() < 0.06 ? 'staffchild' : r() < 0.04 ? 'scholarship' : 'regular',
        admissionDate: isNew ? dateBetween('2026-07-01', '2026-09-10') : `${admittedYear}-09-0${between(1, 9)}`,
        sessionAdmitted,
        isNew,
        enrollments,
        status: 'active',
        guardianIds: [gId],
        photo: '',
        documents: [
          { id: `d${students.length}a`, name: 'Birth Certificate', fileName: 'birth_certificate.pdf', size: 184000, uploadedAt: '2026-08-20T10:00:00Z', verified: true, dataUrl: '' },
          ...(r() < 0.85 ? [{ id: `d${students.length}p`, name: 'Passport Photograph', fileName: 'passport.jpg', size: 64000, uploadedAt: '2026-08-20T10:02:00Z', verified: true, dataUrl: '' }] : []),
          ...(r() < 0.8 ? [{ id: `d${students.length}b`, name: 'Medical Certificate', fileName: 'medical.pdf', size: 92000, uploadedAt: '2026-08-20T10:05:00Z', verified: r() < 0.7, dataUrl: '' }] : []),
          ...(ci > 3 && r() < 0.5 ? [{ id: `d${students.length}c`, name: 'Previous School Report', fileName: 'report_card.pdf', size: 240000, uploadedAt: '2026-08-21T09:00:00Z', verified: true, dataUrl: '' }] : []),
        ],
        history: [
          ...(isNew ? [] : [{ sessionId: 's2526', classId: enrollments.s2526, action: 'enrolled', date: '2025-09-08' }]),
          ...(isNew
            ? [{ sessionId: 's2627', classId: `c${ci}`, action: 'admitted', date: '2026-09-07' }]
            : [{ sessionId: 's2627', classId: `c${ci}`, action: ci > 0 && enrollments.s2526 !== `c${ci}` ? 'promoted' : 'repeated', date: '2026-07-10' }]),
        ],
      });
    }
  }

  // Last year's Class 6 leavers, plus two transfers.
  for (let k = 0; k < 11; k++) {
    const gender = r() < 0.5 ? 'M' : 'F';
    const surname = pick(SURNAMES);
    const gId = `g${guardians.length + 1}`;
    guardians.push({ id: gId, name: `Mr. ${pick(['Henry', 'Moses', 'Isaac'])} ${surname}`, relationship: 'Father', phone: phone(), altPhone: '', email: '', occupation: pick(OCCUPATIONS), address: `${pick(QUARTERS)}, Buea` });
    const transferred = k >= 9;
    students.push({
      id: `p${students.length + 1}`, regNo: regNo(2020 + (k % 3)),
      firstName: gender === 'M' ? pick(FIRST_M) : pick(FIRST_F), otherNames: '', lastName: surname, gender,
      dob: dateBetween('2014-01-01', '2014-12-31'), placeOfBirth: 'Buea', nationality: 'Cameroonian', religion: 'Christian',
      bloodGroup: '', allergies: '', medicalNotes: '', address: guardians.at(-1).address,
      classId: transferred ? 'c7' : 'c8', category: 'regular', admissionDate: '2020-09-07', sessionAdmitted: 's2526', isNew: false,
      enrollments: { s2526: transferred ? 'c7' : 'c8' },
      status: transferred ? 'transferred' : 'graduated',
      exitDate: transferred ? '2026-04-02' : '2026-07-03',
      exitNote: transferred ? 'Family relocated to Douala — transferred to GBPS Bonamoussadi' : 'Passed FSLC & Common Entrance',
      guardianIds: [gId], photo: '', documents: [],
      history: [
        { sessionId: 's2526', classId: transferred ? 'c7' : 'c8', action: 'enrolled', date: '2025-09-08' },
        { sessionId: 's2526', classId: transferred ? 'c7' : 'c8', action: transferred ? 'transferred' : 'graduated', date: transferred ? '2026-04-02' : '2026-07-03' },
      ],
    });
  }

  // ---- Fee structure (per session, term, class and fee type) ----
  const tuitionFor = (ci) => (ci < 3 ? 45000 : ci < 6 ? 55000 : 65000);
  const feeItems = [];
  for (const s of sessions) {
    const bump = s.id === 's2627' ? 5000 : 0;
    s.terms.forEach((t, ti) => {
      classes.forEach((c, ci) => {
        const add = (feeType, amount, appliesTo = 'all') => feeItems.push({ id: `fi-${t.id}-${c.id}-${feeType}`, sessionId: s.id, termId: t.id, classId: c.id, feeType, amount, appliesTo });
        add('tuition', tuitionFor(ci) + bump);
        add('exam', ci === 8 && ti === 2 ? 15000 : 5000);
        add('activity', 5000);
        if (ti === 0) {
          add('registration', 15000, 'new');
          add('pta', 10000);
        }
      });
    });
  }
  const categories = [
    { id: 'regular', name: 'Regular', tuitionDiscount: 0 },
    { id: 'staffchild', name: 'Staff Child', tuitionDiscount: 50 },
    { id: 'scholarship', name: 'Scholarship', tuitionDiscount: 100 },
  ];

  // ---- Payments ----
  const payments = [];
  let receiptSeq = 0;
  const methods = ['cash', 'cash', 'mtn', 'mtn', 'orange', 'bank'];
  const billFor = (st, termId) => {
    const term = sessions.flatMap((s) => s.terms.map((t) => ({ ...t, sessionId: s.id }))).find((t) => t.id === termId);
    const classId = st.enrollments[term.sessionId];
    if (!classId) return 0;
    const disc = categories.find((c) => c.id === st.category).tuitionDiscount;
    return feeItems
      .filter((f) => f.termId === termId && f.classId === classId && (f.appliesTo === 'all' || (st.isNew && st.sessionAdmitted === term.sessionId)))
      .reduce((t, f) => t + (f.feeType === 'tuition' ? f.amount * (1 - disc / 100) : f.amount), 0);
  };
  const pay = (st, termId, amount, from, to, sessionId) => {
    if (amount <= 0) return;
    const method = pick(methods);
    const date = dateBetween(from, to);
    payments.push({
      id: `pay${payments.length + 1}`,
      receiptNo: `RCT-${date.slice(0, 4)}-${pad(++receiptSeq, 5)}`,
      studentId: st.id, sessionId, termId, date, amount: Math.round(amount / 500) * 500, method,
      reference: method === 'cash' ? '' : method === 'bank' ? `AFB${between(100000, 999999)}` : `MP${between(100000000, 999999999)}`,
      receivedBy: 'u3', note: '',
    });
  };
  for (const st of students) {
    // last session — most fully paid, some leave arrears
    if (st.enrollments.s2526) {
      for (const t of sessions[0].terms) {
        if (st.status === 'transferred' && t.id === 's2526-t3') continue;
        const bill = billFor(st, t.id);
        const ratio = r() < 0.86 ? 1 : 0.4 + r() * 0.4;
        const total = bill * ratio;
        if (r() < 0.5) { pay(st, t.id, total * 0.6, t.start, t.end, 's2526'); pay(st, t.id, total * 0.4, t.start, t.end, 's2526'); } else pay(st, t.id, total, t.start, t.end, 's2526');
      }
    }
    if (st.status !== 'active') continue;
    const bill = billFor(st, 's2627-t1');
    const roll = r();
    if (roll < 0.42) { pay(st, 's2627-t1', bill * 0.5, '2026-08-25', '2026-09-15', 's2627'); pay(st, 's2627-t1', bill * 0.5, '2026-09-16', '2026-10-24', 's2627'); }
    else if (roll < 0.78) pay(st, 's2627-t1', bill * (0.3 + r() * 0.5), '2026-08-25', '2026-10-24', 's2627');
    else if (roll < 0.9) pay(st, 's2627-t1', bill * 0.15, '2026-09-01', '2026-10-20', 's2627');
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));
  payments.forEach((p, i) => { p.receiptNo = `RCT-${p.date.slice(0, 4)}-${pad(i + 1, 5)}`; });
  receiptSeq = payments.length;

  // ---- Payroll ----
  const salaryAdjustments = [
    { id: 'adj1', staffId: 'st5', month: '2026-10', type: 'advance', amount: 30000, reason: 'Salary advance — medical bill' },
    { id: 'adj2', staffId: 'st15', month: '2026-10', type: 'advance', amount: 15000, reason: 'Salary advance' },
    { id: 'adj3', staffId: 'st7', month: '2026-10', type: 'bonus', amount: 20000, reason: 'Best Class Teacher — September' },
    { id: 'adj4', staffId: 'st11', month: '2026-10', type: 'deduction', amount: 5000, reason: 'Lateness (5 days)' },
    { id: 'adj5', staffId: 'st2', month: '2026-09', type: 'bonus', amount: 10000, reason: 'Back-to-school orientation' },
  ];
  const settings = {
    cnpsRate: 4.2,
    lowStockDefault: 10,
    currentSessionId: 's2627',
    currentTermId: 's2627-t1',
    counters: { reg: regSeq, receipt: receiptSeq, staff: staff.length, sale: 0 },
  };
  const payrollRuns = [];
  const runFor = (month, status, paidRatio = 1) => {
    const items = staff.map((s) => {
      const g = salaryScales.find((x) => x.id === s.gradeId);
      const adj = salaryAdjustments.filter((a) => a.staffId === s.id && a.month === month);
      const bonus = adj.filter((a) => a.type === 'bonus').reduce((t, a) => t + a.amount, 0);
      const advance = adj.filter((a) => a.type === 'advance').reduce((t, a) => t + a.amount, 0);
      const other = adj.filter((a) => a.type === 'deduction').reduce((t, a) => t + a.amount, 0);
      const cnps = Math.round((g.basic * settings.cnpsRate) / 100);
      const gross = g.basic + g.housing + g.transport + bonus;
      const isPaid = status === 'paid' || r() < paidRatio;
      return {
        staffId: s.id, basic: g.basic, housing: g.housing, transport: g.transport, bonus, advance, cnps, otherDeductions: other,
        gross, net: gross - advance - cnps - other,
        paid: isPaid, paidDate: isPaid ? `${month}-${status === 'paid' ? '28' : '25'}` : null,
        method: s.bankName === 'MTN Mobile Money' ? 'mtn' : s.accountNo ? 'bank' : 'cash',
      };
    });
    payrollRuns.push({ id: `pr-${month}`, month, status, createdAt: `${month}-24T09:00:00Z`, items });
  };
  ['2026-06', '2026-07', '2026-08', '2026-09'].forEach((m) => runFor(m, 'paid'));
  runFor('2026-10', 'approved', 0.55);

  // ---- Inventory ----
  const inv = [];
  const item = (name, category, size, classLevel, costPrice, sellPrice, quantity, reorderLevel) =>
    inv.push({ id: `it${inv.length + 1}`, sku: `${category.slice(0, 3).toUpperCase()}-${pad(inv.length + 1, 3)}`, name, category, size, classLevel, costPrice, sellPrice, quantity, reorderLevel });
  ['S', 'M', 'L'].forEach((sz, i) => item('Nursery Uniform (Dress/Shorts set)', 'Uniform', sz, 'nursery', 4500, 6500, [18, 9, 6][i], 8));
  ['S', 'M', 'L', 'XL'].forEach((sz, i) => item('Primary Uniform (Shirt + Skirt/Trousers)', 'Uniform', sz, 'primary', 6000, 8500, [22, 30, 14, 4][i], 10));
  ['S', 'M', 'L'].forEach((sz, i) => item('Sports Wear (T-shirt + Shorts)', 'Uniform', sz, 'all', 3500, 5000, [25, 7, 12][i], 10));
  item('School Sweater', 'Uniform', 'M', 'all', 4000, 6000, 16, 8);
  item('School Bag (branded)', 'Material', '—', 'all', 3500, 5500, 20, 5);
  item('Exercise Books (pack of 10)', 'Stationery', '—', 'all', 2200, 3000, 64, 20);
  item('Crayons & Drawing Set', 'Stationery', '—', 'nursery', 900, 1500, 3, 10);
  item('Nursery Reader Pack', 'Book', '—', 'c1', 7000, 9500, 12, 5);
  item('Primary English Course Book', 'Book', '—', 'primary', 3500, 4500, 40, 10);
  item('Primary Mathematics Book', 'Book', '—', 'primary', 3500, 4500, 8, 10);
  item('Basic Science & Technology', 'Book', '—', 'primary', 3000, 4000, 26, 10);
  item('Mon Livre de Français', 'Book', '—', 'primary', 3200, 4200, 19, 10);
  item('Common Entrance Past Questions', 'Book', '—', 'c8', 2500, 3500, 15, 5);

  const stockMovements = inv.map((it, i) => ({ id: `sm${i + 1}`, itemId: it.id, type: 'in', qty: it.quantity + 20, unitCost: it.costPrice, date: '2026-08-15', note: 'Opening stock for 2026/2027', by: 'u3' }));
  const sales = [];
  const active = students.filter((s) => s.status === 'active');
  for (let k = 0; k < 46; k++) {
    const st = pick(active);
    const level = classes.find((c) => c.id === st.classId).level;
    const options = inv.filter((it) => it.classLevel === 'all' || it.classLevel === level || it.classLevel === st.classId);
    const lines = [];
    const n = between(1, 3);
    for (let j = 0; j < n; j++) {
      const it = pick(options);
      if (lines.some((l) => l.itemId === it.id)) continue;
      lines.push({ itemId: it.id, name: `${it.name}${it.size !== '—' ? ` (${it.size})` : ''}`, qty: it.category === 'Uniform' ? between(1, 2) : 1, price: it.sellPrice });
    }
    const date = dateBetween('2026-08-25', '2026-10-24');
    const saleId = `sl${k + 1}`;
    sales.push({ id: saleId, saleNo: `SAL-${pad(k + 1, 5)}`, studentId: st.id, date, items: lines, total: lines.reduce((t, l) => t + l.qty * l.price, 0), method: pick(['cash', 'cash', 'mtn', 'orange']), by: 'u3' });
    lines.forEach((l) => stockMovements.push({ id: `sm${stockMovements.length + 1}`, itemId: l.itemId, type: 'sale', qty: l.qty, unitCost: inv.find((x) => x.id === l.itemId).costPrice, date, note: `Sale SAL-${pad(k + 1, 5)}`, by: 'u3', saleId }));
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));
  // Recompute balances so opening stock − sales = quantity on hand.
  inv.forEach((it) => {
    const sold = stockMovements.filter((m) => m.itemId === it.id && m.type === 'sale').reduce((t, m) => t + m.qty, 0);
    stockMovements.find((m) => m.itemId === it.id && m.type === 'in').qty = it.quantity + sold;
  });
  settings.counters.sale = sales.length;

  // ---- Academic records (term averages out of 20) ----
  const academicRecords = [];
  for (const t of sessions[0].terms) {
    for (const c of classes) {
      const group = students.filter((s) => s.enrollments.s2526 === c.id && !(s.status === 'transferred' && t.id === 's2526-t3'));
      const scored = group.map((s) => ({ s, avg: Math.round((9 + r() * 9.5) * 100) / 100 })).sort((a, b) => b.avg - a.avg);
      scored.forEach(({ s, avg }, i) => academicRecords.push({
        id: `ar-${t.id}-${s.id}`, studentId: s.id, sessionId: 's2526', termId: t.id, classId: c.id,
        average: avg, position: i + 1, outOf: scored.length,
        conduct: avg > 15 ? 'Excellent' : avg > 12 ? 'Very Good' : avg > 10 ? 'Good' : 'Fair',
        remark: avg >= 16 ? 'Outstanding performance, keep it up.' : avg >= 12 ? 'Good work. Can do better.' : avg >= 10 ? 'Average. Needs more effort.' : 'Weak. Needs close follow-up at home.',
        attendance: between(55, 64), daysOpen: 64,
      }));
    }
  }

  // ---- Calendar & announcements ----
  const calendarEvents = [
    { id: 'ev1', title: 'School resumes — First Term', date: '2026-09-07', endDate: '', type: 'term' },
    { id: 'ev2', title: 'PTA General Assembly', date: '2026-09-26', endDate: '', type: 'meeting' },
    { id: 'ev3', title: 'Youth Day rehearsals begin', date: '2026-10-05', endDate: '', type: 'event' },
    { id: 'ev4', title: 'Mid-term break', date: '2026-10-29', endDate: '2026-10-30', type: 'holiday' },
    { id: 'ev5', title: 'Inter-house sports', date: '2026-11-13', endDate: '', type: 'event' },
    { id: 'ev6', title: 'First Term examinations', date: '2026-11-30', endDate: '2026-12-04', type: 'exam' },
    { id: 'ev7', title: 'Christmas party & prize giving', date: '2026-12-10', endDate: '', type: 'event' },
    { id: 'ev8', title: 'First Term ends', date: '2026-12-11', endDate: '', type: 'term' },
    { id: 'ev9', title: 'Second Term begins', date: '2027-01-04', endDate: '', type: 'term' },
    { id: 'ev10', title: 'National Youth Day (11 Feb)', date: '2027-02-11', endDate: '', type: 'holiday' },
  ];
  const announcements = [
    { id: 'an1', title: 'Mid-term break: 29–30 October', body: 'Dear parents, the school will be on mid-term break on Thursday 29 and Friday 30 October 2026. Classes resume on Monday 2 November at 7:30 am.', audience: 'all', date: '2026-10-22', by: 'u1', pinned: true },
    { id: 'an2', title: 'First Term fees deadline', body: 'All outstanding First Term fees should be cleared on or before 15 November 2026. Payments can be made in cash at the bursary, by MTN MoMo or Orange Money to the school numbers, or by bank transfer. Always collect your receipt.', audience: 'parents', date: '2026-10-15', by: 'u3', pinned: false },
    { id: 'an3', title: 'Staff meeting — Friday 3 pm', body: 'All teaching and non-teaching staff are expected at the staff room on Friday at 3 pm to plan the First Term examinations.', audience: 'staff', date: '2026-10-20', by: 'u1', pinned: false },
    { id: 'an4', title: 'New sportswear now available', body: 'New school sportswear (sizes S, M, L) is available at the school store for 5,000 FCFA.', audience: 'parents', date: '2026-09-18', by: 'u2', pinned: false },
  ];

  // ---- Users ----
  const parentGuardian = guardians.find((g) => students.filter((s) => s.guardianIds.includes(g.id) && s.status === 'active').length >= 2) || guardians[0];
  const users = [
    { id: 'u1', name: 'Eric Tanyi', username: 'proprietor', role: 'superadmin', staffId: 'st1', active: true, pw: 'admin123' },
    { id: 'u2', name: 'Rita Ebai', username: 'secretary', role: 'admin', staffId: 'st14', active: true, pw: 'secretary123' },
    { id: 'u3', name: 'Martha Fru', username: 'bursar', role: 'bursar', staffId: 'st13', active: true, pw: 'bursar123' },
    { id: 'u4', name: 'Grace Nkwenti', username: 'teacher', role: 'teacher', staffId: 'st7', active: true, pw: 'teacher123' },
    { id: 'u5', name: parentGuardian.name, username: 'parent', role: 'parent', guardianId: parentGuardian.id, active: true, pw: 'parent123' },
  ];
  for (const u of users) {
    u.passwordHash = await hashPassword(u.pw);
    delete u.pw;
  }

  const activityLog = [
    { id: 'lg1', userId: 'u3', action: 'Recorded payment', details: 'Opening balances imported', at: '2026-10-24T16:10:00Z' },
    { id: 'lg2', userId: 'u1', action: 'Approved payroll', details: 'October 2026', at: '2026-10-24T09:30:00Z' },
    { id: 'lg3', userId: 'u2', action: 'Admitted student', details: 'New intake for 2026/2027', at: '2026-09-10T11:00:00Z' },
  ];

  return {
    version: 1,
    school, settings, sessions, classes, facilities, calendarEvents,
    students, guardians, categories, feeItems, payments,
    staff, salaryScales, salaryAdjustments, payrollRuns,
    inventory: inv, stockMovements, sales,
    academicRecords, promotionRecommendations: [],
    announcements, users, activityLog,
  };
}
