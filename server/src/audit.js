import { nowIso } from './db.js';

const WF_VERBS = { activate: 'activated', deactivate: 'deactivated', publish: 'published', unpublish: 'unpublished', archive: 'archived', unarchive: 'restored', transfer: 'moved', tags: 'retagged' };
const EXEC_VERBS = { retry: 'retried', stop: 'stopped' };

/**
 * Maps a mutating public-API call to an audit action. Returns null for calls that aren't recorded.
 * `path` is relative to /api/v1 and has no query string.
 */
export function classify(method, path) {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') return null;
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [kind, id, sub] = seg;
  if (kind === 'workflows') {
    if (!id && m === 'POST') return { entityType: 'workflow', action: 'created' };
    if (id && !sub && m === 'PUT') return { entityType: 'workflow', entityId: id, action: 'updated' };
    if (id && !sub && m === 'DELETE') return { entityType: 'workflow', entityId: id, action: 'deleted' };
    if (id && WF_VERBS[sub]) return { entityType: 'workflow', entityId: id, action: WF_VERBS[sub] };
    return null;
  }
  if (kind === 'credentials') {
    if (!id && m === 'POST') return { entityType: 'credential', action: 'created' };
    if (id && !sub && m === 'PATCH') return { entityType: 'credential', entityId: id, action: 'updated' };
    if (id && !sub && m === 'DELETE') return { entityType: 'credential', entityId: id, action: 'deleted' };
    if (id && sub === 'test') return { entityType: 'credential', entityId: id, action: 'tested' };
    if (id && sub === 'transfer') return { entityType: 'credential', entityId: id, action: 'moved' };
    return null;
  }
  if (kind === 'tags') {
    if (!id && m === 'POST') return { entityType: 'tag', action: 'created' };
    if (id && m === 'PUT') return { entityType: 'tag', entityId: id, action: 'renamed' };
    if (id && m === 'DELETE') return { entityType: 'tag', entityId: id, action: 'deleted' };
    return null;
  }
  if (kind === 'executions') {
    if (id === 'stop') return { entityType: 'execution', action: 'stopped' };
    if (id && EXEC_VERBS[sub]) return { entityType: 'execution', entityId: id, action: EXEC_VERBS[sub] };
    if (id && !sub && m === 'DELETE') return { entityType: 'execution', entityId: id, action: 'deleted' };
    return null;
  }
  if (kind === 'data-tables') {
    const cid = seg[3];
    if (!id && m === 'POST') return { entityType: 'datatable', action: 'created' };
    if (id && !sub && m === 'PATCH') return { entityType: 'datatable', entityId: id, action: 'renamed' };
    if (id && !sub && m === 'DELETE') return { entityType: 'datatable', entityId: id, action: 'deleted' };
    if (id && sub === 'columns') {
      if (!cid && m === 'POST') return { entityType: 'datatable', entityId: id, action: 'added a column to' };
      if (cid && m === 'PATCH') return { entityType: 'datatable', entityId: id, action: 'changed a column in' };
      if (cid && m === 'DELETE') return { entityType: 'datatable', entityId: id, action: 'removed a column from' };
      return null;
    }
    if (id && sub === 'rows') {
      const op = seg[3];
      if (!op && m === 'POST') return { entityType: 'datatable', entityId: id, action: 'added rows to' };
      if (op === 'update' || op === 'upsert') return { entityType: 'datatable', entityId: id, action: 'edited rows in' };
      if (op === 'delete') return { entityType: 'datatable', entityId: id, action: 'deleted rows from' };
      if (op === 'clear') return { entityType: 'datatable', entityId: id, action: 'cleared' };
    }
    return null;
  }
  if (kind === 'variables') {
    if (!id && m === 'POST') return { entityType: 'variable', action: 'created' };
    if (id && m === 'PUT') return { entityType: 'variable', entityId: id, action: 'updated' };
    if (id && m === 'DELETE') return { entityType: 'variable', entityId: id, action: 'deleted' };
  }
  return null;
}

function sig(n) {
  return JSON.stringify([n.type, n.typeVersion, n.parameters, n.credentials ?? null, !!n.disabled, n.onError ?? null, n.notes ?? null]);
}

