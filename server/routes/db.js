import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const USER_SCOPED_TABLES = new Set([
  'unoapi_settings', 'evolution_settings', 'evolution_go_settings',
  'chatwoot_settings', 'ai_settings', 'wuzapi_settings',
  'wuzapi_instances', 'user_instances', 'user_settings',
  'blacklist', 'phone_mappings', 'message_templates',
  'media_library', 'short_links', 'profiles', 'user_roles',
]);

const ADMIN_TABLES = new Set(['system_settings']);

function isUserScoped(table) {
  return USER_SCOPED_TABLES.has(table);
}

function isAdminTable(table) {
  return ADMIN_TABLES.has(table);
}

function sanitizeTable(table) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table name');
  return table;
}

async function isSuperadmin(userId) {
  const result = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return result.rows.some(r => r.role === 'superadmin');
}

// GET /api/db/:table — list records
router.get('/:table', async (req, res) => {
  try {
    const table = sanitizeTable(req.params.table);
    const userId = req.user.id;

    let sql = `SELECT * FROM ${table}`;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (isUserScoped(table)) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'limit' || key === 'offset' || key === 'order') continue;
      const col = key.replace(/[^a-z_]/g, '');
      if (!col) continue;
      conditions.push(`${col} = $${paramIndex++}`);
      params.push(value);
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');

    const order = req.query.order || 'created_at.desc';
    const [orderCol, orderDir] = order.split('.');
    if (/^[a-z_]+$/.test(orderCol) && /^(asc|desc)$/i.test(orderDir)) {
      sql += ` ORDER BY ${orderCol} ${orderDir}`;
    }

    if (req.query.limit) {
      const limit = parseInt(req.query.limit);
      if (!isNaN(limit) && limit > 0) { sql += ` LIMIT $${paramIndex++}`; params.push(limit); }
    }
    if (req.query.offset) {
      const offset = parseInt(req.query.offset);
      if (!isNaN(offset) && offset >= 0) { sql += ` OFFSET $${paramIndex++}`; params.push(offset); }
    }

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[db] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/db/:table/:id — get single record
router.get('/:table/:id', async (req, res) => {
  try {
    const table = sanitizeTable(req.params.table);
    const userId = req.user.id;
    const id = req.params.id;

    let sql, params;
    if (isUserScoped(table)) {
      sql = `SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`;
      params = [id, userId];
    } else {
      sql = `SELECT * FROM ${table} WHERE id = $1`;
      params = [id];
    }

    const result = await pool.query(sql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[db] get error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/db/:table — insert/upsert
router.post('/:table', async (req, res) => {
  try {
    const table = sanitizeTable(req.params.table);
    const userId = req.user.id;
    const body = { ...req.body };

    if (isUserScoped(table)) {
      body.user_id = userId;
    } else if (isAdminTable(table)) {
      if (!(await isSuperadmin(userId))) {
        return res.status(403).json({ error: 'Apenas superadmin' });
      }
      body.updated_by = userId;
    }

    const columns = Object.keys(body);
    const values = Object.values(body);
    const placeholders = values.map((_, i) => `$${i + 1}`);
    const onConflict = req.query.onConflict;

    let sql;
    if (onConflict) {
      const conflictCols = onConflict.split(',').map(c => c.trim()).filter(c => /^[a-z_]+$/.test(c));
      const updateSet = columns
        .filter(c => c !== 'id' && c !== 'created_at')
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(', ');

      sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
             ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ${updateSet}
             RETURNING *`;
    } else {
      sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
             RETURNING *`;
    }

    const result = await pool.query(sql, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[db] insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/db/:table/:id — update
router.put('/:table/:id', async (req, res) => {
  try {
    const table = sanitizeTable(req.params.table);
    const userId = req.user.id;
    const id = req.params.id;

    if (isAdminTable(table) && !(await isSuperadmin(userId))) {
      return res.status(403).json({ error: 'Apenas superadmin' });
    }

    const body = { ...req.body };
    delete body.id;
    delete body.user_id;
    delete body.created_at;

    const columns = Object.keys(body);
    if (columns.length === 0) return res.status(400).json({ error: 'No fields to update' });

    const setClause = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const values = Object.values(body);
    let whereClause, allValues;

    if (isUserScoped(table)) {
      whereClause = `id = $${columns.length + 1} AND user_id = $${columns.length + 2}`;
      allValues = [...values, id, userId];
    } else {
      whereClause = `id = $${columns.length + 1}`;
      allValues = [...values, id];
    }

    const result = await pool.query(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`,
      allValues
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[db] update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/db/:table/:id — delete
router.delete('/:table/:id', async (req, res) => {
  try {
    const table = sanitizeTable(req.params.table);
    const userId = req.user.id;
    const id = req.params.id;

    if (isAdminTable(table) && !(await isSuperadmin(userId))) {
      return res.status(403).json({ error: 'Apenas superadmin' });
    }

    let sql, params;
    if (isUserScoped(table)) {
      sql = `DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING *`;
      params = [id, userId];
    } else {
      sql = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
      params = [id];
    }

    const result = await pool.query(sql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[db] delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
