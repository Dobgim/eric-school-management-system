// French / English. The app is written in English; when French is chosen, every piece of interface text is swapped
// for its French version as it appears on screen (and in PDFs), using the dictionary in i18n-fr.js.
// What people type (names, messages, class names) is never changed.
import { translateText } from './i18n-core.js';

const KEY = 'sis:lang';
let lang = 'en';
try { lang = localStorage.getItem(KEY) || ((navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'); } catch { /* storage blocked */ }

globalThis.__sisLang = lang; // read by the date formatting in utils.js
export const getLang = () => lang;
export const t = (text) => translateText(text, lang);

/** Switch language: remembered on this device, sent to the server for phone messages, then the app reloads. */
export async function setLang(next) {
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  try { await fetch('/api/auth/lang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ lang: next }) }); } catch { /* offline: sent at next sign-in */ }
  window.location.reload();
}

// Never touch what people type (input values, text areas) or code; hints on inputs (placeholder…) are translated.
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'title', 'aria-label'];
const skip = (el) => !el || el.closest?.('[data-no-translate], .font-mono') || SKIP.has(el.tagName);

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (skip(node.parentElement)) return;
    const next = t(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest('[data-no-translate]')) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v) { const n = t(v); if (n !== v) node.setAttribute(a, n); }
  }
  if (skip(node)) return;
  for (const child of node.childNodes) translateNode(child);
}

/** Start translating the page (does nothing in English). */
export function initI18n() {
  document.documentElement.lang = lang;
  if (lang !== 'fr') return;
  translateNode(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateNode(r.target);
      else if (r.type === 'attributes') translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
