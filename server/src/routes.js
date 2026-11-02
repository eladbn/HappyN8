import express from 'express';
import { HttpError } from './n8nClient.js';
import { createProxy } from './proxy.js';

const DYNAMIC_KINDS = new Set(['options', 'resource-locator-results', 'resource-mapper-fields', 'local-resource-mapper-fields']);
const CHAT_TRIGGER = '@n8n/n8n-nodes-langchain.chatTrigger';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 502;
  const message = err instanceof HttpError ? err.message : `Could not reach n8n: ${err.message}`;
  res.status(status).json({ message, details: err.body });
}

async function relay(res, upstream) {
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
  res.send(text);
}

/** All /api routes behind the session check. */
export function createApiRouter({ cfg, client, catalog, audit }) {
  const r = express.Router();
  const editorsOnly = (req, res, next) => (req.user.role === 'viewer' ? res.status(403).json({ message: 'Your role is view-only. Ask an admin for editor access.' }) : next());

  r.get('/meta', (_req, res) => {
    res.json({ n8nUrl: cfg.n8nPublicUrl, login: client.hasLogin, authDisabled: cfg.authDisabled });
  });

  r.get('/status', async (_req, res) => {
    const out = { api: false, login: null };
    try {
      const up = await client.publicApi('GET', '/workflows?limit=1');
      out.api = up.ok;
      if (!up.ok) out.apiError = `n8n API responded ${up.status}${up.status === 401 ? ' (check N8N_API_KEY)' : ''}`;
    } catch (e) {
      out.apiError = e instanceof HttpError ? e.message : `Cannot reach ${cfg.n8nUrl}: ${e.message}`;
    }
    if (client.hasLogin) {
      try { await catalog.loadNodes(); out.login = true; } catch (e) { out.login = false; out.loginError = e.message; }
    }
    res.json(out);
  });

  r.use('/v1', createProxy({ client, audit }));

  r.get('/catalog/nodes', async (_req, res) => {
    try { res.json((await catalog.loadNodes()).summary); } catch (e) { sendError(res, e); }
  });

  r.get('/catalog/node', async (req, res) => {
    try {
      const d = await catalog.nodeDetail(String(req.query.type || ''), req.query.version);
      if (!d) return res.status(404).json({ message: 'Unknown node type' });
      res.setHeader('cache-control', 'private, max-age=3600');
      return res.json(d);
    } catch (e) { return sendError(res, e); }
  });

  r.get('/catalog/credentials', async (_req, res) => {
    try { res.json(await catalog.credentialTypes()); } catch (e) { sendError(res, e); }
  });

  r.get('/icons/*path', async (req, res) => {
    const p = Array.isArray(req.params.path) ? req.params.path.join('/') : String(req.params.path || '');
    try {
      const icon = await catalog.icon(`icons/${p}`);
      if (!icon) return res.status(404).end();
      res.setHeader('content-type', icon.type);
      res.setHeader('cache-control', 'private, max-age=86400');
      res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
      return res.send(icon.body);
    } catch {
      return res.status(404).end();
    }
  });

  r.post('/workflows/:id/run', editorsOnly, async (req, res) => {
    const { triggerName, destinationNode } = req.body || {};
    const body = { workflowId: req.params.id };
    if (typeof triggerName === 'string' && triggerName) body.triggerToStartFrom = { name: triggerName };
    if (isPlainObject(destinationNode) && typeof destinationNode.nodeName === 'string') {
      body.destinationNode = { nodeName: destinationNode.nodeName, mode: destinationNode.mode === 'exclusive' ? 'exclusive' : 'inclusive' };
    }
    try {
      const out = await client.internalJson('POST', `/rest/workflows/${encodeURIComponent(req.params.id)}/run`, body);
      const data = out.data ?? out;
      audit.record({
        user: req.user, action: body.destinationNode ? 'tested a step' : 'ran', entityType: 'workflow', entityId: req.params.id,
        details: { executionId: data.executionId ?? null, trigger: triggerName ?? null, step: body.destinationNode?.nodeName ?? undefined },
      });
      res.json(data);
    } catch (e) { sendError(res, e); }
  });

  r.post('/dynamic/:kind', async (req, res) => {
    if (!DYNAMIC_KINDS.has(req.params.kind)) return res.status(404).json({ message: 'Unknown kind' });
    if (!isPlainObject(req.body) || !isPlainObject(req.body.nodeTypeAndVersion)) {
      return res.status(400).json({ message: 'nodeTypeAndVersion is required' });
    }
    try {
      const out = await client.internalJson('POST', `/rest/dynamic-node-parameters/${req.params.kind}`, req.body);
      return res.json(out.data ?? out);
    } catch (e) { return sendError(res, e); }
  });

  r.post('/chat/:workflowId', editorsOnly, async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || typeof sessionId !== 'string') {
      return res.status(400).json({ message: 'message and sessionId are required' });
    }
    try {
      const wfRes = await client.publicApi('GET', `/workflows/${encodeURIComponent(req.params.workflowId)}`);
      if (!wfRes.ok) return relay(res, wfRes);
      const wf = await wfRes.json();
      const trigger = (wf.nodes || []).find((n) => n.type === CHAT_TRIGGER && !n.disabled);
      if (!trigger || !trigger.webhookId) return res.status(400).json({ message: 'This workflow has no Chat Trigger' });
      if (!wf.active) return res.status(400).json({ message: 'Publish the workflow first so its chat endpoint is live' });
      const up = await client.raw(`/webhook/${encodeURIComponent(trigger.webhookId)}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sendMessage', sessionId, chatInput: message }),
      });
      return relay(res, up);
    } catch (e) { return sendError(res, e); }
  });

  return r;
}
