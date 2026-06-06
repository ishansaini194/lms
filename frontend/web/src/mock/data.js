// ─────────────────────────────────────────────────────────────────────────
// MOCK DATA — single source for all admin screens.
//
// This is the ONE place screens read their data from. When the backend is
// wired, each export here gets replaced by a fetch() to the matching endpoint
// (noted in comments). Screen components won't need to change — they already
// import from here.
//
// NOTE: shapes match the current mockups, not yet the full DB schema. Missing
// fields (epunjab_id, aadhar, parent contacts, full fee-type whitelist) are
// added in the next step, page by page.
// ─────────────────────────────────────────────────────────────────────────

// === DASHBOARD (A1) ===
// Future: GET /api/payments?recent=6  and  GET /api/dashboard/defaulters
export const recentPayments = [
  { who: 'Riya Sharma',    cls: '3-A', desc: 'Tuition · April',  amt: 1200, mode: 'cash',   time: '10:42', rcp: 'RCP-2026-00413' },
  { who: 'Arjun Verma',    cls: '5-A', desc: 'Transport · April', amt: 800,  mode: 'online', time: '10:28', rcp: 'RCP-2026-00412' },
  { who: 'Simran Kaur',    cls: '1-B', desc: 'Tuition · April',  amt: 1000, mode: 'cash',   time: '09:55', rcp: 'RCP-2026-00411' },
  { who: 'Harpreet Singh', cls: '7-A', desc: 'Tuition · March',  amt: 1500, mode: 'cheque', time: '09:31', rcp: 'RCP-2026-00410' },
  { who: 'Manjit Kumar',   cls: '4-A', desc: 'Tuition · April',  amt: 1200, mode: 'online', time: '09:20', rcp: 'RCP-2026-00409' },
  { who: 'Pooja Devi',     cls: '2-A', desc: 'Tuition · April',  amt: 1200, mode: 'cash',   time: '09:05', rcp: 'RCP-2026-00408' },
];

export const topDefaulters = [
  { who: 'Karan Singh', cls: '4-A', months: 'Mar + Apr',       amt: 2400 },
  { who: 'Neha Rani',   cls: '2-B', months: 'Feb + Mar + Apr', amt: 3600 },
  { who: 'Ravi Kumar',  cls: '7-A', months: 'Mar + Apr',       amt: 2700 },
  { who: 'Pooja',       cls: '1-A', months: 'Feb + Mar + Apr', amt: 3300 },
  { who: 'Mohit',       cls: '6-A', months: 'Mar + Apr',       amt: 2400 },
];

// === CLASSES (A2) ===
// Future: GET /api/classes (joined with current class_year for fees + teacher)
export const classes = [
  { n: 1, sec: 'A', count: 48, t: 'Sunita Sharma',  tuition: 1200, transport: 800 },
  { n: 1, sec: 'B', count: 44, t: 'Harvinder Gill', tuition: 1200, transport: 800 },
  { n: 2, sec: 'A', count: 52, t: 'Manpreet Kaur',  tuition: 1200, transport: 800 },
  { n: 3, sec: 'A', count: 45, t: 'Jaspreet Singh', tuition: 1500, transport: 800 },
  { n: 4, sec: 'A', count: 41, t: 'Rani Verma',     tuition: 1500, transport: 800 },
  { n: 5, sec: 'A', count: 38, t: 'Tarun Dhillon',  tuition: 1500, transport: 800 },
  { n: 6, sec: 'A', count: 36, t: 'Asha Arora',     tuition: 1800, transport: 1000 },
  { n: 7, sec: 'A', count: 32, t: 'M. Bhatti',      tuition: 1800, transport: 1000 },
  { n: 8, sec: 'A', count: 29, t: null,             tuition: 1800, transport: 1000 },
];

// === STUDENTS (A3) ===
// Future: GET /api/students?status=&class=&q=
export const studentStatuses = ['All', 'Active', 'Inactive', 'Promoted', 'Left'];

export const students = [
  { sel: true,  roll: 12, name: 'Aanya Kumari',   cls: '5', sec: 'A', phone: '+91 98xx-1234', fee: 'paid' },
  { sel: true,  roll: 13, name: 'Arjun Verma',    cls: '5', sec: 'A', phone: '+91 97xx-9988', fee: 'unpaid' },
  { sel: true,  roll: 14, name: 'Bhavna Kaur',    cls: '5', sec: 'A', phone: '+91 96xx-4421', fee: 'paid' },
  { sel: false, roll: 15, name: 'Deepak Yadav',   cls: '5', sec: 'A', phone: '+91 94xx-1122', fee: 'partial' },
  { sel: false, roll: 16, name: 'Ekta Sharma',    cls: '5', sec: 'A', phone: '+91 98xx-3344', fee: 'paid' },
  { sel: false, roll: 17, name: 'Gurpreet Singh', cls: '5', sec: 'A', phone: '+91 97xx-5566', fee: 'unpaid' },
  { sel: false, roll: 18, name: 'Harman Kaur',    cls: '5', sec: 'A', phone: '+91 94xx-7788', fee: 'paid' },
  { sel: false, roll: 11, name: 'Karan Singh',    cls: '4', sec: 'A', phone: '+91 96xx-2211', fee: 'unpaid' },
  { sel: false, roll: 12, name: 'Manjit Kumar',   cls: '4', sec: 'A', phone: '+91 94xx-3322', fee: 'partial' },
  { sel: false, roll: 13, name: 'Neha Rani',      cls: '2', sec: 'B', phone: '+91 98xx-1144', fee: 'unpaid' },
  { sel: false, roll: 14, name: 'Pooja Devi',     cls: '2', sec: 'A', phone: '+91 97xx-2266', fee: 'paid' },
];

