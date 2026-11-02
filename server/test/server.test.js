import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';
import { createToken, parseToken } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { ICON_PATH } from '../src/catalog.js';
import { classify, summarizeWorkflowChange } from '../src/audit.js';
import { hashPassword, verifyPassword } from '../src/users.js';

let fake;
let fakeUrl;
let app;
let appUrl;
const seen = [];
const workflows = new Map([['w1', { id: 'w1', name: 'Lead flow', versionId: 'v1', nodes: [{ name: 'A', type: 'x', parameters: {} }], connections: {}, settings: {} }]]);

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const json = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
      if (req.url === '/rest/login') { res.setHeader('set-cookie', 'n8n-auth=abc123; Path=/; HttpOnly'); return json(200, { data: {} }); }
      if (req.url.startsWith('/rest/workflows/w1/run')) {
        if (req.headers.cookie !== 'n8n-auth=abc123') return json(401, {});
        return json(200, { data: { executionId: '42' } });
      }
      if (!req.url.startsWith('/api/v1/')) { res.statusCode = 404; return res.end(); }
      if (req.headers['x-n8n-api-key'] !== 'KEY') return json(401, { message: 'unauthorized' });
      const m = req.url.match(/^\/api\/v1\/workflows\/(\w+)$/);
      if (m && req.method === 'GET') return json(200, workflows.get(m[1]));
      if (m && req.method === 'PUT') {
        const next = { ...workflows.get(m[1]), ...JSON.parse(body), versionId: `v${Date.now()}` };
        workflows.set(m[1], next);
        return json(200, next);
      }
      if (req.url === '/api/v1/data-tables/T1' && req.method === 'GET') {
        return json(200, { id: 'T1', name: 'customers', columns: [{ id: 'C1', name: 'email', type: 'string', index: 0 }] });
      }
      if (req.url === '/api/v1/data-tables/T1/rows' && req.method === 'POST') return json(200, [{ id: 1 }, { id: 2 }]);
      if (req.url === '/api/v1/data-tables/T1/columns/C1' && req.method === 'PATCH') return json(200, { id: 'C1', name: 'mail' });
      if (req.url === '/api/v1/workflows' && req.method === 'POST') {
        const wf = { ...JSON.parse(body), id: 'w2', versionId: 'v9' };
        workflows.set('w2', wf);
        return json(200, wf);
      }
      return json(200, { echo: req.url, method: req.method, body: body ? JSON.parse(body) : null });
    });
  });
  fakeUrl = await listen(fake);
  const cfg = loadConfig({
    N8N_URL: fakeUrl, N8N_API_KEY: 'KEY', APP_PASSWORD: 'secret', SESSION_SECRET: 's', DB_FILE: ':memory:',
    N8N_EMAIL: 'a@b.c', N8N_PASSWORD: 'pw', STATIC_DIR: '/nonexistent',
  });
  app = http.createServer(createApp(cfg));
  appUrl = await listen(app);
});

after(() => { fake.close(); app.close(); });

async function login(username = 'admin', password = 'secret') {
  const res = await fetch(`${appUrl}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(res.status, 200, `login ${username}`);
  return res.headers.get('set-cookie').split(';')[0];
}

function api(cookie, method, path, body) {
  const headers = { cookie };
  if (method !== 'GET') headers['x-happyn8'] = '1';
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${appUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

test('config requires the essentials', () => {
  assert.throws(() => loadConfig({ N8N_URL: 'http://x' }), /N8N_API_KEY/);
  assert.throws(() => loadConfig({ N8N_URL: 'x:5678', N8N_API_KEY: 'k' }), /N8N_URL must start/);
  assert.equal(loadConfig({ N8N_API_KEY: 'k' }).n8nUrl, '', 'N8N_URL is optional; it can be set in the app');
  assert.equal(loadConfig({ N8N_URL: 'http://x/', N8N_API_KEY: 'k' }).n8nUrl, 'http://x');
});

test('PORT defaults to 8080, can be overridden and is validated', () => {
  const base = { N8N_URL: 'http://x', N8N_API_KEY: 'k' };
  assert.equal(loadConfig(base).port, 8080);
  assert.equal(loadConfig({ ...base, PORT: '' }).port, 8080);
  assert.equal(loadConfig({ ...base, PORT: '9090' }).port, 9090);
  for (const bad of ['abc', '0', '70000', '80.5']) assert.throws(() => loadConfig({ ...base, PORT: bad }), /PORT must be/);
});

test('first start without users or APP_PASSWORD explains what to set', () => {
  const cfg = loadConfig({ N8N_URL: 'http://x', N8N_API_KEY: 'k', DB_FILE: ':memory:', STATIC_DIR: '/none' });
  assert.throws(() => createApp(cfg), /APP_PASSWORD/);
});

test('passwords are hashed and verified', () => {
  const h = hashPassword('correct horse');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(verifyPassword('correct horse', h));
  assert.ok(!verifyPassword('wrong', h));
});

test('tokens carry user and version, and expire', () => {
  const t = createToken('s', 7, 2, 1, 1000);
  assert.deepEqual(parseToken('s', t, 2000), { userId: 7, tokenVersion: 2 });
  assert.equal(parseToken('other', t, 2000), null);
  assert.equal(parseToken('s', t, 1000 + 2 * 3600 * 1000), null);
});

test('api requires a session; wrong password is rejected', async () => {
  assert.equal((await fetch(`${appUrl}/api/v1/workflows`)).status, 401);
  const res = await fetch(`${appUrl}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'nope' }) });
  assert.equal(res.status, 401);
});

