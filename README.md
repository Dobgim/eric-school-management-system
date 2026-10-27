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
| Parent dashboard: family totals, a card per child (fee progress, latest result), recent payments, announcements, upcoming events | log in as a parent |
| Parents pay fees online for one or several children (see below), download receipts and a payment statement | Pay Fees, Payments & Receipts |
| Bursar checks the payments parents submit, then confirms them (receipts issued) or rejects them with a reason | Parent Payments |

## Parent payments

Parents have two ways to pay from the portal:

1. **Pay now (MTN MoMo / Orange Money):** the parent enters their number and approves the prompt on their phone. The payment is recorded and the receipt is ready straight away.
2. **"I've already paid":** the parent pays the school's MoMo number (`*126#` / `#150#`) or bank account, then submits the transaction ID and an optional screenshot. The bursar checks it against the school's statement under **Parent Payments** and confirms or rejects it.

**Notifications:** the bursar and proprietor are notified as soon as a parent pays online or submits a payment to verify. The parent is notified when their payment is confirmed or rejected. Each notification appears on the header bell (unread count, click to open the right page), as a pop-up, and optionally as a desktop alert. Because data currently lives in the browser, the live alert reaches the bursar when they use the same browser (any open tab updates instantly). Alerts on the bursar's own device need the shared backend, which could also send SMS, WhatsApp or email.

Each payment clears the pupil's oldest unpaid term first. A transaction ID can't be used twice. The school's MoMo numbers and bank account are set under School Profile → System Settings.

**"Pay now" runs in demo mode.** No money moves; the phone prompt is simulated, and a number ending in `000` simulates a declined payment. Taking real money needs two things:

- a merchant account with a Cameroon payment provider (for example Campay, Notch Pay or Monetbil, or MTN MoMo / Orange Money directly);
- a small server that holds the provider's API keys and receives its payment confirmations (webhooks).

Then replace `requestCollection()` in [src/lib/momo.js](src/lib/momo.js) with a call to that server. Never put API keys in the frontend.

## Installable app (PWA)

The system is a Progressive Web App, so parents and staff can install it straight from the browser, without an app store:

- **Android / Chrome / Edge:** tap **Install app** (the card on the parent dashboard, the sidebar, or the login page), or use the browser menu → *Install app*.
- **iPhone / iPad:** open the site in Safari → **Share** → **Add to Home Screen**. The app shows these steps itself.

Once installed it:
- opens full-screen from the home screen;
- has a bottom tab bar for parents (Home, Children, Pay, Receipts, News);
- offers shortcuts (Pay fees, Receipts, News) when you long-press the icon;
- keeps working without internet, because the service worker caches the app and the data is on the device;
- shows an **Update now** banner when a new version is deployed.

The relevant files are [public/manifest.webmanifest](public/manifest.webmanifest), [public/sw.js](public/sw.js), [src/lib/pwa.js](src/lib/pwa.js) and the icons in [public/icons/](public/icons/). The service worker only runs in production builds (`npm run build` then `npm run preview`), not in `npm run dev`.

**Phones can only install it once it is online over HTTPS.** Deploy the `dist/` folder to any static host; Vercel and Netlify are both free and can deploy straight from the GitHub repo. [vercel.json](vercel.json) and `public/_redirects` / `public/_headers` (for Netlify) already handle page routes and caching. If the school name changes, also update `name` / `short_name` in the manifest and the `<title>` / `apple-mobile-web-app-title` in [index.html](index.html).

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
