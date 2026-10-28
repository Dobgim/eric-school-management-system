import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  AlertTriangle, Banknote, CheckCircle2, CircleDashed, BarChart3, BookOpen, BookOpenCheck, Building2, ClipboardList, GraduationCap, LayoutDashboard, LogOut,
  CloudOff, Megaphone, Menu, Smartphone, UserPlus, Package, Receipt, Settings2, ShieldCheck, Users, UserRound, Wallet, X, ArrowUpCircle, Home, Contact,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { currentTerm } from '../lib/finance';
import { ROLES, fmtDateTime } from '../lib/utils';
import { Avatar } from './ui';
import NotificationBell from './NotificationBell';
import { InstallButton, UpdateBanner } from './InstallApp';

export function Logo({ school, size = 'md' }) {
  const s = size === 'lg' ? 'size-16' : 'size-10';
  if (school.logo) return <img src={school.logo} alt="" className={`${s} shrink-0 rounded-xl bg-white object-contain p-0.5`} />;
  return (
    <svg viewBox="0 0 64 64" className={`${s} shrink-0`} aria-hidden="true">
      <path d="M32 4 8 12v18c0 15 10 25 24 30 14-5 24-15 24-30V12L32 4z" fill="#264c39" stroke="#e2a43b" strokeWidth="2" />
      <path d="M32 15l13 7H19z" fill="#e2a43b" />
      <path d="M18 26h28v3H18zM21 32h22l-2 14H23z" fill="#e2a43b" />
    </svg>
  );
}

const NAV = [
  { group: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard', end: true },
    { to: '/my-class', label: 'My Class', icon: GraduationCap, perm: 'myclass' },
    { to: '/portal', label: 'Dashboard', icon: Home, perm: 'portal', end: true },
    { to: '/me', label: 'My Payslips', icon: Wallet, perm: 'me' },
  ] },
  { group: 'My family', items: [
    { to: '/portal/children', label: 'My Children', icon: Users, perm: 'portal' },
    { to: '/portal/admissions', label: 'Register children', icon: UserPlus, perm: 'portal' },
    { to: '/portal/pay', label: 'Pay Fees', icon: Smartphone, perm: 'portal' },
    { to: '/portal/payments', label: 'Payments & Receipts', icon: Receipt, perm: 'portal' },
    { to: '/portal/news', label: 'News & Calendar', icon: Megaphone, perm: 'portal' },
  ] },
  { group: 'School', items: [
    { to: '/school-fees', label: 'School fees', icon: Banknote, perm: 'everyone' },
    { to: '/teachers', label: 'Teachers & subjects', icon: BookOpen, perm: 'everyone' },
  ] },
  { group: 'Academics', items: [
    { to: '/students', label: 'Students', icon: Users, perm: 'students.view' },
    { to: '/admissions', label: 'Admission applications', icon: ClipboardList, perm: 'students.edit', badge: (db) => db.admissionApplications.filter((a) => a.status === 'pending').length },
    { to: '/guardians', label: 'Parents & Guardians', icon: Contact, perm: 'guardians.edit' },
    { to: '/academics', label: 'Term Results', icon: BookOpenCheck, perm: 'academics.edit' },
    { to: '/promotion', label: 'Promotion & Exits', icon: ArrowUpCircle, perm: 'promotion' },
  ] },
  { group: 'Finance', items: [
    { to: '/fees', label: 'Fee Collection', icon: Receipt, perm: 'fees.view', end: true },
    { to: '/fees/online', label: 'Parent Payments', icon: Smartphone, perm: 'fees.collect', badge: (db) => db.paymentRequests.filter((r) => r.status === 'pending').length },
    { to: '/fees/completed', label: 'Fees completed', icon: CheckCircle2, perm: ['fees.view', 'students.edit'] },
    { to: '/fees/not-completed', label: 'Fees not completed', icon: CircleDashed, perm: ['fees.view', 'students.edit'] },
    { to: '/fees/debtors', label: 'Debtors', icon: AlertTriangle, perm: 'fees.view' },
    { to: '/fees/structure', label: 'Fee Structure', icon: ClipboardList, perm: 'fees.setup' },
    { to: '/payroll', label: 'Payroll', icon: Wallet, perm: 'payroll' },
    { to: '/inventory', label: 'Uniforms & Materials', icon: Package, perm: 'inventory' },
  ] },
  { group: 'Administration', items: [
    { to: '/staff', label: 'Staff', icon: UserRound, perm: 'staff.view' },
    { to: '/reports', label: 'Reports', icon: BarChart3, perm: ['reports.financial', 'reports.academic'] },
    { to: '/announcements', label: 'Announcements', icon: Megaphone, perm: 'announcements.edit' },
    { to: '/school', label: 'School Profile', icon: Building2, perm: 'school.view' },
    { to: '/signups', label: 'Sign-up requests', icon: UserPlus, perm: 'signups', badge: (db) => db.users.filter((u) => u.status === 'pending').length },
    { to: '/users', label: 'Users & Activity', icon: ShieldCheck, perm: 'users' },
  ] },
];

