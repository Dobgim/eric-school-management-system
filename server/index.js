// Starts the API (and the built web app, if dist/ exists) on one port. Used by `npm run dev` and `npm start`.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import app, { init } from './app.js';
import { db } from './db.js';
import { momoMode } from './momo.js';

const PORT = Number(process.env.PORT) || 4000;
await init();
const conn = await db();
app.listen(PORT, () => {
  console.log(`  API ready on http://localhost:${PORT}  ·  database: ${conn.kind}  ·  payments: ${momoMode()}`);
  if (existsSync(new URL('../dist', import.meta.url))) console.log('  Web app served from dist/ on the same port');
});
