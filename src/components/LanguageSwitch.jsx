import { Languages } from 'lucide-react';
import { getLang, setLang } from '../lib/i18n';

/** English / Français. Kept out of translation so both names always read correctly. */
export default function LanguageSwitch({ compact = false, className = '' }) {
  const lang = getLang();
  if (compact) {
    return (
      <button type="button" data-no-translate onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} className={`inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 ${className}`} aria-label={lang === 'fr' ? 'Switch to English' : 'Passer en français'} title={lang === 'fr' ? 'English' : 'Français'}>
        <Languages className="size-4" />{lang === 'fr' ? 'EN' : 'FR'}
      </button>
    );
  }
  return (
    <div data-no-translate className={`inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs font-semibold ${className}`} role="group" aria-label="Language / Langue">
      {[['en', 'English'], ['fr', 'Français']].map(([id, label]) => (
        <button key={id} type="button" onClick={() => id !== lang && setLang(id)} aria-pressed={lang === id} className={`rounded px-2.5 py-1 ${lang === id ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
      ))}
    </div>
  );
}
