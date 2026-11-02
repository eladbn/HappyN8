import express from 'express';
import { UserError, publicUser, verifyPassword } from './users.js';

function handle(res, fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof UserError) return res.status(e.status).json({ message: e.message });
    throw e;
  }
}

/** HappyN8's own users, the signed-in account, and the activity log. Mounted behind requireAuth. */
export function createAccountRouter({ users, audit, auth, cfg }) {
  const r = express.Router();
  const adminOnly = auth.requireRole('admin');

  r.get('/me', (req, res) => res.json(publicUser(req.user)));

  r.patch('/me', (req, res) => handle(res, () => {
    if (cfg.authDisabled) return res.status(400).json({ message: 'Accounts are off (AUTH_DISABLED=true)' });
    const u = users.update(req.user.id, { displayName: req.body?.displayName }, req.user.id);
    return res.json(publicUser(u));
  }));

  r.post('/me/password', (req, res) => handle(res, () => {
    if (cfg.authDisabled) return res.status(400).json({ message: 'Accounts are off (AUTH_DISABLED=true)' });
    const { current, next } = req.body || {};
    if (typeof current !== 'string' || !verifyPassword(current, req.user.password_hash)) {
      return res.status(400).json({ message: 'Your current password is not correct' });
    }
    const u = users.update(req.user.id, { password: next }, req.user.id);
    auth.issue(res, u); // other sessions are signed out; this one stays signed in
    audit.record({ user: u, action: 'changed their password', entityType: 'user', entityId: String(u.id), entityName: u.display_name });
    return res.json({ ok: true });
  }));

  // Minimal list for "changed by" filters, available to every role.
  r.get('/people', (_req, res) => {
    res.json(users.list().map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, disabled: !!u.disabled })));
  });

  r.get('/users', adminOnly, (_req, res) => res.json(users.list().map(publicUser)));

  r.post('/users', adminOnly, (req, res) => handle(res, () => {
    const u = users.create(req.body || {});
    audit.record({ user: req.user, action: 'added user', entityType: 'user', entityId: String(u.id), entityName: u.display_name, details: { role: u.role, username: u.username } });
    return res.status(201).json(publicUser(u));
  }));

  r.patch('/users/:id', adminOnly, (req, res) => handle(res, () => {
    const before = users.get(req.params.id);
    const body = req.body || {};
    const patch = {};
    for (const k of ['displayName', 'role', 'disabled', 'password']) if (body[k] !== undefined) patch[k] = body[k];
    const u = users.update(req.params.id, patch, req.user.id);
    const changes = {};
    if (patch.role && before?.role !== u.role) changes.role = { from: before?.role, to: u.role };
    if (patch.disabled !== undefined && !!before?.disabled !== !!u.disabled) changes.disabled = !!u.disabled;
    if (patch.password) changes.password = 'reset';
    if (patch.displayName && before?.display_name !== u.display_name) changes.name = { from: before?.display_name, to: u.display_name };
    if (Object.keys(changes).length) audit.record({ user: req.user, action: 'updated user', entityType: 'user', entityId: String(u.id), entityName: u.display_name, details: changes });
    return res.json(publicUser(u));
  }));

  r.delete('/users/:id', adminOnly, (req, res) => handle(res, () => {
    const u = users.get(req.params.id);
    users.remove(req.params.id, req.user.id);
    audit.record({ user: req.user, action: 'removed user', entityType: 'user', entityId: String(req.params.id), entityName: u?.display_name ?? null });
    return res.json({ ok: true });
  }));

  r.get('/audit', (req, res) => {
    const { userId, entityType, entityId, action, q, before, limit } = req.query;
    res.json(audit.query({ userId, entityType, entityId, action, q, before, limit }));
  });

  r.get('/ownership', (_req, res) => res.json(audit.ownership()));

  r.get('/workflows/:id/version-authors', (req, res) => res.json(audit.versionAuthors(req.params.id)));

  return r;
}
