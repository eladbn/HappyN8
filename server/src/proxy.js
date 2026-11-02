import { classify, summarizeWorkflowChange } from './audit.js';
import { HttpError } from './n8nClient.js';

const PROXY_PREFIXES = ['/workflows', '/executions', '/credentials', '/tags', '/projects', '/variables', '/insights', '/data-tables'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parse(text) {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

async function fetchJson(client, path) {
  try {
    const r = await client.publicApi('GET', path);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * Public n8n API passthrough (the API key never leaves the server).
 * Successful changes are written to the audit log with the HappyN8 user who made them.
 */
export function createProxy({ client, audit }) {
  return async function proxy(req, res) {
    const path = req.path;
    if (!PROXY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return res.status(404).json({ message: 'Not available through HappyN8' });
    }
    const mutating = !['GET', 'HEAD'].includes(req.method);
    // Testing a credential is a harmless read-style action; everything else that changes data needs edit rights.
    if (mutating && req.user.role === 'viewer') {
      return res.status(403).json({ message: 'Your role is view-only. Ask an admin for editor access.' });
    }
    const event = classify(req.method, path);

    // For workflow saves, load the previous state so the audit can say what changed.
    let before = null;
    if (event && event.entityType === 'workflow' && event.action === 'updated') {
      before = await fetchJson(client, `/workflows/${encodeURIComponent(event.entityId)}`);
    }
    // Data table calls don't echo the table name, so look it up for the log.
    if (event && event.entityType === 'datatable' && event.entityId) {
      before = await fetchJson(client, `/data-tables/${encodeURIComponent(event.entityId)}`);
    }
    let tagNames = null;
    if (event && event.action === 'retagged') tagNames = Array.isArray(req.body) ? req.body.map((t) => t.id) : null;

    try {
      const hasBody = mutating && req.method !== 'DELETE' ? true : isPlainObject(req.body) && Object.keys(req.body).length > 0;
      const upstream = await client.publicApi(req.method, req.url, hasBody ? (req.body ?? {}) : undefined);
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      res.send(text);
      if (event && upstream.ok) {
        try { record(event, req, parse(text), before, tagNames); } catch (e) { console.error('[happyn8] audit failed:', e.message); }
      }
      return undefined;
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ message: e.message });
      return res.status(502).json({ message: `Could not reach n8n: ${e.message}` });
    }
  };

  function record(event, req, body, before, tagIds) {
    const user = req.user;
    const obj = isPlainObject(body) ? body : null;
    const entityId = event.entityId ?? obj?.id ?? null;
    let entityName = obj?.name ?? before?.name ?? null;
    let details = null;

    if (event.entityType === 'workflow') {
      if (event.action === 'created') audit.workflowCreated(entityId, user, obj?.versionId);
      else if (event.action === 'updated') {
        details = summarizeWorkflowChange(before, obj);
        audit.workflowChanged(entityId, user, obj?.versionId);
      } else if (event.action === 'retagged') {
        const tags = Array.isArray(body) ? body.map((t) => t.name) : tagIds;
        details = { tags };
        entityName = null;
        audit.workflowChanged(entityId, user, null);
      } else if (event.action === 'published' || event.action === 'activated') {
        details = obj?.activeVersionId ? { versionId: obj.activeVersionId } : null;
        audit.workflowChanged(entityId, user, null);
      } else {
        audit.workflowChanged(entityId, user, null);
      }
    }
    if (event.entityType === 'execution') {
      details = { workflowId: obj?.workflowId ?? null, newExecutionId: event.action === 'retried' ? obj?.id ?? null : undefined };
      entityName = obj?.workflowData?.name ?? null;
    }
    if (event.entityType === 'datatable') {
      // Column and row calls return the column/rows, so the table name comes from the lookup.
      entityName = event.action === 'created' || event.action === 'renamed' ? obj?.name ?? null : before?.name ?? null;
      details = dataTableDetails(event, req, body, before);
      if (event.action === 'renamed') details = { from: before?.name ?? null };
    }
    if (event.entityType === 'variable') {
      entityName = obj?.key ?? req.body?.key ?? null;
    }
    if (event.entityType === 'credential') details = obj?.type ? { type: obj.type } : null;
    audit.record({ user, action: event.action, entityType: event.entityType, entityId: entityId ?? null, entityName, details });
  }
}

function dataTableDetails(event, req, body, before) {
  const b = isPlainObject(req.body) ? req.body : {};
  if (event.action === 'created') return { columns: Array.isArray(b.columns) ? b.columns.map((c) => c.name) : [] };
  if (event.action.includes('column')) {
    const cid = req.path.split('/')[4];
    const old = before?.columns?.find((c) => c.id === cid);
    return { column: b.name ?? old?.name ?? null, from: b.name && old && old.name !== b.name ? old.name : undefined };
  }
  if (event.action === 'added rows to') return { rows: Array.isArray(b.data) ? b.data.length : null };
  if (event.action === 'edited rows in') return { rows: Array.isArray(body) ? body.length : null, fields: isPlainObject(b.data) ? Object.keys(b.data) : [] };
  if (event.action === 'deleted rows from') return { rows: Array.isArray(body) ? body.length : null };
  if (event.action === 'cleared') return { rows: body?.deletedCount ?? null };
  return null;
}
