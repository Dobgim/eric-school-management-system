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
| Teacher | Own class list, term results, promotion recommendations, own payslips |
| Staff (general) | Other staff (nurse, storekeeper, kitchen, security…): own profile, own payslips, announcements |
| Parent | Own children: profile, fees, receipts, results, paying fees, news |

## Accounts and sign-up

### Parents

Parents create their own account from the sign-in page with **Parent sign-up**. They choose one of two paths.

**"My child already attends"**

The parent gives their child's **registration number and date of birth**.

- If those match a pupil, and the parent's phone number matches the parent recorded for that pupil, the account **opens immediately**. It shows all their children.
- Otherwise the request waits on **Sign-up requests**. The secretary or proprietor confirms which pupil(s) are theirs.

**"Register my child(ren)"** (new families)

- The account opens immediately, with no pupils attached.
- The parent goes straight to **Register children**, where they add **as many children as they need in one go**. For each child they give the name, sex, date of birth, the class applying for, previous school, health notes, and optionally a birth certificate.
- Each child becomes an **admission application** on the office's *Admission applications* page, with a badge and a notification.
- The office **admits** the child or **declines** with a reason. Admitting can put the child in a different class from the one requested; it creates the pupil with a registration number, linked to the parent.
- The parent is notified, and admitted children appear on their dashboard.
- Existing parents can register a sibling the same way (*Register another child*).

A phone number already on the school's records can't be used for a new-family account. That parent must use the first path instead.

### Staff: by invitation only

Nobody can sign up as staff on their own.

1. The super admin opens **Users & Activity → Staff invitations** and creates an invitation. It records the **role** (teacher, secretary, bursar or other staff), optionally the person's name and job title, and optionally an existing staff record.
2. The person receives a one-time **code** (e.g. `K7QM-29XP`) and a link, to share by WhatsApp or as copied text. Invitations last 1–30 days and can be cancelled while unused.
3. They choose **Staff: I have an invitation** on the sign-in page (or open the link) and set their own username and password. They get **exactly the role in the invitation**, and their staff record is linked or created automatically.

Codes that are used, expired, cancelled or made up are refused, by the page and by the server.

### Signing in and forgotten passwords

- **Remember me** (ticked by default) keeps you signed in on that device for 30 days and fills in your sign-in name next time. Untick it on a shared computer: you are signed out when the browser closes (after 12 hours at most), and the app's offline copy of the data is removed.
- **Signing in.** Everyone can use their username or their email address. Parents can also use their phone number, written any way: `677 12 34 56` and `+237677123456` both work. An email is added under *My Account* (or by the super admin under *Users*), and no two accounts can share one.
- **Parents who forgot their password.** On the sign-in page, *Forgot password?* lets a parent enter their phone number plus one child's registration number (or the `APP-…` reference of a pending application) and date of birth, then choose a new password. They are signed in straight away. This also works for parent accounts the office created, using the phone number on the guardian record. Attempts are rate-limited.
- **Staff who forgot their password.** The super admin sets a temporary one under *Users & Activity → Reset*.

### Rules that apply to everyone

- Pending and rejected accounts can't sign in. A rejected person sees the reason that was given.
- One phone number can't be used for two parent accounts.
- A single connection is limited to 30 sign-ups per hour, and invitation look-ups are rate-limited too.
- The logic is in [server/signup.js](server/signup.js), and the checks on what parents may submit are in [server/data.js](server/data.js).

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
| Parent dashboard, Mobile Money payment by term or whole year (Fapshi), receipts and statement, news | Parent portal |
| Parent sign-up; parents registering several children at once; office admits or declines | Register children, Admission applications |
| Staff accounts by one-time invitation only; staff payslips | Users & Activity → Staff invitations, My Payslips |
| Notifications with unread count, phone push notifications, personal messages to chosen parents | Bell in the header, Announcements |
| Who has finished paying and who still owes, per term or year, PDF/Excel | Fees completed, Fees not completed |
| Fee schedule: what every class pays per term, for new and returning pupils (PDF/Excel), visible to everyone | School fees |
| Who teaches what, by teacher and by class, for parents and staff; subjects are set on each staff record | Teachers & subjects |

## Parent payments

The parent first chooses **Pay full fees at once** (every term of the school year in one payment) or a single term (first, second or third). Each choice shows the amount still owed. Each child's fees, what has been paid and what is left for that choice are shown, and the amount is filled in. A parent can pay part of it, but not more than is owed.

