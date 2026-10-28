import { useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import { useStore } from '../lib/store';
import { teachingLines } from '../lib/subjects';
import { exportTablePDF } from '../lib/exporters';
import { Avatar, Badge, Card, Empty, ExportButtons, PageHeader, SearchInput, Tabs } from '../components/ui';

/** Who teaches what: every teacher with their subjects and classes, and every class with its teachers. */
export default function Teachers() {
  const { db, user } = useStore();
  const [tab, setTab] = useState('teachers');
  const [q, setQ] = useState('');
  const classes = useMemo(() => [...db.classes].sort((a, b) => a.order - b.order), [db.classes]);
  const myClassIds = new Set(user.role === 'parent' ? db.students.map((s) => s.classId) : []);

  const teachers = useMemo(() => db.staff
    .filter((s) => s.status === 'active' && (s.category === 'teaching' || (s.teaching || []).length || classes.some((c) => c.teacherId === s.id)))
    .map((s) => ({ ...s, name: `${s.firstName} ${s.lastName}`, lines: teachingLines(s, classes), classTeacherOf: classes.filter((c) => c.teacherId === s.id) }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName)), [db.staff, classes]);

  const byClass = useMemo(() => classes.map((c) => {
    const subjects = [];
    for (const t of teachers) for (const l of t.lines) if (l.classes.some((x) => x.id === c.id)) subjects.push({ subject: l.subject, teacher: t });
    subjects.sort((a, b) => a.subject.localeCompare(b.subject));
    return { ...c, classTeacher: teachers.find((t) => t.id === c.teacherId), subjects };
  }), [classes, teachers]);

  const term = q.trim().toLowerCase();
  const shownTeachers = teachers.filter((t) => !term || `${t.name} ${t.position} ${t.lines.map((l) => l.subject).join(' ')}`.toLowerCase().includes(term));
  const shownClasses = byClass.filter((c) => !term || `${c.name} ${c.classTeacher?.name || ''} ${c.subjects.map((s) => `${s.subject} ${s.teacher.name}`).join(' ')}`.toLowerCase().includes(term));

  const exportPdf = () => (tab === 'teachers'
    ? exportTablePDF({
      school: db.school, title: 'Teachers and Subjects', filename: 'Teachers and subjects',
      columns: [{ key: 'name', label: 'Teacher' }, { key: 'position', label: 'Position' }, { key: 'ct', label: 'Class teacher of' }, { key: 'subjects', label: 'Subjects and classes' }],
      rows: shownTeachers.map((t) => ({ ...t, ct: t.classTeacherOf.map((c) => c.name).join(', ') || '-', subjects: t.lines.map((l) => `${l.subject}: ${l.classes.map((c) => c.name).join(', ') || '-'}`).join('\n') || '-' })),
    })
    : exportTablePDF({
      school: db.school, title: 'Teachers by Class', filename: 'Teachers by class',
      columns: [{ key: 'name', label: 'Class' }, { key: 'ct', label: 'Class teacher' }, { key: 'subjects', label: 'Subject teachers' }],
      rows: shownClasses.map((c) => ({ ...c, ct: c.classTeacher?.name || 'Unassigned', subjects: c.subjects.map((s) => `${s.subject}: ${s.teacher.name}`).join('\n') || '-' })),
    }));

  return (
    <>
      <PageHeader title="Teachers & subjects" subtitle="Who teaches each class, and the subjects every teacher takes." />
      <Tabs tabs={[{ id: 'teachers', label: 'By teacher', count: teachers.length }, { id: 'classes', label: 'By class', count: classes.length }]} value={tab} onChange={setTab} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={q} onChange={setQ} placeholder={tab === 'teachers' ? 'Search teacher or subject…' : 'Search class, subject or teacher…'} className="w-full sm:w-80" />
        <ExportButtons onPdf={exportPdf} />
      </div>

      {tab === 'teachers' ? (
        shownTeachers.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shownTeachers.map((t) => (
              <Card key={t.id} bodyClass="p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={t.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.position}</p>
                    {t.phone && <a href={`tel:${t.phone}`} className="mt-1 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><Phone className="size-3.5" />{t.phone}</a>}
                  </div>
                </div>
                {t.classTeacherOf.length > 0 && (
                  <p className="mt-3 text-sm text-slate-600">Class teacher of {t.classTeacherOf.map((c) => <Badge key={c.id} tone={myClassIds.has(c.id) ? 'amber' : 'green'} className="ml-1">{c.name}</Badge>)}</p>
                )}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {t.lines.length ? (
                    <ul className="space-y-2 text-sm">
                      {t.lines.map((l) => (
                        <li key={l.subject}>
                          <span className="font-medium text-slate-800">{l.subject}</span>
                          <span className="ml-1.5 text-slate-500">{l.classes.length ? l.classes.map((c) => c.name).join(', ') : 'no class set'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-slate-500">{t.classTeacherOf.length ? 'Takes all subjects in their class.' : 'Subjects not listed yet.'}</p>}
                </div>
              </Card>
            ))}
          </div>
        ) : <Card><Empty title="No teachers found" message={term ? 'Try a different search.' : 'Teachers appear here once the school adds them under Staff.'} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shownClasses.map((c) => (
            <Card key={c.id} title={<span>{c.name}{myClassIds.has(c.id) && <Badge tone="amber" className="ml-2 align-middle">Your child</Badge>}</span>} bodyClass="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 text-sm">
                <span className="text-slate-500">Class teacher</span>
                <span className="font-semibold text-slate-800">{c.classTeacher?.name || <span className="font-normal text-slate-400">Not assigned</span>}</span>
              </div>
              {c.subjects.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {c.subjects.map((s) => (
                    <li key={`${s.subject}-${s.teacher.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="text-slate-700">{s.subject}</span>
                      <span className="text-right text-slate-600">{s.teacher.name}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 py-3 text-sm text-slate-500">{c.classTeacher ? 'The class teacher takes all subjects.' : 'No subject teachers listed yet.'}</p>}
            </Card>
          ))}
          {!shownClasses.length && <Card className="md:col-span-2"><Empty title="No classes found" message="Try a different search." /></Card>}
        </div>
      )}
    </>
  );
}
