import { CloudOff, Loader2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { fmtDateTime } from '../lib/utils';

/** What the user saved while offline and is still waiting to be sent. */
export default function OutboxNotice() {
  const { outbox, offline } = useStore();
  if (!outbox.length) return null;
  return (
    <div className="mb-6 rounded-lg border border-l-4 border-slate-200 border-l-accent-500 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        {offline ? <CloudOff className="size-4 text-accent-500" /> : <Loader2 className="size-4 animate-spin text-brand-600" />}
        {offline ? `${outbox.length} item${outbox.length > 1 ? 's' : ''} saved on this phone — will be sent when you’re back online` : 'Sending what you saved offline…'}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {outbox.map((i) => <li key={i.id}>• {i.label} <span className="text-xs text-slate-400">· saved {fmtDateTime(i.createdAt)}</span></li>)}
      </ul>
    </div>
  );
}