1. **Pay now (Mobile Money phone prompt, through [Fapshi](https://fapshi.com)):**
   - the parent only checks the amount and their MTN or Orange number;
   - Fapshi sends the approval request to their phone, showing the name of the school's Fapshi service;
   - once they enter their PIN, the server records the payment against the chosen term(s), issues the receipts, and notifies the bursar and the parent.

   The school's account details are never shown to parents or kept in the browser.
2. **"I've already paid":** for a parent who paid by USSD or at the bank. They submit the transaction ID and the bursar confirms or rejects it. A transaction ID can't be used twice.

### Connecting the school's Fapshi account

Without keys, payments run in **demo mode**: no money moves, the request is approved automatically after a few seconds, and a number ending in `000` simulates a declined payment. To take real payments:

1. Open a Fapshi account for the school. Ask Fapshi to enable **direct pay** on the live service. The service name you choose there is what parents see on their phone.
2. Sign in as the super admin and open **School Profile → Settings → Mobile Money collection**. Paste the API user and API key, then choose *Live* (or *Sandbox* to test). The keys are checked with Fapshi and stored **encrypted** (AES-256-GCM) on the server. They are never shown again.

   Alternatively, set `FAPSHI_API_USER`, `FAPSHI_API_KEY` and `FAPSHI_MODE` in the hosting settings.
3. In the Fapshi dashboard, set the webhook URL to `https://<your-site>/api/payments/fapshi/webhook`. Payments are then confirmed even if the parent closes the app. Every webhook is re-checked with Fapshi before anything is recorded.

The encryption key comes from `SIS_ENCRYPTION_KEY`, or from `JWT_SECRET` when that isn't set. Changing it means entering the Fapshi keys again.

### Who has finished paying

**Fees completed** and **Fees not completed** (Finance menu, for the bursar, secretary and proprietor) list every pupil with the fees, what was paid and what is left. You can view them for any term or for the whole year, and filter by class.

A pupil moves to *Completed* automatically as soon as a payment covers their fees, whether it was made at the bursary or from a parent's phone. Each list downloads as a PDF or Excel file, and pupils who still owe have a WhatsApp reminder link.

## Announcements and phone notifications

- **General announcements** (everyone, all parents, or staff) notify everyone they are for.
- **Personal messages** go only to the parents chosen. Other parents can't see them.
- Notifications appear on the bell in the top-right corner with the number of unread messages, and on the installed app's icon.
- **On the phone:** every signed-in person sees a *Turn on* banner at the top of the app until they allow notifications on that device. Phones can't receive alerts before that: the browser requires the person's own tap. Turning on sends a test message straight away, and *My Account → Phone notifications* can send another at any time.
- **For the office:** the Announcements page shows how many parent accounts have phone notifications on. After posting, it says how many phones the message reached. The person who posts does not get an alert for their own message. School messages, receipts and payment results then arrive as phone notifications, like a WhatsApp message, even when the app is closed.
- This uses Web Push, so it works on Android and on computers. On iPhone it needs iOS 16.4 or later, with the app added to the Home Screen first.
- Push keys are created automatically and stored encrypted. You can also set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
- Signing out stops the alerts on that phone.

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
  - Once installed, it opens full-screen and offers an **Update now** banner when a new version is deployed.

### Offline use (parents)

- **The app opens without internet.** On the first visit, the service worker stores everything the app needs, including the PDF generator.
- **The last loaded information stays on the phone:** children, fees, receipts (downloadable as PDF), payment statement, results, announcements and calendar. A banner says *Offline — showing information saved at …*.
- **Submitting offline:** *“I've already paid”* submissions and children's admission applications are **kept on the phone** (listed on the dashboard) and **sent automatically** when the connection returns. Other small changes, like marking notifications read, are also sent later.
- **Needs a connection:** the MoMo phone prompt, and the very first sign-in on a device.

## Deploy

The app needs its **API running** and a **PostgreSQL database**. Hosting only the web pages is not enough: every `/api/...` call then returns 404.

### Vercel

[vercel.json](vercel.json) and [api/index.js](api/index.js) run the API as a serverless function next to the web app.

1. Import the GitHub repo in Vercel. It detects Vite; keep the defaults.
2. Add the database:
   - Go to **Storage → Create Database → Neon (Postgres)** and connect it to the project, with **Custom Prefix `DATABASE`** (so it creates `DATABASE_URL`). `POSTGRES_URL` and `STORAGE_URL` are also accepted. Give the school its own database rather than sharing one with another app.
   - Alternatively, paste a connection string from Neon or Supabase under **Settings → Environment Variables** as `DATABASE_URL`. Prefer the *pooled* connection string.
3. Under **Settings → Environment Variables**, also add:
   - `JWT_SECRET`: any long random string;
   - `ADMIN_PASSWORD` (optional): used for the first `admin` account.
4. **Redeploy.** The first request creates the tables and the clean starting data. Sign in as `admin` and change the password.

Without `DATABASE_URL`, the sign-in page shows *“The school database is not connected yet…”* instead of failing.

On Vercel, the API can't hold a live connection open, so instead of instant updates each device checks for changes every 10 seconds and whenever the app comes back into view. Notifications still arrive, a few seconds later.

### Render (or any Node host)

The whole app runs as one always-on Node service, with instant live updates.

1. On Render, choose **New → Blueprint** and pick this repo. [render.yaml](render.yaml) configures the service.
2. Paste the `DATABASE_URL` when asked. `JWT_SECRET` is generated for you.

On any other Node host: build with `npm ci && npm run build`, then start with `npm start`, with `DATABASE_URL` and `JWT_SECRET` set.

## Project layout

```
server/
  app.js       Express app: auth, data API, online payments, live events
  index.js     starts app.js locally (and serves dist/ in production)
  data.js      what each role may see and change
  db.js        PostgreSQL (DATABASE_URL) or local PGlite
  auth.js      password hashing, session cookie
  momo.js      Mobile Money collection (demo / live)
  signup.js    parent sign-up, staff invitations, admission decisions
  setup.js     clean first-run data · reset.js wipes and recreates it
  schema.sql
src/
  lib/         API-backed store, finance maths, PDF/Excel exporters, permissions, PWA
  components/  layout shell, UI kit, charts, notifications, install prompts
  pages/       one file per module
api/index.js   Vercel serverless entry (wraps server/app.js)
public/        manifest, service worker, icons
```
