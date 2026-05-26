import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const SUPERADMIN_EMAIL = 'bigcreditossf@gmail.com';

function signToken(userId, email) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const isSuper = email.toLowerCase() === SUPERADMIN_EMAIL;
    const trialEnds = isSuper ? 'now() + interval \'100 years\'' : 'now() + interval \'3 days\'';

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
      [email, password_hash]
    );
    const user = userResult.rows[0];

    await pool.query(
      `INSERT INTO profiles (id, email, full_name, trial_ends_at) VALUES ($1, $2, $3, ${trialEnds})`,
      [user.id, user.email, fullName || null]
    );

    const role = isSuper ? 'superadmin' : 'user';
    await pool.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [user.id, role]
    );

    const profileResult = await pool.query('SELECT * FROM profiles WHERE id = $1', [user.id]);
    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [user.id]);

    const token = signToken(user.id, user.email);

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email },
      profile: profileResult.rows[0],
      roles: rolesResult.rows.map(r => r.role),
    });
  } catch (err) {
    console.error('[auth] signup error:', err);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }

    const userResult = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const profileResult = await pool.query('SELECT * FROM profiles WHERE id = $1', [user.id]);
    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [user.id]);

    const token = signToken(user.id, user.email);

    res.json({
      token,
      user: { id: user.id, email: user.email },
      profile: profileResult.rows[0],
      roles: rolesResult.rows.map(r => r.role),
    });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    const profileResult = await pool.query('SELECT * FROM profiles WHERE id = $1', [payload.sub]);
    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [payload.sub]);

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.json({
      user: { id: payload.sub, email: payload.email },
      profile: profileResult.rows[0],
      roles: rolesResult.rows.map(r => r.role),
    });
  } catch (err) {
    console.error('[auth] me error:', err);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

export default router;
