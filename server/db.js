// Database connection. Uses PostgreSQL from DATABASE_URL (Neon, Supabase, Render, your own server…).
// Without DATABASE_URL it falls back to PGlite — real Postgres embedded in Node, stored in .data/ —
// so the app runs locally with no database to install.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Local data lives outside server/ so `node --watch` does not restart on every database write.
export const DATA_DIR = join(here, '..', '.data');

let impl;

async function connect() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const url = process.env.DATABASE_URL;
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({ connectionString: url, ssl: local || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false }, max: 10 });
    await pool.query('select 1');
    impl = {
      kind: `PostgreSQL (${new URL(url).hostname})`,
      query: (sql, params) => pool.query(sql, params),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const out = await fn((sql, params) => client.query(sql, params));
          await client.query('commit');
          return out;
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    mkdirSync(DATA_DIR, { recursive: true });
    const lite = new PGlite(join(DATA_DIR, 'pgdata'));
    await lite.waitReady;
    impl = {
      kind: 'PGlite (local file database in .data/ — set DATABASE_URL for a hosted database)',
      query: (sql, params) => lite.query(sql, params),
      tx: (fn) => lite.transaction((t) => fn((sql, params) => t.query(sql, params))),
      close: () => lite.close(),
    };
  }
  // Create tables on first run (every statement is idempotent). Comments are stripped before splitting on ';'.
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '');
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await impl.query(stmt);
  return impl;
}

let ready;
export const db = () => (ready ||= connect());
