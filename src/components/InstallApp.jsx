import { useState } from 'react';
import { Download, PlusSquare, RefreshCw, Share, Smartphone, X } from 'lucide-react';
import { applyUpdate, promptInstall, usePwa } from '../lib/pwa';
import { Button, Modal } from './ui';

const DISMISS_KEY = 'sis:install-dismissed';
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };

function IosSteps() {
  return (
    <ol className="space-y-3 text-sm text-slate-700">
      <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">1</span><span>Open this page in <b>Safari</b>.</span></li>
      <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">2</span><span>Tap the <b>Share</b> button <Share className="inline size-4 align-text-bottom" /> at the bottom of the screen.</span></li>
      <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">3</span><span>Scroll down and tap <b>Add to Home Screen</b> <PlusSquare className="inline size-4 align-text-bottom" />, then <b>Add</b>.</span></li>
    </ol>
  );
}

function OtherSteps() {
  return (
    <ol className="space-y-3 text-sm text-slate-700">
      <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">1</span><span>Open this page in <b>Chrome</b> (Android) or <b>Chrome / Edge</b> (computer).</span></li>
      <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">2</span><span>Open the browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</span></li>
    </ol>
  );
}

/** "Install app" button: native prompt where supported, instructions otherwise. Hidden once installed. */
export function InstallButton({ className, variant = 'secondary', size, label = 'Install app' }) {
  const pwa = usePwa();
  const [help, setHelp] = useState(false);
  if (pwa.installed) return null;
  const click = () => (pwa.canPrompt ? promptInstall() : setHelp(true));
  return (
    <>
      <Button variant={variant} size={size} icon={Download} className={className} onClick={click}>{label}</Button>
      <Modal open={help} onClose={() => setHelp(false)} size="sm" title="Install the school app">
        {pwa.ios ? <IosSteps /> : <OtherSteps />}
        <p className="mt-4 text-xs text-slate-500">The app then opens from your home screen like any other app — full screen, and it still works without internet.</p>
      </Modal>
    </>
  );
}

/** Dismissible card encouraging parents to install the app. */
export function InstallCard({ schoolName }) {
  const pwa = usePwa();
  const [hidden, setHidden] = useState(dismissed);
  if (pwa.installed || hidden) return null;
  const hide = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <div className="relative mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
      <img src="/icons/icon-192.png" alt="" className="size-14 rounded-2xl" />
      <div className="min-w-48 flex-1">
        <p className="font-bold text-slate-900">Get the {schoolName} app</p>
        <p className="text-sm text-slate-600">Install it on your phone to pay fees, get receipts and see news in one tap — even without internet.</p>
      </div>
      <InstallButton variant="primary" label="Install app" />
      <button type="button" onClick={hide} className="absolute top-2 right-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss"><X className="size-4" /></button>
    </div>
  );
}

/** Banner shown when a new version of the app has been downloaded. */
export function UpdateBanner() {
  const { updateReady } = usePwa();
  if (!updateReady) return null;
  return (
    <div className="no-print flex flex-wrap items-center justify-center gap-3 bg-brand-900 px-4 py-2 text-sm text-white">
      <Smartphone className="size-4" /> A new version of the app is ready.
      <button type="button" onClick={applyUpdate} className="inline-flex items-center gap-1.5 rounded-lg bg-accent-400 px-3 py-1 font-semibold text-slate-900 hover:bg-accent-500"><RefreshCw className="size-3.5" />Update now</button>
    </div>
  );
}
