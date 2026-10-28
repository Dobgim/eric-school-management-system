import { useState } from 'react';
import { RotateCcw, Upload } from 'lucide-react';
import { useStore } from '../lib/store';
import { fmtDateTime } from '../lib/utils';
import { Button, Field, Input, Modal } from './ui';

/**
 * Restore a backup file downloaded earlier (super admin). The file is checked and summarised first;
 * the school's records are then replaced. Sign-in accounts are not changed.
 */
export default function RestoreBackup() {
  const { api } = useStore();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setError('');
    if (!f) return;
    try {
      const backup = JSON.parse(await f.text());
      if (backup.app !== 'School Information System' || !backup.data?.students) throw new Error();
      setFile({ name: f.name, size: f.size, backup });
      setTyped('');
    } catch {
      setError('That file is not a backup from this app. Choose a file you downloaded with “Download full backup”.');
    }
  };

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.request('/api/backup/restore', { method: 'POST', body: { backup: file.backup, confirm: typed } });
      await api.reload();
      setDone(r.counts);
      setFile(null);
    } catch (e) {
      setError(e.status === 413 ? 'This backup is too large to upload to the online server in one go. Contact your system provider to restore it.' : e.message);
    } finally { setBusy(false); }
  };

  const d = file?.backup.data;
  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Upload className="size-4" /> Restore from a backup
        <input type="file" accept="application/json,.json" className="hidden" onChange={pick} />
      </label>
      {error && !file && <p className="mt-2 w-full rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {done && <p className="mt-2 w-full rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Backup restored: {done.students} pupils, {done.payments} payments, {done.academicRecords} results.</p>}
      {file && (
        <Modal open onClose={() => setFile(null)} title="Restore this backup?" footer={<>
          <Button variant="secondary" onClick={() => setFile(null)}>Cancel</Button>
          <Button variant="danger" icon={RotateCcw} disabled={busy || typed !== 'RESTORE'} onClick={restore}>{busy ? 'Restoring…' : 'Replace all school data'}</Button>
        </>}>
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">File</dt><dd className="truncate">{file.name}</dd>
              <dt className="text-slate-500">Made on</dt><dd>{fmtDateTime(file.backup.exportedAt)}</dd>
              <dt className="text-slate-500">School</dt><dd>{d.school?.name}</dd>
              <dt className="text-slate-500">Pupils</dt><dd>{d.students.length}</dd>
              <dt className="text-slate-500">Payments</dt><dd>{(d.payments || []).length}</dd>
              <dt className="text-slate-500">Staff</dt><dd>{(d.staff || []).length}</dd>
            </dl>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">Everything recorded <b>after</b> this backup was made (pupils, payments, marks…) will be lost. Download a backup of the current data first if you might need it. Sign-in accounts and passwords are not changed.</p>
            <Field label="Type RESTORE to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoComplete="off" /></Field>
            {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
