import crypto from 'node:crypto';
import { nowIso } from './db.js';

export const ROLES = ['admin', 'editor', 'viewer'];
const USERNAME = /^[a-zA-Z0-9._@-]{2,64}$/;
export const MIN_PASSWORD = 8;

export class UserError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

/** Public shape of a user (never includes the hash). */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, displayName: u.display_name, role: u.role,
    disabled: !!u.disabled, createdAt: u.created_at, lastLoginAt: u.last_login_at,
  };
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new UserError(400, `Passwords need at least ${MIN_PASSWORD} characters`);
}

export function createUsers(db) {
  const q = {
    all: db.prepare('SELECT * FROM users ORDER BY disabled, display_name COLLATE NOCASE'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    byName: db.prepare('SELECT * FROM users WHERE username = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM users'),
    admins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0"),
    insert: db.prepare('INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'),
    login: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM users WHERE id = ?'),
  };

  const get = (id) => q.byId.get(Number(id)) || null;

  function create({ username, displayName, password, role }, { skipPasswordRules = false } = {}) {
    const name = String(username || '').trim();
    if (!USERNAME.test(name)) throw new UserError(400, 'Usernames are 2-64 letters, digits, dots, dashes, underscores or @');
    if (!ROLES.includes(role)) throw new UserError(400, 'Role must be admin, editor or viewer');
    if (!skipPasswordRules) checkPassword(password);
    if (q.byName.get(name)) throw new UserError(409, 'That username is taken');
    const res = q.insert.run(name, String(displayName || name).trim().slice(0, 80) || name, hashPassword(password), role, nowIso());
    return get(res.lastInsertRowid);
  }

  /** Applies a partial update. Guards against removing the last active admin. */
  function update(id, patch, actorId) {
    const u = get(id);
    if (!u) throw new UserError(404, 'User not found');
    const sets = [];
    const vals = [];
    const losingAdmin = (patch.role && patch.role !== 'admin' && u.role === 'admin') || (patch.disabled === true && u.role === 'admin' && !u.disabled);
    if (losingAdmin && q.admins.get().n <= 1) throw new UserError(400, 'There must be at least one active admin');
    if (Number(id) === Number(actorId) && (patch.disabled === true || (patch.role && patch.role !== u.role))) {
      throw new UserError(400, "You can't change your own role or disable yourself");
    }
    if (patch.displayName !== undefined) {
      const dn = String(patch.displayName).trim().slice(0, 80);
      if (!dn) throw new UserError(400, 'Display name is required');
      sets.push('display_name = ?'); vals.push(dn);
    }
    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role)) throw new UserError(400, 'Role must be admin, editor or viewer');
      sets.push('role = ?'); vals.push(patch.role);
    }
    if (patch.disabled !== undefined) {
      sets.push('disabled = ?'); vals.push(patch.disabled ? 1 : 0);
      if (patch.disabled) sets.push('token_version = token_version + 1');
    }
    if (patch.password !== undefined) {
      checkPassword(patch.password);
      sets.push('password_hash = ?'); vals.push(hashPassword(patch.password));
      sets.push('token_version = token_version + 1');
    }
    if (!sets.length) return u;
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, Number(id));
    return get(id);
  }

  function remove(id, actorId) {
    const u = get(id);
    if (!u) throw new UserError(404, 'User not found');
    if (Number(id) === Number(actorId)) throw new UserError(400, "You can't delete yourself");
    if (u.role === 'admin' && !u.disabled && q.admins.get().n <= 1) throw new UserError(400, 'There must be at least one active admin');
    q.del.run(Number(id));
  }

  /** Creates the first admin from APP_PASSWORD when the database has no users. */
  function bootstrap(cfg) {
    if (q.count.get().n > 0) return null;
    if (!cfg.appPassword) {
      if (cfg.authDisabled) return null;
      throw new Error('No users exist yet. Set APP_PASSWORD (and optionally ADMIN_USERNAME) to create the first admin.');
    }
    return create({ username: cfg.adminUsername, displayName: 'Administrator', password: cfg.appPassword, role: 'admin' }, { skipPasswordRules: true });
  }

  return {
    list: () => q.all.all(),
    get,
    byUsername: (name) => q.byName.get(String(name || '').trim()) || null,
    create, update, remove, bootstrap,
    touchLogin: (id) => q.login.run(nowIso(), id),
    count: () => q.count.get().n,
  };
}
