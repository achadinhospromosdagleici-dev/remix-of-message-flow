import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const typeDir = req.body.mediaType || 'misc';
    const dest = join(UPLOADS_DIR, typeDir);
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : '';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    cb(null, name);
  },
});

const upload = multer({ storage: diskStorage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

router.post('/upload', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.body.mediaType || 'misc'}/${req.file.filename}`;
    res.json({ url });
  });
});

export default router;
