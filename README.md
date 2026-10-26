# School Information System

A school management system for a nursery and primary school, built with React 19, Tailwind CSS v4 and Vite. It covers the school profile, admissions and student records, school fees with Mobile Money, staff payroll, uniform and material stock, reports, role-based access and a parents portal.

## Run it

```bash
npm install      # needs internet the first time
npm run dev      # http://localhost:5260
npm run build    # production build in dist/
```

### Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Super Admin / Proprietor | `proprietor` | `admin123` |
| Admin / Secretary | `secretary` | `secretary123` |
| Bursar / Accountant | `bursar` | `bursar123` |
| Teacher (Class 3) | `teacher` | `teacher123` |
| Parent (Parents tab) | `parent` | `parent123` |

The login screen also lists these; click one to fill in the form.

## What's included

| Module | Where |
| --- | --- |
| School profile: name, motto, logo, contacts, classes, facilities, sessions/terms, academic calendar | School Profile |
| Admission with auto registration numbers (`BFS/2026/0148`), biodata, parents, document upload and verification | Students → Admit pupil |
| Search and filter students, bulk class allocation, pupil profile (fees, results, documents, purchases, history) | Students |
| Promotion, repeat and graduation per class, with teacher recommendations; transfers, withdrawals, re-admission | Promotion & Exits |
| Term averages, conduct, attendance and automatic class positions | Term Results / My Class |
| Fee structure per class, per term and per fee type (tuition, registration, exam, PTA, activity), plus category discounts | Fee Structure |
| Recording payments by cash, MTN MoMo, Orange Money or bank transfer; references can't be reused; PDF receipts | Fee Collection |
| Outstanding balances and arrears, with a WhatsApp reminder link per parent | Debtors |
| Salary scales, monthly payroll with advances, deductions, bonuses and CNPS, approval, payment, PDF payslips, history | Staff, Payroll |
| Uniforms, books and materials: stock in and out, sales linked to pupils, low-stock alerts, valuation | Uniforms & Materials |
| Dashboard plus 9 reports (daily and termly collection, debtors, salary, uniform sales, enrolment, gender, class list, class results), exportable to PDF and Excel | Dashboard, Reports |
| Role-based menus and routes, user management, activity log of every change | Users & Activity |
| Parents portal: children's profiles, fees, receipts, purchases, results, announcements, calendar | log in as a parent |

## Where the data lives

All data is held in the browser's `localStorage` (key `sis:data:v1`). The first visit loads a full set of demo data: 2 sessions, about 140 pupils, 16 staff, payments, payroll and stock.

- **Back up or restore:** School Profile → System Settings → Download backup / Restore backup.
- **Start over:** School Profile → System Settings → Reset demo data.
- **Change the school's details:** edit them under School Profile. The name, logo and contacts appear on every PDF.

Every read and write goes through [src/lib/store.jsx](src/lib/store.jsx). Fee, arrears and payroll calculations are in [src/lib/finance.js](src/lib/finance.js). To use a real backend (for example Supabase or a Node API) so several computers share the same data, replace the store module and keep the pages as they are.

## Project layout

```
src/
  lib/          store, seed data, finance maths, PDF/Excel exporters, permissions
  components/   layout shell, UI kit, SVG charts
  pages/        one file per module
```
