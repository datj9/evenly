import { rmSync } from 'node:fs';
import { openDatabase } from './db.js';
import { seed } from './seed.js';
import { config } from './config.js';

for (const suffix of ['', '-wal', '-shm']) rmSync(`${config.dbFile}${suffix}`, { force: true });
const db = openDatabase(config.dbFile);
await seed(db);
db.close();
process.stdout.write(`Reset and seeded ${config.dbFile}\n`);
