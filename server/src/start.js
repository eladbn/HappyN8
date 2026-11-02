import { loadConfig } from './config.js';
import { createApp } from './index.js';

let cfg;
let app;
try {
  cfg = loadConfig();
  app = createApp(cfg);
} catch (e) {
  console.error(`[happyn8] ${e.message}`);
  process.exit(1);
}

app.listen(cfg.port, () => {
  console.log(`[happyn8] listening on :${cfg.port} -> n8n at ${cfg.n8nUrl || '(not set yet: sign in as admin and open n8n connection)'} (data: ${cfg.dbFile})`);
  if (!cfg.n8nEmail) {
    console.log('[happyn8] N8N_EMAIL/N8N_PASSWORD not set: node catalog, icons, dynamic options and Run are disabled.');
  }
});
