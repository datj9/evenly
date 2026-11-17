import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Works from src/ (tsx) and dist/ (bundled): both sit directly inside server/.
const serverRoot = resolve(here, '..');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbFile: process.env.DB_FILE ?? join(serverRoot, 'data', 'evenly.db'),
  clientDist: resolve(serverRoot, '..', 'client', 'dist'),
  secureCookies: process.env.SECURE_COOKIES === 'true',
};
