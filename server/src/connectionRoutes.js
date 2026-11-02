import express from 'express';
import { SettingsError, applyN8nAddress, normalizeN8nUrl } from './settings.js';

const TEST_TIMEOUT_MS = 8000;

/** Checks that an n8n instance answers at `url` and accepts the configured API key. */
export async function testN8n(url, apiKey, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`${url}/api/v1/workflows?limit=1`, {
      headers: { 'X-N8N-API-KEY': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, message: `Connected to n8n at ${url}` };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `n8n answered at ${url} but rejected the API key (${res.status}). Check N8N_API_KEY.` };
    return { ok: false, message: `${url} answered ${res.status}. Is this the n8n address (including the port)?` };
  } catch (e) {
    const reason = e.name === 'TimeoutError' ? `no answer within ${TEST_TIMEOUT_MS / 1000}s` : (e.cause?.code || e.message);
    return { ok: false, message: `Cannot reach ${url}: ${reason}` };
  }
}

/** Admin-only: view and change the n8n address from the app. Mounted behind requireAuth. */
export function createConnectionRouter({ cfg, settings, client, catalog, audit, auth }) {
  const r = express.Router();
  const adminOnly = auth.requireRole('admin');

  function view() {
    return {
      url: cfg.n8nUrl,
      publicUrl: cfg.n8nPublicUrl,
      saved: { url: settings.get('n8n.url'), publicUrl: settings.get('n8n.publicUrl') },
      env: { url: cfg.envN8nUrl, publicUrl: cfg.envN8nPublicUrl },
    };
  }

  function parse(body) {
    return {
      url: normalizeN8nUrl(body?.url, 'n8n address'),
      publicUrl: normalizeN8nUrl(body?.publicUrl, 'browser address'),
    };
  }

  const fail = (res, e) => {
    if (e instanceof SettingsError) return res.status(400).json({ message: e.message });
    throw e;
  };

  r.get('/n8n-connection', adminOnly, (_req, res) => res.json(view()));

  r.post('/n8n-connection/test', adminOnly, async (req, res) => {
    let next;
    try { next = parse(req.body); } catch (e) { return fail(res, e); }
    const url = next.url || cfg.envN8nUrl;
    if (!url) return res.status(400).json({ message: 'Enter the n8n address first' });
    return res.json(await testN8n(url, cfg.apiKey));
  });

  /** Saves the address. Unless `force` is set, refuses an address where n8n can't be reached. */
  r.put('/n8n-connection', adminOnly, async (req, res) => {
    let next;
    try { next = parse(req.body); } catch (e) { return fail(res, e); }
    const effective = next.url || cfg.envN8nUrl;
    if (!effective) return res.status(400).json({ message: 'Enter the n8n address (there is no N8N_URL in .env to fall back to)' });
    const check = await testN8n(effective, cfg.apiKey);
    if (!check.ok && req.body?.force !== true) return res.status(409).json({ message: check.message, unreachable: true });

    const from = cfg.n8nUrl;
    const label = req.user.display_name || req.user.username;
    settings.set('n8n.url', next.url, label);
    settings.set('n8n.publicUrl', next.publicUrl, label);
    applyN8nAddress(cfg, settings);
    if (cfg.n8nUrl !== from) {
      client.reset?.();
      catalog.reset?.();
    }
    audit.record({
      user: req.user, action: 'changed the n8n address', entityType: 'setting', entityId: 'n8n.url', entityName: null,
      details: { from: from || null, to: cfg.n8nUrl, publicUrl: cfg.n8nPublicUrl },
    });
    return res.json({ ...view(), check });
  });

  return r;
}
