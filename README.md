# School Information System

A school management system for a nursery and primary school. It covers:

- the school profile;
- admissions and student records;
- school fees, including Mobile Money;
- staff payroll;
- uniform and material stock;
- reports;
- role-based access;
- a parents portal that installs on phones as an app.

The stack is a **React 19 + Tailwind CSS v4** frontend and a **Node.js (Express) + PostgreSQL** backend.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # API on :4000 + web app on http://localhost:5260 (open this one)
```

The database starts **clean**. Sign in with **`admin` / `admin123`**, then change the password under *My Account*.

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web app with live reload |
| `npm run build` | Production build of the web app into `dist/` |
| `npm start` | Production server: API and web app on one port (`PORT`, default 4000) |
| `npm run db:reset -- --yes` | **Deletes all data** and recreates the clean starting point (stop the server first) |

## The database

Without configuration, the API uses **PGlite**: real PostgreSQL running inside Node, stored in `.data/`. Nothing needs installing, which makes it fine for testing on one computer.

To use a **live hosted database**, create a free PostgreSQL database and put its connection string in `.env`. Copy [.env.example](.env.example) to start. Any of these providers works:

- [Neon](https://neon.tech)
- [Supabase](https://supabase.com)
- [Render](https://render.com)
- Railway

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=<a long random string>
```

Restart the server. The tables are created automatically, and an empty database is set up clean, with the `admin` account plus:

- a placeholder school profile (edit it under *School Profile*);
- the classes Pre-Nursery to Class 6;
- the current academic session with three terms;
- fee categories (regular, staff child, scholarship).

There are **no** demo pupils, staff, payments or payroll. Enter your own test data through the app.

Tables ([server/schema.sql](server/schema.sql)):

| Table | Holds |
| --- | --- |
| `users` | Accounts. Passwords are scrypt-hashed and never sent to the browser. |
| `records` | Every school record (students, payments, payroll runs, …) as JSON, grouped by collection |
| `kv` | The school profile and system settings |
| `counters` | Registration, receipt, sale and staff numbers, handed out atomically so two devices never get the same number |

## Security and access

- **Sign-in:** an httpOnly session cookie. Repeated wrong passwords are slowed down.
- **The server decides what each role may see** ([server/data.js](server/data.js)):
  - parents receive only their own children's records;
  - teachers receive only their own class;
  - the secretary doesn't receive payroll;
  - only the super admin sees account details.
- **Every change is checked on the server:**
  - a parent can't record a payment, only submit one for the bursar to verify;
  - a teacher can only enter results for their own class;
  - nobody can edit the activity log.
- **Online payments run on the server** ([server/momo.js](server/momo.js)). The browser never decides that money was received.

## Roles

| Role | Can |
| --- | --- |
| Super Admin / Proprietor | Everything, including accounts and settings |
| Admin / Secretary | Admissions, students, parents and their portal logins, classes, promotion, results, staff records, announcements |
| Bursar / Accountant | Fees, fee structure, verifying parent payments, payroll, uniforms and materials, financial reports |
| Teacher | Own class list, term results, promotion recommendations |
| Parent | Own children: profile, fees, receipts, results, paying fees, news |

Create staff accounts under *Users & Activity*. Parent logins are created from *Parents & Guardians* → **Portal**.

## What's included

| Module | Where |
| --- | --- |
| School profile: name, motto, logo, contacts, classes, facilities, sessions/terms, academic calendar | School Profile |
| Admission with automatic registration numbers, biodata, parents, document upload and verification | Students → Admit pupil |
| Search and filters, bulk class allocation, pupil profile (fees, results, documents, purchases, history) | Students |
| Promotion, repeat and graduation per class; transfers, withdrawals, re-admission | Promotion & Exits |
| Term averages, conduct, attendance and automatic class positions | Term Results / My Class |
| Fee structure per class, term and fee type, plus category discounts | Fee Structure |
| Payments by cash, MTN MoMo, Orange Money or bank transfer; PDF receipts | Fee Collection |
| Outstanding balances and arrears, with a WhatsApp reminder link | Debtors |
| Salary scales, monthly payroll (advances, deductions, bonuses, CNPS), PDF payslips | Staff, Payroll |
| Uniforms, books and materials: stock, sales to pupils, low-stock alerts, valuation | Uniforms & Materials |
| Dashboard and 9 reports exportable to PDF and Excel | Dashboard, Reports |
| Parent dashboard, online fee payment, receipts and statement, news | Parent portal |
| Live notifications on every signed-in device | Bell in the header |

## Parent payments

1. **Pay now (MoMo phone prompt):** the server asks the operator to collect the money. When it's approved, the server records the payment, issues the receipt and alerts the bursar.
2. **"I've already paid":** the parent pays the school's MoMo number or bank account, then submits the transaction ID. The bursar is alerted, checks it against the school's statement, and confirms or rejects it. The parent is told the outcome.

A transaction ID can't be used twice. Each payment clears the pupil's oldest unpaid term first.

**MoMo runs in demo mode (`MOMO_MODE=demo`).** No money moves, and a number ending in `000` simulates a declined payment. To go live:

1. Open a merchant account with a provider (Campay, Notch Pay, Monetbil, or MTN / Orange directly).
2. Implement `liveCollect()` in [server/momo.js](server/momo.js), with the API keys in `.env`.
3. Set `MOMO_MODE=live`.

## Live updates

Any change (a payment, an admission, a confirmation) is pushed to every signed-in device within about a second, using Server-Sent Events on `/api/events`. The bursar sees parent payments arrive on their own phone or computer, as a pop-up and on the bell, without refreshing.

## Mobile and installable app

- **Phone layout:**
  - every list turns into cards on phones;
  - summary figures show two per row;
  - forms and dialogs fit the screen;
  - parents get an app-style bottom tab bar.
- **Installable (PWA):**
  - **Android, Chrome or Edge:** tap **Install app**.
  - **iPhone:** in Safari, tap **Share → Add to Home Screen**. The app shows these steps.
  - Once installed, it opens full-screen, shows the last loaded data when offline (read-only), and offers an **Update now** banner when a new version is deployed.

Phones can only install it when it's served over **HTTPS**, i.e. once deployed.

## Deploy

The app is one Node service (API and web app together) plus a PostgreSQL database. On [Render](https://render.com):

1. Create a free PostgreSQL database (on Render, Neon or Supabase) and copy its connection string.
2. On Render, choose **New → Blueprint**, pick this GitHub repo, and [render.yaml](render.yaml) configures the service.
3. Paste the `DATABASE_URL` when asked. `JWT_SECRET` is generated for you. Also set `ADMIN_PASSWORD` for the first admin login.
4. Open the URL Render gives you, sign in as `admin`, and change the password.

Any Node host works: build with `npm ci && npm run build`, then start with `npm start`, with `DATABASE_URL` and `JWT_SECRET` set. Static-only hosts (plain Vercel or Netlify) are not enough, because the API must run.

## Project layout

```
server/
  index.js     Express app: auth, data API, online payments, live events, serves dist/
  data.js      what each role may see and change
  db.js        PostgreSQL (DATABASE_URL) or local PGlite
  auth.js      password hashing, session cookie
  momo.js      Mobile Money collection (demo / live)
  setup.js     clean first-run data · reset.js wipes and recreates it
  schema.sql
src/
  lib/         API-backed store, finance maths, PDF/Excel exporters, permissions, PWA
  components/  layout shell, UI kit, charts, notifications, install prompts
  pages/       one file per module
public/        manifest, service worker, icons
```
