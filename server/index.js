import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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

app.use('/api/proxy/wuzapi', proxyWuzapi);
app.use('/api/proxy/unoapi', proxyUnoapi);
app.use('/api/proxy/evolution', proxyEvolution);
app.use('/api/proxy/evolution-go', proxyEvolutionGo);

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

app.listen(PORT, () => {
  console.log(`[server] Rodando na porta ${PORT}`);
  console.log(`[server] Proxies:`);
  console.log(`  POST /api/proxy/wuzapi`);
  console.log(`  POST /api/proxy/unoapi`);
  console.log(`  POST /api/proxy/evolution`);
  console.log(`  POST /api/proxy/evolution-go`);
});
