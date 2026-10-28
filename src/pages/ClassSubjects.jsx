import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useStore } from '../lib/store';
import { classSubjects } from '../lib/subjects';
import { Badge, Button, Card, PageHeader, useToast } from '../components/ui';
import { SubjectsEditor } from './Academics';

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Every class with its subjects, coefficients and who teaches each one. The office edits a class's subjects here;
 * they appear on the marks pages, the report cards and the teacher sign-up form.
 */
export default function ClassSubjects() {
  const { db } = useStore();
  const [toast, notify] = useToast();
  const [editing, setEditing] = useState(null);
  const classes = [...db.classes].sort((a, b) => a.order - b.order);
  const teacherOf = (c, subject) => {
    const t = db.staff.filter((s) => s.status === 'active' && (s.teaching || []).some((x) => same(x.subject, subject) && (x.classIds || []).includes(c.id)));
    if (t.length) return t.map((s) => `${s.firstName} ${s.lastName}`).join(', ');
    const ct = db.staff.find((s) => s.id === c.teacherId);
    return ct ? `${ct.firstName} ${ct.lastName} (class teacher)` : null;
  };
  return (
    <>
      {toast}
      <PageHeader title="Subjects by class" subtitle="The subjects each class studies, with their coefficients and teachers. Edit a class to put in its real subjects; they are used for marks and report cards." />
      <div className="grid gap-4 lg:grid-cols-2">
        {classes.map((c) => {
          const subjects = classSubjects(c);
          const total = subjects.reduce((t, s) => t + Number(s.coef || 1), 0);
          return (
            <Card key={c.id} bodyClass="" title={<span>{c.name} {!c.subjects?.length && <Badge tone="amber" className="ml-2 align-middle">Default list</Badge>}</span>}
              actions={<Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(c)}>Edit subjects</Button>}>
              <table className="table-base">
                <thead><tr><th>Subject</th><th className="text-center">Coef</th><th>Teacher</th></tr></thead>
                <tbody>
                  {subjects.map((s) => {
                    const t = teacherOf(c, s.name);
                    return (
                      <tr key={s.name}>
                        <td className="font-medium text-slate-800">{s.name}</td>
                        <td className="text-center tabular-nums">{s.coef}</td>
                        <td className={t ? 'text-slate-600' : 'text-amber-700'}>{t || 'No teacher yet'}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold"><td>{subjects.length} subjects</td><td className="text-center tabular-nums">{total}</td><td /></tr>
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
      {editing && <SubjectsEditor cls={editing} onClose={() => setEditing(null)} onSaved={() => notify(`Subjects saved for ${editing.name}.`)} />}
    </>
  );
}
