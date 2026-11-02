import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createAuth } from './auth.js';
import { createN8nClient } from './n8nClient.js';
import { createCatalog } from './catalog.js';
import { createApiRouter } from './routes.js';
import { openDb } from './db.js';
import { createUsers, publicUser } from './users.js';
import { createAudit } from './audit.js';
import { createAccountRouter } from './accountRoutes.js';
import { createConnectionRouter } from './connectionRoutes.js';
import { applyN8nAddress, createSettings } from './settings.js';

export function createApp(cfg, deps = {}) {
  const db = deps.db || openDb(cfg.dbFile);
  const settings = createSettings(db);
  applyN8nAddress(cfg, settings); // an address saved in the app overrides N8N_URL
  const client = deps.client || createN8nClient(cfg);
  const catalog = deps.catalog || createCatalog(client);
  const users = createUsers(db);
  const audit = createAudit(db);
  const created = users.bootstrap(cfg);
  if (created) console.log(`[happyn8] created the first admin user "${created.username}" from APP_PASSWORD`);
  audit.prune(cfg.auditRetentionDays);
  const auth = createAuth(cfg, users, audit);
  const app = express();

  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    next();
  });
  app.use('/api', express.json({ limit: '32mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/session', (req, res) => {
    const u = auth.currentUser(req);
    res.json({ authed: !!u, user: publicUser(u), authDisabled: cfg.authDisabled });
  });
  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);
  app.use('/api', auth.requireAuth, createAccountRouter({ users, audit, auth, cfg }));
  app.use('/api', createConnectionRouter({ cfg, settings, client, catalog, audit, auth }));
  app.use('/api', createApiRouter({ cfg, client, catalog, audit }));
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

  if (fs.existsSync(cfg.staticDir)) {
    app.use(express.static(cfg.staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('cache-control', 'no-cache');
      res.sendFile(path.join(cfg.staticDir, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: status === 500 ? 'Internal error' : err.message });
  });
  app.locals.db = db;
  return app;
}
