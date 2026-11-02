import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { normalizeN8nUrl } from '../src/settings.js';

/** Minimal fake n8n that says which instance answered. */
function fakeN8n(name) {
  return http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers['x-n8n-api-key'] !== 'KEY') { res.statusCode = 401; return res.end('{}'); }
    res.end(JSON.stringify({ data: [], instance: name }));
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

const servers = [];
let urlA;
let urlB;
let db;

async function startApp(env) {
  const cfg = loadConfig({ N8N_API_KEY: 'KEY', APP_PASSWORD: 'secret', SESSION_SECRET: 's', DB_FILE: ':memory:', STATIC_DIR: '/none', ...env });
  const server = http.createServer(createApp(cfg, { db }));
  servers.push(server);
  return listen(server);
}

async function signIn(appUrl) {
  const res = await fetch(`${appUrl}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'secret' }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (method, path, body) => fetch(`${appUrl}${path}`, {
    method,
    headers: { cookie, 'x-happyn8': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  const a = fakeN8n('A');
  const b = fakeN8n('B');
  servers.push(a, b);
  urlA = await listen(a);
  urlB = await listen(b);
  db = openDb(':memory:');
});

after(() => { for (const s of servers) s.close(); });

test('n8n addresses are normalized and validated', () => {
  assert.equal(normalizeN8nUrl('192.168.1.20:5678'), 'http://192.168.1.20:5678');
  assert.equal(normalizeN8nUrl(' https://n8n.example.com/base/ '), 'https://n8n.example.com/base');
  assert.equal(normalizeN8nUrl(''), '');
  assert.equal(normalizeN8nUrl('10.0.0.5:15678'), 'http://10.0.0.5:15678', 'custom port is kept');
  assert.equal(normalizeN8nUrl('https://n8n.local:443'), 'https://n8n.local', 'default port is dropped');
  for (const bad of ['ftp://x', 'http://u:p@x', 'http://x/?a=1', 'http://', 'http://x:70000', 'http://x:abc']) assert.throws(() => normalizeN8nUrl(bad), /n8n address/);
});

test('without any address the app starts and explains how to set it', async () => {
  const appUrl = await startApp({});
  const call = await signIn(appUrl);
  const res = await call('GET', '/api/v1/workflows');
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /n8n connection/);
});

test('admin changes the n8n address in the app; it applies immediately and persists', async () => {
  const appUrl = await startApp({ N8N_URL: urlA });
  const call = await signIn(appUrl);
  assert.equal((await (await call('GET', '/api/v1/workflows')).json()).instance, 'A');

  let res = await call('GET', '/api/n8n-connection');
  assert.deepEqual((await res.json()).env, { url: urlA, publicUrl: '' });

  // Unreachable addresses are refused unless forced.
  res = await call('PUT', '/api/n8n-connection', { url: 'http://127.0.0.1:1' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).unreachable, true);
  res = await call('POST', '/api/n8n-connection/test', { url: urlB.replace('http://', '') });
  assert.equal((await res.json()).ok, true);

  res = await call('PUT', '/api/n8n-connection', { url: urlB.replace('http://', ''), publicUrl: 'https://n8n.example.com' });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.url, urlB);
  assert.equal(saved.publicUrl, 'https://n8n.example.com');
  assert.equal((await (await call('GET', '/api/v1/workflows')).json()).instance, 'B');
  assert.equal((await (await call('GET', '/api/meta')).json()).n8nUrl, 'https://n8n.example.com');

  const log = await (await call('GET', '/api/audit?entityType=setting')).json();
  const entries = Array.isArray(log) ? log : log.items ?? log.data ?? [];
  assert.ok(entries.some((e) => e.action === 'changed the n8n address' && e.details?.to === urlB));

  // A restart with the same database keeps the in-app address over N8N_URL.
  const again = await signIn(await startApp({ N8N_URL: urlA }));
  assert.equal((await (await again('GET', '/api/v1/workflows')).json()).instance, 'B');

  // Clearing it falls back to N8N_URL.
  res = await again('PUT', '/api/n8n-connection', { url: '', publicUrl: '' });
  assert.equal((await res.json()).url, urlA);
  assert.equal((await (await again('GET', '/api/v1/workflows')).json()).instance, 'A');
});

test('only admins can see or change the n8n address', async () => {
  const appUrl = await startApp({ N8N_URL: urlA });
  const admin = await signIn(appUrl);
  await admin('POST', '/api/users', { username: 'ed', displayName: 'Ed', password: 'password1', role: 'editor' });
  const res = await fetch(`${appUrl}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'ed', password: 'password1' }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${appUrl}/api/n8n-connection`, { headers: { cookie } })).status, 403);
  const put = await fetch(`${appUrl}/api/n8n-connection`, { method: 'PUT', headers: { cookie, 'x-happyn8': '1', 'content-type': 'application/json' }, body: JSON.stringify({ url: urlB }) });
  assert.equal(put.status, 403);
});
