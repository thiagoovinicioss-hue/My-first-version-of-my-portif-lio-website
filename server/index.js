import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';

const cfg = loadConfig();
const { app } = createApp(cfg);

const server = app.listen(cfg.port, () => {
  console.log(`[tv-portfolio-backend] listening on :${cfg.port} (env=${cfg.env})`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);