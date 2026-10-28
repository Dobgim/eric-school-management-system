import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { DATA_DIR, databaseUrl, db } from './db.js';

const scrypt = promisify(scryptCb);
export const COOKIE = 'sis_session';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(String(password), Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// JWT_SECRET should be set in production. Locally a random secret is generated once and kept in .data/.
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Hosts without a lasting disk (Vercel): fall back to a value derived from the database credentials so
  // sessions survive restarts. Setting JWT_SECRET is still recommended.
  if (databaseUrl()) return createHash('sha256').update(`sis-session|${databaseUrl()}`).digest('hex');
  const file = join(DATA_DIR, 'jwt-secret');
  if (!existsSync(file)) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(file, randomBytes(48).toString('hex'));
  }
  return readFileSync(file, 'utf8').trim();
}

export const toClientUser = (row) => row && ({
  id: row.id, name: row.name, username: row.username, role: row.role,
  staffId: row.staff_id || null, guardianId: row.guardian_id || null,
  active: row.active, lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
  status: row.status || 'active', phone: row.phone || '', email: row.email || '',
  requestedRole: row.requested_role || null, signup: row.signup || null, reviewNote: row.review_note || '',
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
});

export function setSessionCookie(req, res, user) {
  const token = jwt.sign({ sub: user.id }, secret(), { expiresIn: '30d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 24 * 3600 * 1000, path: '/' });
}

export const clearSessionCookie = (res) => res.clearCookie(COOKIE, { path: '/' });

/** Resolve the signed-in user from the session cookie; 401 if missing, expired or deactivated. */
export async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const { sub } = jwt.verify(token, secret());
    const { rows } = await (await db()).query('select * from users where id = $1', [sub]);
    if (!rows[0] || !rows[0].active || (rows[0].status || 'active') !== 'active') { clearSessionCookie(res); return res.status(401).json({ error: 'Account not available' }); }
    req.user = toClientUser(rows[0]);
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}

// Simple in-memory brake on password guessing: 8 failures per username+IP per 15 minutes.
const failures = new Map();
const WINDOW = 15 * 60 * 1000;
export function loginBlocked(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW) { failures.delete(key); return false; }
  return f.count >= 8;
}
export function recordFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW) failures.set(key, { first: Date.now(), count: 1 });
  else f.count++;
}
export const clearFailures = (key) => failures.delete(key);
