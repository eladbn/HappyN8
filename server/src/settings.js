import { nowIso } from './db.js';

export class SettingsError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/**
 * Turns what an admin typed ("192.168.1.20:5678", "https://n8n.example.com/") into a clean base URL.
 * Empty input returns '' (meaning "use the .env value").
 */
export function normalizeN8nUrl(input, label = 'n8n address') {
  let value = String(input ?? '').trim();
  if (!value) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;
  let u;
  try { u = new URL(value); } catch { throw new SettingsError(`The ${label} is not a valid address`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SettingsError(`The ${label} must start with http:// or https://`);
  if (!u.hostname) throw new SettingsError(`The ${label} needs a host name or IP`);
  if (u.username || u.password) throw new SettingsError(`The ${label} must not contain a user name or password`);
  if (u.search || u.hash) throw new SettingsError(`The ${label} must not contain ? or #`);
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}

/** Small key/value store for settings admins change from the app. */
export function createSettings(db) {
  const q = {
    get: db.prepare('SELECT value FROM settings WHERE key = ?'),
    set: db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
                     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`),
    del: db.prepare('DELETE FROM settings WHERE key = ?'),
  };
  return {
    get: (key) => q.get.get(key)?.value ?? '',
    /** Saves a value; an empty value removes the key. */
    set(key, value, userLabel = null) {
      if (value) q.set.run(key, value, nowIso(), userLabel);
      else q.del.run(key);
    },
  };
}

/**
 * Points cfg at the effective n8n address: the one saved in the app wins, then the .env value.
 * cfg is shared by the n8n client and the routes, so changes apply immediately.
 */
export function applyN8nAddress(cfg, settings) {
  cfg.n8nUrl = settings.get('n8n.url') || cfg.envN8nUrl;
  cfg.n8nPublicUrl = settings.get('n8n.publicUrl') || cfg.envN8nPublicUrl || cfg.n8nUrl;
}