const PARENT_TABS = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/children', label: 'Children', icon: Users },
  { to: '/portal/pay', label: 'Pay', icon: Smartphone, primary: true },
  { to: '/portal/payments', label: 'Receipts', icon: Receipt },
  { to: '/portal/news', label: 'News', icon: Megaphone },
];

/** App-style bottom navigation for parents on phones. */
function ParentTabBar() {
  return (
    <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden" aria-label="Parent navigation">
      {PARENT_TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold ${isActive ? 'text-brand-700' : 'text-slate-500'}`}
        >
          {({ isActive }) => (
            <>
              <span className={`grid h-7 w-12 place-items-center rounded-md ${t.primary ? 'bg-accent-400 text-brand-950' : isActive ? 'bg-brand-50' : ''}`}>
                <t.icon className="size-5" />
              </span>
              {t.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export const allowed = (user, perm) => {
  if (perm === 'everyone') return true;
  if (perm === 'users') return user.role === 'superadmin';
  if (perm === 'signups') return user.role === 'superadmin' || user.role === 'admin';
  // Own payslips: anyone linked to a staff record (the bursar and proprietor already see all of payroll).
  if (perm === 'me') return !!user.staffId && ['admin', 'teacher', 'staff'].includes(user.role) || user.role === 'staff';
  return [].concat(perm).some((p) => can(user, p));
};

export default function Layout() {
  const { db, user, logout, saveError, offline, cachedAt } = useStore();
  const [open, setOpen] = useState(false);
  const term = currentTerm(db);

  const sidebar = (
    <nav className="flex h-full flex-col bg-brand-950 text-brand-100">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo school={db.school} />
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-bold text-white">{db.school.shortName || db.school.name}</p>
          <p className="truncate text-xs text-brand-300 italic">{db.school.motto}</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => allowed(user, i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="px-3 pb-1.5 text-[11px] font-bold tracking-widest text-brand-400 uppercase">{g.group}</p>
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/[0.07] text-white shadow-[inset_3px_0_0_var(--color-accent-400)]' : 'text-brand-200 hover:bg-white/5 hover:text-white'}`}
                >
                  <i.icon className="size-4.5 shrink-0" />
                  <span className="flex-1">{i.label}</span>
                  {i.badge?.(db) > 0 && <span className="rounded-full bg-accent-400 px-1.5 text-xs font-bold text-slate-900">{i.badge(db)}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 p-3">
        <InstallButton variant="ghost" className="w-full !justify-start gap-3 !px-3 !font-medium !text-brand-200 hover:!bg-white/5 hover:!text-white" />
        <NavLink to="/account" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-white/5 hover:text-white">
          <Settings2 className="size-4.5" /> My Account
        </NavLink>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-white/5 hover:text-white">
          <LogOut className="size-4.5" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            {sidebar}
            <button onClick={() => setOpen(false)} className="absolute top-5 right-3 rounded-lg p-1 text-brand-200 hover:bg-white/10" aria-label="Close menu"><X className="size-5" /></button>
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <UpdateBanner />
        <header className="no-print safe-top sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">Academic session</p>
            <p className="truncate text-sm font-bold text-slate-800">{term?.label}</p>
          </div>
          <NotificationBell />
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} size="sm" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm leading-tight font-semibold text-slate-800">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{ROLES[user.role]}</p>
            </div>
          </div>
        </header>
        {offline && (
          <div className="no-print flex items-center justify-center gap-2 bg-accent-400 px-4 py-2 text-center text-sm font-medium text-brand-950">
            <CloudOff className="size-4 shrink-0" />
            <span>Offline — showing information saved {cachedAt ? fmtDateTime(cachedAt) : 'earlier'}. {user.role === 'parent' ? 'Anything you submit is kept on this phone and sent when you reconnect.' : 'Changes will be sent when you reconnect.'}</span>
          </div>
        )}
        {saveError && <div className="no-print sticky top-[61px] z-20 bg-rose-600 px-4 py-2 text-center text-sm font-medium text-white">{saveError}</div>}
        <main className={`mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8 ${user.role === 'parent' ? 'pb-28 lg:pb-8' : ''}`}>
          <Outlet />
        </main>
      </div>
      {user.role === 'parent' && <ParentTabBar />}
    </div>
  );
}
