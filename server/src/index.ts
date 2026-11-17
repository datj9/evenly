import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { isEmpty, seed } from './seed.js';
import { config } from './config.js';

const db = openDatabase(config.dbFile);
if (isEmpty(db)) {
  await seed(db);
  process.stdout.write('Seeded demo data (alex@example.com / evenly-demo)\n');
}

const app = createApp(db, { secureCookies: config.secureCookies, staticDir: config.clientDist });
const server = app.listen(config.port, '127.0.0.1', () => {
  process.stdout.write(`API listening on http://127.0.0.1:${config.port}\n`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