// Student detail fee history (A3.1) — Future: GET /api/students/:id/fees
export const studentFeeHistory = [
  { m: 'Apr 2026', amt: 1200, paid: 0,    status: 'unpaid', rcp: null },
  { m: 'Mar 2026', amt: 1200, paid: 1200, status: 'paid',   rcp: 'RCP-2026-00214', when: '5 Mar' },
  { m: 'Feb 2026', amt: 1200, paid: 1200, status: 'paid',   rcp: 'RCP-2026-00133', when: '7 Feb' },
  { m: 'Jan 2026', amt: 1200, paid: 1200, status: 'paid',   rcp: 'RCP-2026-00041', when: '10 Jan' },
];

// === FEES (A4) ===
// Future: GET /api/students?q=  (search)  and  GET /api/students/:id/fees (months)
export const feeMatches = [
  { name: 'Arjun Verma', cls: '5-A', roll: 12, due: '₹1,200', selected: true  },
  { name: 'Arjun Singh', cls: '3-B', roll: 8,  due: '₹0',     selected: false },
  { name: 'Arjun Kumar', cls: '7-A', roll: 4,  due: '₹2,400', selected: false },
];

export const feeMonths = [
  { m: 'Apr', selected: true,  amt: 1200, status: 'due' },
  { m: 'Mar', selected: true,  amt: 1200, status: 'due' },
  { m: 'Feb', selected: false, amt: 1200, status: 'paid' },
  { m: 'Jan', selected: false, amt: 1200, status: 'paid' },
  { m: 'Dec', selected: false, amt: 1200, status: 'paid' },
  { m: 'Nov', selected: false, amt: 1200, status: 'paid' },
];

// === TEACHERS (A5) ===
// Future: GET /api/teachers
export const teachers = [
  { name: 'Sunita Sharma',  phone: '+91 98xx-1100', subject: 'English', emp: 'EMP-001', lead: '1-A', active: true,  classes: 3 },
  { name: 'Harvinder Gill', phone: '+91 97xx-2200', subject: 'Maths',   emp: 'EMP-002', lead: '1-B', active: true,  classes: 2 },
  { name: 'Manpreet Kaur',  phone: '+91 94xx-3300', subject: 'Hindi',   emp: 'EMP-003', lead: '2-A', active: true,  classes: 3 },
  { name: 'Harpreet Kaur',  phone: '+91 95xx-4040', subject: 'English', emp: 'EMP-008', lead: '2-A', active: true,  classes: 3, you: false },
  { name: 'Jaspreet Singh', phone: '+91 98xx-4400', subject: 'Science', emp: 'EMP-004', lead: '3-A', active: true,  classes: 4 },
  { name: 'Rani Verma',     phone: '+91 96xx-5500', subject: 'EVS',     emp: 'EMP-005', lead: '4-A', active: true,  classes: 2 },
  { name: 'Tarun Dhillon',  phone: '+91 94xx-6600', subject: 'Maths',   emp: 'EMP-006', lead: '5-A', active: true,  classes: 4 },
  { name: 'Asha Arora',     phone: '+91 97xx-7700', subject: 'English', emp: 'EMP-007', lead: '6-A', active: false, classes: 0 },
];

// === NOTICES (A6) ===
// Future: GET /api/notices
export const notices = [
  { pin: true,  t: 'Annual Day rehearsal — bring costumes Friday 2 PM', who: 'Principal Singh', target: 'All school', type: 'all',   when: '2 hours ago', unread: true },
  { pin: false, t: 'Holiday on Monday — Labour Day',                    who: 'Principal Singh', target: 'All school', type: 'all',   when: '2 days ago' },
  { pin: false, t: 'Class 8-A: Maths test postponed to Thursday',       who: 'Mr. Bhatti',      target: 'Class 8-A',  type: 'class', when: '3 days ago' },
  { pin: true,  t: 'Fee reminder — April dues by 10 May',               who: 'Principal Singh', target: 'All school', type: 'all',   when: '1 week ago' },
  { pin: false, t: 'Class 2-A: Bring library books tomorrow',           who: 'Mrs. Kaur',       target: 'Class 2-A',  type: 'class', when: '1 week ago' },
  { pin: false, t: 'Class 5-A: PTM scheduled for Saturday',             who: 'Mr. Dhillon',     target: 'Class 5-A',  type: 'class', when: '2 weeks ago' },
  { pin: false, t: 'Republic Day rehearsal — wear white uniform',       who: 'Principal Singh', target: 'All school', type: 'all',   when: '3 weeks ago' },
];