test('session reports the signed-in HappyN8 user', async () => {
  const cookie = await login();
  const s = await (await api(cookie, 'GET', '/api/session')).json();
  assert.equal(s.authed, true);
  assert.equal(s.user.username, 'admin');
  assert.equal(s.user.role, 'admin');
  assert.equal(s.user.password_hash, undefined);
});

test('proxy adds the API key and forwards query and body', async () => {
  const cookie = await login();
  const get = await api(cookie, 'GET', '/api/v1/executions?limit=5&cursor=a');
  assert.deepEqual(await get.json(), { echo: '/api/v1/executions?limit=5&cursor=a', method: 'GET', body: null });
  assert.equal((await api(cookie, 'GET', '/api/v1/audit')).status, 404);
  const noCsrf = await fetch(`${appUrl}/api/v1/workflows/w1`, { method: 'DELETE', headers: { cookie } });
  assert.equal(noCsrf.status, 403);
});

test('admin manages users; roles are enforced', async () => {
  const admin = await login();
  let res = await api(admin, 'POST', '/api/users', { username: 'dana', displayName: 'Dana', password: 'short', role: 'editor' });
  assert.equal(res.status, 400);
  res = await api(admin, 'POST', '/api/users', { username: 'dana', displayName: 'Dana', password: 'dana-pass-1', role: 'editor' });
  assert.equal(res.status, 201);
  res = await api(admin, 'POST', '/api/users', { username: 'vic', displayName: 'Vic', password: 'vic-pass-12', role: 'viewer' });
  assert.equal(res.status, 201);
  assert.equal((await api(admin, 'POST', '/api/users', { username: 'DANA', password: 'whatever12', role: 'viewer' })).status, 409);

  const viewer = await login('vic', 'vic-pass-12');
  assert.equal((await api(viewer, 'GET', '/api/v1/workflows/w1')).status, 200);
  assert.equal((await api(viewer, 'PUT', '/api/v1/workflows/w1', { name: 'x' })).status, 403);
  assert.equal((await api(viewer, 'POST', '/api/workflows/w1/run', {})).status, 403);
  assert.equal((await api(viewer, 'GET', '/api/users')).status, 403);

  const editor = await login('dana', 'dana-pass-1');
  assert.equal((await api(editor, 'GET', '/api/users')).status, 403);
  assert.equal((await api(editor, 'GET', '/api/people')).status, 200);
});

test('saves are audited with the HappyN8 user, a change summary and the version author', async () => {
  const editor = await login('dana', 'dana-pass-1');
  const res = await api(editor, 'PUT', '/api/v1/workflows/w1', {
    name: 'Lead flow v2', nodes: [{ name: 'A', type: 'x', parameters: { a: 1 } }, { name: 'Slack', type: 'slack', parameters: {} }], connections: {}, settings: {},
  });
  assert.equal(res.status, 200);
  const saved = await res.json();
  const log = await (await api(editor, 'GET', '/api/audit?entityId=w1')).json();
  const entry = log.data.find((e) => e.action === 'updated');
  assert.equal(entry.user, 'Dana');
  assert.equal(entry.entityName, 'Lead flow v2');
  assert.deepEqual(entry.details.added, ['Slack']);
  assert.deepEqual(entry.details.changed, ['A']);
  assert.deepEqual(entry.details.renamed, { from: 'Lead flow', to: 'Lead flow v2' });

  const own = await (await api(editor, 'GET', '/api/ownership')).json();
  assert.equal(own.w1.changedBy.name, 'Dana');
  const authors = await (await api(editor, 'GET', '/api/workflows/w1/version-authors')).json();
  assert.equal(authors[saved.versionId].name, 'Dana');
});

test('creating a workflow records its creator; runs are audited', async () => {
  const admin = await login();
  await api(admin, 'POST', '/api/v1/workflows', { name: 'New one', nodes: [], connections: {}, settings: {} });
  const own = await (await api(admin, 'GET', '/api/ownership')).json();
  assert.equal(own.w2.createdBy.name, 'Administrator');
  const run = await api(admin, 'POST', '/api/workflows/w1/run', { triggerName: 'Manual' });
  assert.deepEqual(await run.json(), { executionId: '42' });
  const log = await (await api(admin, 'GET', '/api/audit?action=ran')).json();
  assert.equal(log.data[0].details.executionId, '42');
  const runReq = seen.find((s) => s.url === '/rest/workflows/w1/run');
  assert.deepEqual(JSON.parse(runReq.body), { workflowId: 'w1', triggerToStartFrom: { name: 'Manual' } });
});

