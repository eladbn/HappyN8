import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * Reads and validates configuration from environment variables.
 * Throws with a readable message when something required is missing.
 */
function parsePort(value) {
  if (value === undefined || value === '') return 8080;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT must be a whole number between 1 and 65535 (got "${value}")`);
  return port;
}

export function loadConfig(env = process.env) {
  // N8N_URL is optional: an admin can also set the n8n address in the app (Manage → n8n connection).
  const n8nUrl = trimUrl(env.N8N_URL);
  if (n8nUrl && !/^https?:\/\//.test(n8nUrl)) throw new Error('N8N_URL must start with http:// or https://');
  const n8nPublicUrl = trimUrl(env.N8N_PUBLIC_URL);
  if (n8nPublicUrl && !/^https?:\/\//.test(n8nPublicUrl)) throw new Error('N8N_PUBLIC_URL must start with http:// or https://');
  if (!env.N8N_API_KEY) throw new Error('N8N_API_KEY is required (n8n → Settings → n8n API → Create API key)');

  const authDisabled = env.AUTH_DISABLED === 'true';

  return {
    port: parsePort(env.PORT),
    /** Effective addresses; replaced by the in-app setting when one is saved (see settings.js). */
    n8nUrl,
    n8nPublicUrl: n8nPublicUrl || n8nUrl,
    /** The .env values, kept so the app can fall back to them when the in-app setting is cleared. */
    envN8nUrl: n8nUrl,
    envN8nPublicUrl: n8nPublicUrl,
    apiKey: env.N8N_API_KEY,
    n8nEmail: env.N8N_EMAIL || '',
    n8nPassword: env.N8N_PASSWORD || '',
    appPassword: env.APP_PASSWORD || '',
    authDisabled,
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    sessionHours: Number(env.SESSION_HOURS || 168),
    secureCookie: env.COOKIE_SECURE === 'true',
    staticDir: env.STATIC_DIR || path.resolve(here, '../../web/dist'),
    /** Where HappyN8 keeps its own database (users, audit log). Use a Docker volume. The file keeps its original name so existing data carries over. */
    dbFile: env.DB_FILE || path.join(env.DATA_DIR || path.resolve(here, '../data'), 'flowboard.db'),
    /** Username of the first admin, created from APP_PASSWORD when there are no users yet. */
    adminUsername: (env.ADMIN_USERNAME || 'admin').trim(),
    auditRetentionDays: Number(env.AUDIT_RETENTION_DAYS || 730),
  };
}
