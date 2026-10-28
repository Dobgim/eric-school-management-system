// Pure translation of one piece of English UI text into French (no browser needed: also used by the server
// for phone notifications and SMS). Unknown text is returned unchanged, so names and typed content stay as they are.
import { EXACT, FRAGMENTS, PATTERNS } from './i18n-fr.js';

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const fragmentKeys = Object.keys(FRAGMENTS).sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fragmentRe = fragmentKeys.length ? new RegExp(fragmentKeys.map(escape).join('|'), 'g') : null;

function core(text) {
  const exact = EXACT[text];
  if (exact !== undefined) return exact;
  for (const [re, rep] of PATTERNS) {
    if (re.test(text)) {
      // Parts captured by the pattern (subject names, terms…) are translated too when the dictionary knows them.
      const out = text.replace(re, typeof rep === 'function'
        ? (whole, ...m) => rep(whole, ...m.map((g) => (typeof g === 'string' && EXACT[g] !== undefined ? EXACT[g] : g)))
        : (...m) => rep.replace(/\$(\d)/g, (_, i) => translateText(m[Number(i)] ?? '', 'fr')));
      return out;
    }
  }
  // "A · B · C": translate each part on its own.
  for (const sep of [' · ', '  |  ', ' | ']) {
    if (!text.includes(sep)) continue;
    const parts = text.split(sep);
    const done = parts.map((p) => core(p) ?? p);
    if (done.some((p, i) => p !== parts[i])) return done.join(sep);
  }
  if (fragmentRe) {
    fragmentRe.lastIndex = 0;
    if (fragmentRe.test(text)) {
      fragmentRe.lastIndex = 0;
      return text.replace(fragmentRe, (f) => FRAGMENTS[f]);
    }
  }
  return null;
}

/** French for `text` when lang is 'fr' (keeps the text's leading and trailing spaces), otherwise the text itself. */
export function translateText(text, lang) {
  if (lang !== 'fr' || !text || !/[A-Za-z]/.test(text)) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  const out = core(norm(text));
  return out === null ? text : lead + out + trail;
}