test('data table changes are audited by table name; viewers cannot change them', async () => {
  const editor = await login('dana', 'dana-pass-1');
  assert.equal((await api(editor, 'POST', '/api/v1/data-tables/T1/rows', { data: [{ email: 'a' }, { email: 'b' }], returnType: 'all' })).status, 200);
  assert.equal((await api(editor, 'PATCH', '/api/v1/data-tables/T1/columns/C1', { name: 'mail' })).status, 200);
  const log = await (await api(editor, 'GET', '/api/audit?entityType=datatable')).json();
  const [renamed, added] = log.data;
  assert.equal(added.action, 'added rows to');
  assert.equal(added.entityName, 'customers');
  assert.equal(added.details.rows, 2);
  assert.equal(renamed.action, 'changed a column in');
  assert.deepEqual(renamed.details, { column: 'mail', from: 'email' });
  const viewer = await login('vic', 'vic-pass-12');
  assert.equal((await api(viewer, 'GET', '/api/v1/data-tables/T1')).status, 200);
  assert.equal((await api(viewer, 'POST', '/api/v1/data-tables/T1/rows', { data: [{}] })).status, 403);
});

test('changing a password signs out other sessions but keeps this one', async () => {
  const s1 = await login('dana', 'dana-pass-1');
  const s2 = await login('dana', 'dana-pass-1');
  assert.equal((await api(s1, 'POST', '/api/me/password', { current: 'wrong', next: 'new-pass-123' })).status, 400);
  const res = await api(s1, 'POST', '/api/me/password', { current: 'dana-pass-1', next: 'new-pass-123' });
  assert.equal(res.status, 200);
  const fresh = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await api(s2, 'GET', '/api/me')).status, 401);
  assert.equal((await api(fresh, 'GET', '/api/me')).status, 200);
  await login('dana', 'new-pass-123');
});

test('the last admin cannot be removed or demoted; disabled users cannot sign in', async () => {
  const admin = await login();
  const me = await (await api(admin, 'GET', '/api/me')).json();
  assert.equal((await api(admin, 'PATCH', `/api/users/${me.id}`, { role: 'viewer' })).status, 400);
  assert.equal((await api(admin, 'DELETE', `/api/users/${me.id}`)).status, 400);
  const people = await (await api(admin, 'GET', '/api/users')).json();
  const vic = people.find((p) => p.username === 'vic');
  assert.equal((await api(admin, 'PATCH', `/api/users/${vic.id}`, { disabled: true })).status, 200);
  const res = await fetch(`${appUrl}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'vic', password: 'vic-pass-12' }) });
  assert.equal(res.status, 401);
});

test('serves the SPA at / and deep links', async () => {
  const cfg2 = loadConfig({ N8N_URL: fakeUrl, N8N_API_KEY: 'KEY', AUTH_DISABLED: 'true', DB_FILE: ':memory:', STATIC_DIR: new URL('./fixtures/dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  const srv = http.createServer(createApp(cfg2));
  const url = await listen(srv);
  try {
    for (const p of ['/', '/workflows/abc']) {
      const res = await fetch(url + p);
      assert.equal(res.status, 200, p);
      assert.match(await res.text(), /spa/);
    }
    assert.equal((await fetch(`${url}/api/nope`)).status, 404);
  } finally { srv.close(); }
});

test('audit classification and change summaries', () => {
  assert.deepEqual(classify('PUT', '/workflows/abc'), { entityType: 'workflow', entityId: 'abc', action: 'updated' });
  assert.deepEqual(classify('POST', '/workflows/abc/activate'), { entityType: 'workflow', entityId: 'abc', action: 'activated' });
  assert.deepEqual(classify('POST', '/executions/9/retry'), { entityType: 'execution', entityId: '9', action: 'retried' });
  assert.equal(classify('GET', '/workflows'), null);
  assert.deepEqual(classify('DELETE', '/data-tables/T1/rows/delete'), { entityType: 'datatable', entityId: 'T1', action: 'deleted rows from' });
  assert.deepEqual(classify('DELETE', '/data-tables/T1/columns/C9'), { entityType: 'datatable', entityId: 'T1', action: 'removed a column from' });
  assert.deepEqual(classify('POST', '/data-tables'), { entityType: 'datatable', action: 'created' });
  const s = summarizeWorkflowChange({ name: 'a', nodes: [{ name: 'X', type: 't' }] }, { name: 'a', nodes: [] });
  assert.deepEqual(s.removed, ['X']);
});

test('icon paths are restricted', () => {
  assert.ok(ICON_PATH.test('icons/n8n-nodes-base/dist/nodes/Slack/slack.svg'));
  assert.ok(!ICON_PATH.test('rest/login'));
});