// === EXAMS (A7) ===
// Future: GET /api/exams (grouped by name/type)
export const examGroups = [
  { type: 'Unit Test', count: 8, items: [
    { cls: '3-A', sub: 'Maths',   max: 25, date: '12 Apr', done: 45, of: 45 },
    { cls: '3-A', sub: 'English', max: 25, date: '14 Apr', done: 42, of: 45 },
    { cls: '5-A', sub: 'Science', max: 25, date: '18 Apr', done: 36, of: 38 },
  ]},
  { type: 'Mid-term', count: 6, items: [
    { cls: '2-A', sub: 'Maths',   max: 50, date: '18 Apr', done: 44, of: 48 },
    { cls: '5-A', sub: 'Hindi',   max: 50, date: '20 Apr', done: 0,  of: 38, pending: true },
    { cls: '7-A', sub: 'English', max: 50, date: '22 Apr', done: 30, of: 32 },
  ]},
  { type: 'Final', count: 0, items: [], placeholder: 'No final exams scheduled yet for AY 2025–26' },
];

// Exam detail — student marks (A7 detail) — Future: GET /api/exams/:id/results
export const examResults = [
  { roll: '01', name: 'Aanya Kumari',   marks: 42,   by: 'Mrs. Kaur', when: '20 Apr 14:32' },
  { roll: '02', name: 'Arjun Singh',    marks: 38,   by: 'Mrs. Kaur', when: '20 Apr 14:32' },
  { roll: '03', name: 'Bhavna Kaur',    marks: 45,   by: 'Mrs. Kaur', when: '20 Apr 14:33' },
  { roll: '04', name: 'Deepak Yadav',   marks: 29,   by: 'Mrs. Kaur', when: '20 Apr 14:33' },
  { roll: '05', name: 'Ekta Sharma',    marks: 47,   by: 'Mrs. Kaur', when: '20 Apr 14:34' },
  { roll: '06', name: 'Gurpreet Singh', marks: 33,   by: 'Mrs. Kaur', when: '20 Apr 14:34' },
  { roll: '07', name: 'Harman Kaur',    marks: 41,   by: 'Mrs. Kaur', when: '20 Apr 14:35' },
  { roll: '08', name: 'Ishaan Verma',   marks: 'AB', by: 'Mrs. Kaur', when: '20 Apr 14:35', absent: true },
];

// Report card terms (A7 report) — Future: GET /api/students/:id/report?year=
export const reportTerms = [
  { name: 'Unit Test', rows: [
    { sub: 'English', m: 22, max: 25 },
    { sub: 'Maths',   m: 20, max: 25 },
    { sub: 'Science', m: 19, max: 25 },
  ]},
  { name: 'Mid-term', rows: [
    { sub: 'English', m: 41, max: 50 },
    { sub: 'Maths',   m: 39, max: 50 },
    { sub: 'Science', m: 36, max: 50 },
    { sub: 'Hindi',   m: 44, max: 50 },
  ]},
  { name: 'Final (TBD)', rows: [
    { sub: 'English', m: null, max: 100 },
    { sub: 'Maths',   m: null, max: 100 },
  ], pending: true },
];

// === SETTINGS (A9) ===
// Future: GET /api/academic-years
export const academicYears = [
  { y: '2025–26', start: '01 Apr 2025', end: '31 Mar 2026', status: 'current',  students: 482 },
  { y: '2024–25', start: '01 Apr 2024', end: '31 Mar 2025', status: 'archived', students: 470 },
  { y: '2023–24', start: '01 Apr 2023', end: '31 Mar 2024', status: 'archived', students: 451 },
];

// === SHARED LOOKUPS ===
// Fee-type whitelist (matches backend handler whitelist).
// Future: could come from GET /api/fee-types or stay a frontend constant.
export const feeTypes = [
  { value: 'tuition',   label: 'Tuition' },
  { value: 'transport', label: 'Transport' },
  { value: 'admission', label: 'Admission' },
  { value: 'exam',      label: 'Exam' },
  { value: 'books',     label: 'Books' },
  { value: 'uniform',   label: 'Uniform' },
  { value: 'late_fee',  label: 'Late fee' },
];

// Education boards for the Class form (classes.board column).
export const boards = [
  { value: '',     label: 'Select…' },
  { value: 'CBSE', label: 'CBSE' },
  { value: 'ICSE', label: 'ICSE' },
  { value: 'PSEB', label: 'PSEB' },
  { value: 'ISC',  label: 'ISC' },
  { value: 'NIOS', label: 'NIOS' },
];

// Payment modes (payments.payment_mode).
export const paymentModes = ['Cash', 'Online', 'Cheque'];
