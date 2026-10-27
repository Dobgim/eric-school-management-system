// Mobile Money collection for parents paying from the portal.
//
// DEMO MODE: no money moves. requestCollection() simulates the operator's flow
// (push prompt → customer enters PIN → callback). To take real payments, sign up with a
// Cameroon aggregator (e.g. Campay, Notch Pay, Monetbil) or the MTN MoMo / Orange Money
// APIs, and replace requestCollection() with a call to YOUR server, which holds the API keys
// and confirms the payment through the provider's webhook. Never put API keys in this file.

const MTN = /^(67\d|65[0-4]|68[0-4])\d{6}$/;
const ORANGE = /^(69\d|65[5-9]|68[5-9])\d{6}$/;

export const normalizePhone = (p = '') => p.replace(/\D/g, '').replace(/^237/, '');

export function detectOperator(phone) {
  const n = normalizePhone(phone);
  if (MTN.test(n)) return 'mtn';
  if (ORANGE.test(n)) return 'orange';
  return null;
}

export const OPERATORS = {
  mtn: { label: 'MTN Mobile Money', short: 'MTN MoMo', ussd: '*126#', color: 'bg-yellow-400 text-slate-900' },
  orange: { label: 'Orange Money', short: 'Orange Money', ussd: '#150#', color: 'bg-orange-500 text-white' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the operator to collect `amount` from `phone`. Calls onStatus('prompted') once the
 * customer has a PIN prompt on their phone. Resolves { ok, transactionId } or { ok: false, reason }.
 * Demo rule: numbers ending in 000 are declined, so the failure path can be tried.
 */
export async function requestCollection({ operator, phone, amount }, onStatus = () => {}) {
  const n = normalizePhone(phone);
  if (detectOperator(n) !== operator) return { ok: false, reason: `${n} is not a valid ${OPERATORS[operator].label} number.` };
  if (!(amount > 0)) return { ok: false, reason: 'Amount must be greater than zero.' };
  await sleep(900);
  onStatus('prompted');
  await sleep(2600);
  if (n.endsWith('000')) return { ok: false, reason: 'The payment was declined on the phone or the balance is insufficient.' };
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 12);
  const transactionId = `${operator === 'mtn' ? 'MP' : 'PP'}${stamp}.${Math.floor(1000 + Math.random() * 9000)}`;
  return { ok: true, transactionId };
}
