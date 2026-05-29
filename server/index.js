import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { initDatabase } from './db/init.js';
import authRoutes from './routes/auth.js';
import dbRoutes from './routes/db.js';
import linkRedirectRoutes from './routes/linkRedirect.js';
import uploadRoutes from './routes/upload.js';
import { requireAuth } from './middleware/auth.js';

import proxyWuzapi from './routes/proxy/wuzapi.js';
import proxyUnoapi from './routes/proxy/unoapi.js';
import proxyEvolution from './routes/proxy/evolution.js';
import proxyEvolutionGo from './routes/proxy/evolution-go.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '..', 'dist');
const indexHtml = join(distDir, 'index.html');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-client-info'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── API routes ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/auth', authRoutes);

app.use('/api/db', requireAuth, dbRoutes);

app.use('/api', linkRedirectRoutes);
app.use('/api', uploadRoutes);

app.use('/uploads', express.static(join(__dirname, 'uploads')));

app.use('/api/proxy/wuzapi', requireAuth, proxyWuzapi);
app.use('/api/proxy/unoapi', requireAuth, proxyUnoapi);
app.use('/api/proxy/evolution', requireAuth, proxyEvolution);
app.use('/api/proxy/evolution-go', requireAuth, proxyEvolutionGo);

// ── Static frontend (production) ──
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log(`[server] Servindo frontend de: ${distDir}`);

  // SPA fallback: toda rota não-API serve o index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(indexHtml);
  });
} else {
  console.log('[server] Modo API-only (frontend via Vite dev server)');
}

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[server] Error:', err);
  res.status(500).json({
    error: err.message || 'Erro interno do servidor',
    type: err.constructor?.name || typeof err,
  });
});

async function start() {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('[server] Database init failed, continuing without DB:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Rodando na porta ${PORT}`);
    console.log(`[server] Auth routes:`);
    console.log(`  POST /api/auth/signup`);
    console.log(`  POST /api/auth/login`);
    console.log(`  GET  /api/auth/me`);
    console.log(`[server] DB CRUD (protegido por JWT):`);
    console.log(`  GET/POST/PUT/DEL /api/db/:table`);
    console.log(`[server] Link redirect:`);
    console.log(`  POST /api/link-redirect`);
    console.log(`[server] Proxies (protegidas por JWT):`);
    console.log(`  POST /api/proxy/wuzapi`);
    console.log(`  POST /api/proxy/unoapi`);
    console.log(`  POST /api/proxy/evolution`);
    console.log(`  POST /api/proxy/evolution-go`);
  });
}

start();
