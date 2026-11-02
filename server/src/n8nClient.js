import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function extractAuthCookie(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const first = c.split(';')[0];
    if (first.startsWith('n8n-auth=')) return first;
  }
  return null;
}

/**
 * Talks to n8n in two ways:
 *  - the public REST API (/api/v1) with the API key — workflows, executions, credentials, history;
 *  - optionally the editor's internal API (/rest, /types, /icons) with a logged-in session — node catalog,
 *    icons, dynamic dropdown options and manual runs, which the public API does not offer.
 */
export function createN8nClient(cfg, fetchImpl = globalThis.fetch) {
  const browserId = crypto.randomUUID();
  const hasLogin = Boolean(cfg.n8nEmail && cfg.n8nPassword);
  let cookie = null;
  let loginPromise = null;
  let cookieFor = null;

  /** Current n8n base URL; it can change at runtime when an admin edits it in the app. */
  function base() {
    if (!cfg.n8nUrl) throw new HttpError(503, 'The n8n address is not set. An admin can set it under Manage → n8n connection.');
    return cfg.n8nUrl;
  }

  async function publicApi(method, pathAndQuery, body) {
    const headers = { 'X-N8N-API-KEY': cfg.apiKey, accept: 'application/json' };
    const init = { method, headers };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      headers['content-type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return fetchImpl(`${base()}/api/v1${pathAndQuery}`, init);
  }

  async function doLogin() {
    const url = base();
    const res = await fetchImpl(`${url}/rest/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'browser-id': browserId },
      body: JSON.stringify({ emailOrLdapLoginId: cfg.n8nEmail, email: cfg.n8nEmail, password: cfg.n8nPassword }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(502, `n8n login failed (${res.status}). Check N8N_EMAIL / N8N_PASSWORD.`, text);
    }
    const c = extractAuthCookie(res);
    if (!c) throw new HttpError(502, 'n8n login returned no session cookie');
    cookie = c;
    cookieFor = url;
    return c;
  }

  async function ensureLogin(force = false) {
    if (!hasLogin) throw new HttpError(501, 'This feature needs N8N_EMAIL and N8N_PASSWORD to be configured.');
    if (cookie && cookieFor === base() && !force) return cookie;
    if (!loginPromise) loginPromise = doLogin().finally(() => { loginPromise = null; });
    return loginPromise;
  }

  /** Request against the internal API with the session cookie; re-logs in once on 401. */
  async function internal(method, path, body) {
    const send = async (c) => {
      const headers = { cookie: c, 'browser-id': browserId, accept: 'application/json' };
      const init = { method, headers };
      if (body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return fetchImpl(`${base()}${path}`, init);
    };
    let res = await send(await ensureLogin());
    if (res.status === 401) res = await send(await ensureLogin(true));
    return res;
  }

  async function internalJson(method, path, body) {
    const res = await internal(method, path, body);
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
    if (!res.ok) throw new HttpError(res.status, json.message || `n8n responded ${res.status}`, json);
    return json;
  }

  /** Unauthenticated GET against the n8n origin (public webhooks, static files). */
  async function raw(path, init) {
    return fetchImpl(`${base()}${path}`, init);
  }

  /** Forgets the n8n session (used after the n8n address changes). */
  function reset() {
    cookie = null;
    cookieFor = null;
  }

  return {
    publicApi, internal, internalJson, raw, reset, hasLogin, browserId,
    get baseUrl() { return cfg.n8nUrl; },
  };
}
