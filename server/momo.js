// Mobile Money collection through Fapshi (https://fapshi.com), run on the server so parents can never record
// a payment themselves. The parent only chooses the amount; Fapshi sends the MTN MoMo or Orange Money
// approval prompt to their phone, showing the name of the school's Fapshi service.
//
// The school's Fapshi keys come from FAPSHI_API_USER / FAPSHI_API_KEY (+ FAPSHI_MODE=live|sandbox) on the server,
// or are entered once by the super admin under School Profile → Settings, where they are stored encrypted.
// With no keys, payments run in demo mode: no money moves, and numbers ending in 000 are declined.
import { getSecret } from './secrets.js';

const MTN = /^(67\d|65[0-4]|68[0-4])\d{6}$/;
const ORANGE = /^(69\d|65[5-9]|68[5-9])\d{6}$/;

export const normalizePhone = (p = '') => String(p).replace(/\D/g, '').replace(/^237/, '');
export function detectOperator(phone) {
  const n = normalizePhone(phone);
  if (MTN.test(n)) return 'mtn';
  if (ORANGE.test(n)) return 'orange';
  return null;
}

const BASE = { live: 'https://live.fapshi.com', sandbox: 'https://sandbox.fapshi.com' };

/** The school's payment account: { mode: 'demo' | 'sandbox' | 'live', apiUser?, apiKey?, source }. */
export async function gateway(q) {
  if (process.env.FAPSHI_API_USER && process.env.FAPSHI_API_KEY) {
    return { mode: process.env.FAPSHI_MODE === 'sandbox' ? 'sandbox' : 'live', apiUser: process.env.FAPSHI_API_USER, apiKey: process.env.FAPSHI_API_KEY, source: 'env' };
  }
  const saved = await getSecret(q, 'fapshi');
  if (saved?.apiUser && saved?.apiKey) return { mode: saved.mode === 'sandbox' ? 'sandbox' : 'live', apiUser: saved.apiUser, apiKey: saved.apiKey, source: 'settings' };
  return { mode: 'demo', source: 'none' };
}

export const momoMode = () => (process.env.FAPSHI_API_USER ? `Fapshi ${process.env.FAPSHI_MODE === 'sandbox' ? 'sandbox' : 'live'}` : 'demo unless Fapshi keys are saved in Settings');

async function fapshi(gw, method, path, body) {
  let res;
  try {
    res = await fetch(BASE[gw.mode] + path, {
      method,
      headers: { apiuser: gw.apiUser, apikey: gw.apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw Object.assign(new Error('Could not reach the payment service. Check the connection and try again.'), { status: 502, expose: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `Payment service error (${res.status}).`), { status: res.status === 401 || res.status === 403 ? 502 : 400, expose: true });
  return data;
}

/** Ask Fapshi to send the approval prompt to the parent's phone. Returns { transId }. */
export async function startCollection(gw, { phone, amount, name, externalId, userId, message }) {
  const n = normalizePhone(phone);
  if (!detectOperator(n)) throw Object.assign(new Error(`${n} is not an MTN or Orange Mobile Money number.`), { status: 400, expose: true });
  if (gw.mode === 'demo') return { transId: `DEMO-${Date.now().toString(36).toUpperCase()}${n.endsWith('000') ? '-X' : ''}` };
  const data = await fapshi(gw, 'POST', '/direct-pay', {
    amount: Math.round(amount), phone: n, medium: detectOperator(n) === 'mtn' ? 'mobile money' : 'orange money',
    name: String(name || '').slice(0, 60), externalId, userId, message: String(message || '').slice(0, 120),
  });
  if (!data.transId) throw Object.assign(new Error(data.message || 'The payment could not be started.'), { status: 400, expose: true });
  return { transId: data.transId };
}

/**
 * Where a collection stands: { status: 'pending' | 'successful' | 'failed', reference?, reason? }.
 * Demo payments are approved about 6 seconds after they start (numbers ending in 000 are declined).
 */
export async function collectionStatus(gw, transId, startedAt) {
  if (gw.mode === 'demo' || String(transId).startsWith('DEMO-')) {
    if (Date.now() - new Date(startedAt).getTime() < 6000) return { status: 'pending' };
    if (transId.endsWith('-X')) return { status: 'failed', reason: 'The payment was declined on the phone or the balance is insufficient.' };
    return { status: 'successful', reference: transId };
  }
  const data = await fapshi(gw, 'GET', `/payment-status/${encodeURIComponent(transId)}`);
  const s = String(data.status || '').toUpperCase();
  if (s === 'SUCCESSFUL') return { status: 'successful', reference: data.financialTransId || transId, amount: data.amount };
  if (s === 'FAILED') return { status: 'failed', reason: 'The payment was declined on the phone or the balance is insufficient.' };
  if (s === 'EXPIRED') return { status: 'failed', reason: 'The payment request expired before it was approved. Try again.' };
  return { status: 'pending' };
}

/** Check a set of keys and return the Fapshi service name parents will see on their phone. */
export async function checkAccount(gw) {
  const data = await fapshi(gw, 'GET', '/balance');
  return { service: data.service || '', balance: data.balance, currency: data.currency || 'XAF' };
}
