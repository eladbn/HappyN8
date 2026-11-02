import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Ordered schema migrations; the index + 1 is stored in PRAGMA user_version. */
const MIGRATIONS = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     display_name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
     disabled INTEGER NOT NULL DEFAULT 0,
     token_version INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     last_login_at TEXT
   );
   CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     user_id INTEGER,
     user_label TEXT NOT NULL,
     action TEXT NOT NULL,
     entity_type TEXT NOT NULL,
     entity_id TEXT,
     entity_name TEXT,
     details TEXT
   );
   CREATE INDEX audit_ts ON audit (ts DESC, id DESC);
   CREATE INDEX audit_entity ON audit (entity_type, entity_id);
   CREATE INDEX audit_user ON audit (user_id);
   CREATE TABLE workflow_meta (
     workflow_id TEXT PRIMARY KEY,
     created_by INTEGER,
     created_label TEXT,
     created_at TEXT,
     changed_by INTEGER,
     changed_label TEXT,
     changed_at TEXT
   );
   CREATE TABLE version_authors (
     workflow_id TEXT NOT NULL,
     version_id TEXT NOT NULL,
     user_id INTEGER,
     user_label TEXT NOT NULL,
     ts TEXT NOT NULL,
     PRIMARY KEY (workflow_id, version_id)
   );`,
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     updated_by TEXT
   );`,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = current; i < MIGRATIONS.length; i += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export const nowIso = () => new Date().toISOString();
