import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.js';
import { loadSession, requireCsrfHeader } from './auth.js';
import { apiRoutes, authRoutes } from './routes.js';
import { errorHandler } from './http.js';

export interface AppOptions {
  secureCookies?: boolean;
  /** Serve a built client from this folder (production). */
  staticDir?: string;
}

export function createApp(db: DB, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', requireCsrfHeader, loadSession(db));
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRoutes(db, { secureCookies: options.secureCookies ?? false }));
  app.use('/api', apiRoutes(db));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const staticDir = options.staticDir;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
