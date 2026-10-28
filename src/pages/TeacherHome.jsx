import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CalendarCheck, CheckCircle2, Clock, GraduationCap, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentTerm } from '../lib/finance';
import { classSubjects } from '../lib/subjects';
import { DAYS, teacherLessons } from '../lib/timetable';
import { fmtDate, today } from '../lib/utils';
import { Badge, Button, Card, PageHeader, StatCard } from '../components/ui';
import { Progress } from '../components/Charts';
import { AnnouncementList, visibleAnnouncements } from './Announcements';

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A teacher's day: today's lessons, the class register, which marks are still to enter, and school news. */
export default function TeacherHome() {
  const { db, user } = useStore();
  const term = currentTerm(db);
  const me = db.staff.find((s) => s.id === user.staffId);
  const cls = db.classes.find((c) => c.teacherId && c.teacherId === user.staffId);
  const day = today();
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  const lessons = user.staffId ? teacherLessons(db, user.staffId) : [];
  const todays = lessons.filter((l) => l.day === dayKey);
  const pupils = cls ? db.students.filter((s) => s.status === 'active' && s.classId === cls.id) : [];
  const register = cls && (db.attendance || []).find((a) => a.classId === cls.id && a.date === day);
  const schoolDay = DAYS.some(([d]) => d === dayKey);

  // Every class + subject this teacher enters marks for: all subjects of their own class, plus their own subjects elsewhere.
  const sheets = [];
  if (cls) for (const s of classSubjects(cls)) sheets.push({ c: cls, subject: s.name });
  for (const t of me?.teaching || []) {
    for (const cid of t.classIds || []) {
      const c = db.classes.find((x) => x.id === cid);
      const subject = c && classSubjects(c).find((s) => same(s.name, t.subject));
      if (subject && !sheets.some((x) => x.c.id === cid && x.subject === subject.name)) sheets.push({ c, subject: subject.name });
    }
  }
  const progress = sheets.map((x) => {
    const total = db.students.filter((s) => s.enrollments?.[term.sessionId] === x.c.id && s.status === 'active').length;
    const sheet = (db.marks || []).find((m) => m.classId === x.c.id && m.termId === term.id && same(m.subject, x.subject));
    return { ...x, total, done: sheet ? Object.keys(sheet.marks || {}).length : 0 };
  });
  const missing = progress.filter((p) => p.total && p.done < p.total);
  const pendingConfirm = !!me?.teachingRequest;
  const news = visibleAnnouncements(db, user).slice(0, 3);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`${term.label}${cls ? ` · Class teacher of ${cls.name}` : ''}`} />

      {pendingConfirm && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The school office has not yet confirmed the classes and subjects you said you teach. You can enter marks once it does.</p>}

      {cls && schoolDay && (
        register
          ? <p className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="size-4" />Today’s register for {cls.name} is taken: {register.absent?.length || 0} absent, {register.late?.length || 0} late.</p>
          : <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-sm text-amber-900"><b>Take today’s register</b> for {cls.name}. Parents of absent pupils are told straight away.</p><Link to="/attendance"><Button size="sm" icon={CalendarCheck}>Take the register</Button></Link></div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="My class" value={cls ? cls.name : '—'} icon={GraduationCap} hint={cls ? `${pupils.length} pupils` : 'Not a class teacher'} />
        <StatCard label="Lessons today" value={todays.length} icon={Clock} tone="purple" hint={`${lessons.length} a week`} />
        <StatCard label="Absent today" value={register ? register.absent?.length || 0 : '—'} icon={Users} tone="red" hint={cls ? (register ? 'from today’s register' : 'register not taken') : ''} />
        <StatCard label="Marks to finish" value={missing.length} icon={BookOpenCheck} tone="amber" hint={`of ${progress.length} subject sheets`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Today’s lessons" actions={<Link to="/timetable" className="text-sm font-semibold text-brand-700 hover:underline">My week</Link>}>
          {!schoolDay ? <p className="text-sm text-slate-500">No school today.</p> : todays.length ? (
            <ul className="space-y-2">
              {todays.map((l, i) => (
                <li key={i} className={`rounded-md border px-3 py-2 text-sm ${l.period.start <= new Date().toTimeString().slice(0, 5) && new Date().toTimeString().slice(0, 5) < l.period.end ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                  <p className="font-semibold text-slate-800">{l.subject}</p>
                  <p className="text-xs text-slate-500">{l.period.start}–{l.period.end} · {db.classes.find((c) => c.id === l.classId)?.name}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No lessons on your timetable today.</p>}
        </Card>

        <Card title="Marks this term" className="xl:col-span-2" actions={<Link to="/academics" className="text-sm font-semibold text-brand-700 hover:underline">Enter marks</Link>}>
          {!progress.length ? <p className="text-sm text-slate-500">No subjects assigned to you yet.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {progress.map((p) => (
                <li key={`${p.c.id}-${p.subject}`} className="text-sm">
                  <div className="flex justify-between gap-2"><span className="truncate"><b className="text-slate-800">{p.subject}</b> · {p.c.name}</span><span className="shrink-0 text-slate-500 tabular-nums">{p.done}/{p.total}</span></div>
                  <Progress value={p.done} max={p.total || 1} tone={p.total && p.done >= p.total ? 'bg-emerald-500' : 'bg-amber-500'} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Shortcuts">
          <div className="grid gap-2">
            {[['/academics', 'Enter marks'], ...(cls ? [['/attendance', 'Daily attendance'], ['/my-class', 'My class list']] : []), ['/timetable', 'My timetable'], ['/me', 'My payslips']].map(([to, l]) => (
              <Link key={to} to={to} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{l}<ArrowRight className="size-4" /></Link>
            ))}
          </div>
        </Card>
        <div className="xl:col-span-2">
          <Card title="School news" actions={<Badge tone="slate">{fmtDate(day)}</Badge>}>
            {news.length ? <AnnouncementList items={news} /> : <p className="text-sm text-slate-500">No announcements.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
