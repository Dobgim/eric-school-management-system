// Wipes ALL school data and accounts, then recreates the clean starting point.
// Usage: npm run db:reset -- --yes
import 'dotenv/config';
import { db } from './db.js';
import { ensureSetup } from './setup.js';

if (!process.argv.includes('--yes')) {
  console.log('This deletes every pupil, payment, staff record and account in the database.\nRun again with --yes to confirm:  npm run db:reset -- --yes');
  process.exit(1);
}
const conn = await db();
console.log(`Resetting ${conn.kind}…`);
await conn.tx(async (q) => {
  // Phone registrations belong to the accounts being deleted. Saved keys (Fapshi, push) are configuration and stay.
  for (const t of ['records', 'kv', 'counters', 'users', 'push_subscriptions']) await q(`delete from ${t}`);
});
await ensureSetup();
await conn.close?.();
console.log('Done.');
process.exit(0);
