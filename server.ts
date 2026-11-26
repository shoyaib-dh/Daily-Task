import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './src/server/authRoutes.ts';
import coreRoutes from './src/server/coreRoutes.ts';
import dataFinanceFileRoutes from './src/server/dataFinanceFileRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);

  // Security headers (iframe-compatible)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Mount API routes
  app.use('/api/auth', authRoutes);
  app.use('/api', coreRoutes);
  app.use('/api', dataFinanceFileRoutes);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler (including multer file size errors)
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the 8 MB maximum size limit.' });
      }
      console.error('Unhandled server error:', err);
      return res.status(500).json({ error: 'An unexpected server error occurred.' });
    }
  );

  // Vite middleware in development; static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`POMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