/** Human summary of what a save changed, by step name. */
export function summarizeWorkflowChange(before, after) {
  if (!before || !after) return null;
  const a = new Map((before.nodes || []).map((n) => [n.name, n]));
  const b = new Map((after.nodes || []).map((n) => [n.name, n]));
  const out = { added: [], removed: [], changed: [] };
  for (const [name, n] of b) {
    if (!a.has(name)) out.added.push(name);
    else if (sig(a.get(name)) !== sig(n)) out.changed.push(name);
  }
  for (const name of a.keys()) if (!b.has(name)) out.removed.push(name);
  if (before.name !== after.name) out.renamed = { from: before.name, to: after.name };
  if (JSON.stringify(before.connections || {}) !== JSON.stringify(after.connections || {})) out.connections = true;
  if (JSON.stringify(before.settings || {}) !== JSON.stringify(after.settings || {})) out.settings = true;
  if ((before.description ?? '') !== (after.description ?? '')) out.description = true;
  return out;
}

const label = (u) => u.display_name || u.username;

export function createAudit(db) {
  const q = {
    insert: db.prepare('INSERT INTO audit (ts, user_id, user_label, action, entity_type, entity_id, entity_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    created: db.prepare(`INSERT INTO workflow_meta (workflow_id, created_by, created_label, created_at, changed_by, changed_label, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (workflow_id) DO UPDATE SET changed_by = excluded.changed_by, changed_label = excluded.changed_label, changed_at = excluded.changed_at`),
    changed: db.prepare(`INSERT INTO workflow_meta (workflow_id, changed_by, changed_label, changed_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (workflow_id) DO UPDATE SET changed_by = excluded.changed_by, changed_label = excluded.changed_label, changed_at = excluded.changed_at`),
    version: db.prepare('INSERT OR REPLACE INTO version_authors (workflow_id, version_id, user_id, user_label, ts) VALUES (?, ?, ?, ?, ?)'),
    versions: db.prepare('SELECT version_id, user_id, user_label, ts FROM version_authors WHERE workflow_id = ?'),
    meta: db.prepare('SELECT * FROM workflow_meta'),
    prune: db.prepare('DELETE FROM audit WHERE ts < ?'),
  };

  function record({ user, action, entityType, entityId = null, entityName = null, details = null }) {
    q.insert.run(nowIso(), user.id || null, label(user), action, entityType, entityId ? String(entityId) : null, entityName, details ? JSON.stringify(details) : null);
  }

  function workflowCreated(id, user, versionId) {
    const ts = nowIso();
    q.created.run(id, user.id || null, label(user), ts, user.id || null, label(user), ts);
    if (versionId) q.version.run(id, versionId, user.id || null, label(user), ts);
  }

  function workflowChanged(id, user, versionId) {
    const ts = nowIso();
    q.changed.run(id, user.id || null, label(user), ts);
    if (versionId) q.version.run(id, versionId, user.id || null, label(user), ts);
  }

  function query({ userId, entityType, entityId, action, q: text, before, limit = 50 } = {}) {
    const where = [];
    const vals = [];
    if (userId) { where.push('user_id = ?'); vals.push(Number(userId)); }
    if (entityType) { where.push('entity_type = ?'); vals.push(entityType); }
    if (entityId) { where.push('entity_id = ?'); vals.push(String(entityId)); }
    if (action) { where.push('action = ?'); vals.push(action); }
    if (text) { where.push('(entity_name LIKE ? OR user_label LIKE ? OR details LIKE ?)'); const t = `%${text}%`; vals.push(t, t, t); }
    if (before) { where.push('id < ?'); vals.push(Number(before)); }
    const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const rows = db.prepare(`SELECT * FROM audit ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`).all(...vals, n + 1);
    const page = rows.slice(0, n).map((r) => ({
      id: r.id, ts: r.ts, userId: r.user_id, user: r.user_label, action: r.action, entityType: r.entity_type,
      entityId: r.entity_id, entityName: r.entity_name, details: r.details ? JSON.parse(r.details) : null,
    }));
    return { data: page, nextBefore: rows.length > n ? page[page.length - 1].id : null };
  }

  function ownership() {
    const out = {};
    for (const r of q.meta.all()) {
      out[r.workflow_id] = {
        createdBy: r.created_label ? { id: r.created_by, name: r.created_label } : null, createdAt: r.created_at,
        changedBy: r.changed_label ? { id: r.changed_by, name: r.changed_label } : null, changedAt: r.changed_at,
      };
    }
    return out;
  }

  function versionAuthors(workflowId) {
    return Object.fromEntries(q.versions.all(workflowId).map((r) => [r.version_id, { id: r.user_id, name: r.user_label, ts: r.ts }]));
  }

  function prune(days) {
    if (!days || days <= 0) return 0;
    return Number(q.prune.run(new Date(Date.now() - days * 86400000).toISOString()).changes);
  }

  return { record, workflowCreated, workflowChanged, query, ownership, versionAuthors, prune };
}
