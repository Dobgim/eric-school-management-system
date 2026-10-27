// Mobile Money helpers for the Pay Fees page. The actual collection runs on the server (server/momo.js).

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

