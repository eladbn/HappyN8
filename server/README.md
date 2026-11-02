# HappyN8 server

Express 5 API on Node.js 22+. It authenticates HappyN8 users, proxies requests to n8n with the server-side
API key, and stores its own data in SQLite (`node:sqlite`, no native dependencies).

## Run

```bash
npm install
npm run dev     # watch mode, reads ../.env if present
npm start       # production
npm test        # node:test suites in test/
```

When `web/dist` exists (or `STATIC_DIR` points to a build), the server also serves the web app and falls back
to `index.html` for client-side routes. See the root [README](../README.md) for the environment variables.

## Source map

| File | Responsibility |
|------|----------------|
| `start.js` | Entry point: loads config, starts listening. |
| `index.js` | `createApp()`: wires middleware, routers and static hosting. |
| `config.js` | Reads and validates environment variables. |
| `db.js` | Opens SQLite and runs ordered schema migrations (`PRAGMA user_version`). |
| `auth.js` | Signed session cookies, login/logout, per-IP login rate limiting, role checks. |
| `users.js` | User CRUD, scrypt password hashing, first-admin bootstrap. |
| `audit.js` | Activity log writes, queries and retention pruning. |
| `accountRoutes.js` | `/api/me`, `/api/users` and related account endpoints. |
| `connectionRoutes.js` | Test and save the n8n address (admin only). |
| `settings.js` | Persisted app settings (for example, the in-app n8n address). |
| `n8nClient.js` | n8n REST client (API key) plus optional n8n user session for internal endpoints. |
| `catalog.js` | Node-type catalog used by the editor. |
| `routes.js`, `proxy.js` | Workflow, execution, credential, data-table and variable endpoints forwarded to n8n. |

## Endpoints

- `GET /api/health`: liveness check (used by the Docker health check).
- `GET /api/session`, `POST /api/login`, `POST /api/logout`: session handling.
- Every other `/api/*` route requires a signed-in user. Write operations are limited by role.
