// Server-only secrets (payment provider keys, push keys), stored encrypted with AES-256-GCM.
// The encryption key comes from SIS_ENCRYPTION_KEY, or else from the session secret (JWT_SECRET).
// Changing that secret makes stored values unreadable; they then have to be entered again.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { secret } from './auth.js';

const key = () => createHash('sha256').update(`sis-secrets|${process.env.SIS_ENCRYPTION_KEY || secret()}`).digest();

export function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decrypt(text) {
  const [v, iv, tag, data] = String(text).split('.');
  if (v !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export async function getSecret(q, name) {
  const { rows } = await q('select value from secrets where key = $1', [name]);
  return rows[0] ? decrypt(rows[0].value) : null;
}

export async function setSecret(q, name, value) {
  if (value == null) return q('delete from secrets where key = $1', [name]);
  return q(`insert into secrets (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`, [name, encrypt(value)]);
}
