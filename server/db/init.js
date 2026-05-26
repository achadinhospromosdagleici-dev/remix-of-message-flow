import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDatabase() {
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(sql);
    console.log('[db] Schema initialized');
  } catch (err) {
    console.error('[db] Failed to initialize schema:', err);
    throw err;
  }
}

export { default as pool } from './pool.js';
