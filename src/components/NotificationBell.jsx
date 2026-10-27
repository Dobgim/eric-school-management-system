import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, CheckCircle2, Clock, Megaphone, Smartphone, X, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';

const KIND = {
  payment: [Smartphone, 'bg-emerald-50 text-emerald-600'],
  verify: [Clock, 'bg-amber-50 text-amber-600'],
  confirmed: [CheckCircle2, 'bg-emerald-50 text-emerald-600'],
  rejected: [XCircle, 'bg-rose-50 text-rose-600'],
  info: [Bell, 'bg-brand-50 text-brand-700'],
};

export const notificationsFor = (db, user) =>
  (db.notifications || []).filter((n) => n.userIds?.includes(user.id) || n.roles?.includes(user.role));

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

function Item({ n, unread, onOpen }) {
  const [Icon, tone] = KIND[n.kind] || KIND.info;
  return (
    <button type="button" onClick={() => onOpen(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${unread ? 'bg-brand-50/40' : ''}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
        <span className="mt-1 block text-[11px] text-slate-400">{ago(n.createdAt)}</span>
      </span>
      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />}
    </button>
  );
}

/** Header bell: unread badge, dropdown list, pop-up + desktop alert when something new arrives. */
export default function NotificationBell() {
  const { db, user, api } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState(null);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const ref = useRef(null);
  const seen = useRef(null);
  const mine = notificationsFor(db, user);
  const unread = mine.filter((n) => !n.readBy.includes(user.id));

  // Alert on notifications that arrive while the app is open (another tab, or this one).
  const ids = mine.map((n) => n.id).join();
  useEffect(() => {
    if (seen.current) {
      const fresh = unread.filter((n) => !seen.current.has(n.id));
      if (fresh.length) {
        const n = fresh[0];
        setPopup(n);
        if (perm === 'granted' && document.visibilityState !== 'visible') {
          try {
            const d = new Notification(n.title, { body: n.body, tag: n.id, icon: '/favicon.svg' });
            d.onclick = () => { window.focus(); open$(n); d.close(); };
          } catch { /* some browsers only allow notifications from a service worker */ }
        }
      }
    }
    seen.current = new Set(mine.map((n) => n.id));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(() => setPopup(null), 9000);
    return () => clearTimeout(t);
  }, [popup]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function open$(n) {
    api.markRead([n.id], user.id);
    setOpen(false);
    setPopup(null);
    if (n.link) navigate(n.link);
  }

  const enableDesktop = async () => {
    if (!('Notification' in window)) return;
    setPerm(await Notification.requestPermission());
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}>
        {unread.length ? <BellRing className="size-5 text-brand-700" /> : <Bell className="size-5" />}
        {unread.length > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-slate-900">Notifications</p>
            {unread.length > 0 && <button type="button" onClick={() => api.markRead(unread.map((n) => n.id), user.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          {perm === 'default' && (
            <button type="button" onClick={enableDesktop} className="flex w-full items-center gap-2 border-b border-slate-100 bg-amber-50 px-4 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100">
              <BellRing className="size-3.5" />Turn on desktop alerts so you see payments even when this tab is in the background
            </button>
          )}
          <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {mine.length ? mine.slice(0, 30).map((n) => <Item key={n.id} n={n} unread={!n.readBy.includes(user.id)} onOpen={open$} />) : <p className="px-4 py-10 text-center text-sm text-slate-500">You’re all caught up.</p>}
          </div>
          <Link to={user.role === 'parent' ? '/portal/news' : '/announcements'} onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <Megaphone className="size-4" />School announcements
          </Link>
        </div>
      )}

      {popup && createPortal(
        <div className="fixed right-4 bottom-4 z-[60] w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="status">
          <div className="flex items-start">
            <div className="flex-1"><Item n={popup} unread onOpen={open$} /></div>
            <button type="button" onClick={() => setPopup(null)} className="m-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss"><X className="size-4" /></button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
