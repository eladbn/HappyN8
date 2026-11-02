import crypto from 'node:crypto';
import { verifyPassword } from './users.js';

const COOKIE = 'fb_session';
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const LOCAL_USER = { id: 0, username: 'local', display_name: 'Local user', role: 'admin', disabled: 0, token_version: 0 };

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Session token: userId.tokenVersion.expiry.signature — bumping tokenVersion revokes all sessions of a user. */
export function createToken(secret, userId, tokenVersion, hours, now = Date.now()) {
  const payload = `${userId}.${tokenVersion}.${now + hours * 3600 * 1000}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function parseToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || !parts.slice(0, 3).every((p) => /^\d+$/.test(p))) return null;
  const [uid, tv, exp, sig] = parts;
  if (Number(exp) < now) return null;
  if (!safeEqual(sig, sign(secret, `${uid}.${tv}.${exp}`))) return null;
  return { userId: Number(uid), tokenVersion: Number(tv) };
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** Username/password sign-in against HappyN8's own users, with signed HttpOnly cookies and roles. */
export function createAuth(cfg, users, audit) {
  const attempts = new Map();

  function cookieAttrs(maxAgeSec) {
    const parts = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
    if (cfg.secureCookie) parts.push('Secure');
    return parts.join('; ');
  }

  function issue(res, user) {
    const token = createToken(cfg.sessionSecret, user.id, user.token_version, cfg.sessionHours);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs(cfg.sessionHours * 3600)}`);
  }

  function currentUser(req) {
    if (cfg.authDisabled) return LOCAL_USER;
    const t = parseToken(cfg.sessionSecret, readCookie(req, COOKIE));
    if (!t) return null;
    const u = users.get(t.userId);
    if (!u || u.disabled || u.token_version !== t.tokenVersion) return null;
    return u;
  }

  function limited(key, now) {
    const e = attempts.get(key);
    return !!e && now - e.first <= WINDOW_MS && e.count >= MAX_ATTEMPTS;
  }

  function fail(key, now) {
    const e = attempts.get(key);
    if (!e || now - e.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
    else e.count += 1;
  }

  function login(req, res) {
    if (cfg.authDisabled) return res.json({ ok: true });
    const now = Date.now();
    const ip = req.ip || 'unknown';
    if (limited(ip, now)) return res.status(429).json({ message: 'Too many attempts. Try again in 15 minutes.' });
    const { username, password } = req.body || {};
    const u = typeof username === 'string' ? users.byUsername(username) : null;
    const ok = u && typeof password === 'string' && verifyPassword(password, u.password_hash);
    if (!ok || u.disabled) {
      fail(ip, now);
      return res.status(401).json({ message: u && u.disabled && ok ? 'This account is disabled. Ask an admin.' : 'Wrong username or password' });
    }
    attempts.delete(ip);
    users.touchLogin(u.id);
    audit?.record({ user: u, action: 'signed in', entityType: 'user', entityId: String(u.id), entityName: u.display_name });
    issue(res, u);
    return res.json({ ok: true });
  }

  function logout(_req, res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);
    res.json({ ok: true });
  }

  /** Requires a valid session; mutating requests must carry X-HappyN8 (CSRF guard). */
  function requireAuth(req, res, next) {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ message: 'Not signed in' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-happyn8'] !== '1') {
      return res.status(403).json({ message: 'Missing X-HappyN8 header' });
    }
    req.user = u;
    return next();
  }

  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Your role does not allow this' });
    return next();
  };

  return { login, logout, requireAuth, requireRole, currentUser, issue };
}
