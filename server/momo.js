// Mobile Money collection, run on the server so parents can never record a payment themselves.
//
// MOMO_MODE=demo (default): no money moves. The phone prompt is simulated; numbers ending in 000 are declined.
// To take real payments, open a merchant account with a Cameroon provider (Campay, Notch Pay, Monetbil, or
// MTN MoMo / Orange Money directly), put its API keys in server/.env, and implement `liveCollect` below:
// start the collection, then wait for the provider's webhook/status check to confirm before returning ok.

const MTN = /^(67\d|65[0-4]|68[0-4])\d{6}$/;
const ORANGE = /^(69\d|65[5-9]|68[5-9])\d{6}$/;

export const normalizePhone = (p = '') => String(p).replace(/\D/g, '').replace(/^237/, '');
export function detectOperator(phone) {
  const n = normalizePhone(phone);
  if (MTN.test(n)) return 'mtn';
  if (ORANGE.test(n)) return 'orange';
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function demoCollect({ operator, phone }) {
  await sleep(2500); // time for the parent to "enter their PIN"
  if (phone.endsWith('000')) return { ok: false, reason: 'The payment was declined on the phone or the balance is insufficient.' };
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 12);
  return { ok: true, transactionId: `${operator === 'mtn' ? 'MP' : 'PP'}${stamp}.${Math.floor(1000 + Math.random() * 9000)}` };
}

// eslint-disable-next-line no-unused-vars
async function liveCollect({ operator, phone, amount, reference }) {
  throw new Error('Live Mobile Money is not configured. Set MOMO_MODE=demo or implement liveCollect() in server/momo.js.');
}

export const momoMode = () => (process.env.MOMO_MODE === 'live' ? 'live' : 'demo');

export async function collect({ operator, phone, amount, reference }) {
  const n = normalizePhone(phone);
  if (detectOperator(n) !== operator) return { ok: false, reason: `${n} is not a valid ${operator === 'mtn' ? 'MTN' : 'Orange'} Mobile Money number.` };
  if (!(amount > 0)) return { ok: false, reason: 'Amount must be greater than zero.' };
  return momoMode() === 'live' ? liveCollect({ operator, phone: n, amount, reference }) : demoCollect({ operator, phone: n });
}
