import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Bell, BookOpenCheck, Building2, ClipboardList, GraduationCap, LayoutDashboard, LogOut,
  Megaphone, Menu, Smartphone, Package, Receipt, Settings2, ShieldCheck, Users, UserRound, Wallet, X, ArrowUpCircle, Home, Contact,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import { currentTerm } from '../lib/finance';
import { ROLES } from '../lib/utils';
import { Avatar } from './ui';

export function Logo({ school, size = 'md' }) {
  const s = size === 'lg' ? 'size-16' : 'size-10';
  if (school.logo) return <img src={school.logo} alt="" className={`${s} shrink-0 rounded-xl bg-white object-contain p-0.5`} />;
  return (
    <svg viewBox="0 0 64 64" className={`${s} shrink-0`} aria-hidden="true">
      <path d="M32 4 8 12v18c0 15 10 25 24 30 14-5 24-15 24-30V12L32 4z" fill="#1a2c86" stroke="#fbbf24" strokeWidth="2" />
      <path d="M32 15l13 7H19z" fill="#fbbf24" />
      <path d="M18 26h28v3H18zM21 32h22l-2 14H23z" fill="#fbbf24" />
    </svg>
  );
}

const NAV = [
  { group: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard', end: true },
    { to: '/my-class', label: 'My Class', icon: GraduationCap, perm: 'myclass' },
    { to: '/portal', label: 'Dashboard', icon: Home, perm: 'portal', end: true },
  ] },
  { group: 'My family', items: [
    { to: '/portal/children', label: 'My Children', icon: Users, perm: 'portal' },
    { to: '/portal/pay', label: 'Pay Fees', icon: Smartphone, perm: 'portal' },
    { to: '/portal/payments', label: 'Payments & Receipts', icon: Receipt, perm: 'portal' },
    { to: '/portal/news', label: 'News & Calendar', icon: Megaphone, perm: 'portal' },
  ] },
  { group: 'Academics', items: [
    { to: '/students', label: 'Students', icon: Users, perm: 'students.view' },
    { to: '/guardians', label: 'Parents & Guardians', icon: Contact, perm: 'guardians.edit' },
    { to: '/academics', label: 'Term Results', icon: BookOpenCheck, perm: 'academics.edit' },
    { to: '/promotion', label: 'Promotion & Exits', icon: ArrowUpCircle, perm: 'promotion' },
  ] },
  { group: 'Finance', items: [
    { to: '/fees', label: 'Fee Collection', icon: Receipt, perm: 'fees.view', end: true },
    { to: '/fees/online', label: 'Parent Payments', icon: Smartphone, perm: 'fees.collect', badge: (db) => db.paymentRequests.filter((r) => r.status === 'pending').length },
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
    { to: '/users', label: 'Users & Activity', icon: ShieldCheck, perm: 'users' },
  ] },
];

export const allowed = (user, perm) => (perm === 'users' ? user.role === 'superadmin' : [].concat(perm).some((p) => can(user, p)));

export default function Layout() {
  const { db, user, logout, saveError } = useStore();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const term = currentTerm(db);
  const unreadish = db.announcements.filter((a) => a.audience === 'all' || (user.role === 'parent' ? a.audience === 'parents' : a.audience === 'staff')).length;

  const sidebar = (
    <nav className="flex h-full flex-col bg-brand-950 text-brand-100">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo school={db.school} />
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-extrabold text-white">{db.school.shortName || db.school.name}</p>
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
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white'}`}
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
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">Academic session</p>
            <p className="truncate text-sm font-bold text-slate-800">{term?.label}</p>
          </div>
          <NavLink to={user.role === 'parent' ? '/portal/news' : '/announcements'} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Announcements" state={{ from: loc.pathname }}>
            <Bell className="size-5" />
            {unreadish > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-accent-500" />}
          </NavLink>
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} size="sm" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm leading-tight font-semibold text-slate-800">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{ROLES[user.role]}</p>
            </div>
          </div>
        </header>
        {saveError && <div className="bg-rose-600 px-4 py-2 text-center text-sm font-medium text-white">{saveError}</div>}
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
