import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.post('/link-redirect', async (req, res) => {
  try {
    const { slug, referrer = '', utm_source = null, utm_medium = null, utm_campaign = null } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug required' });

    const result = await pool.query(
      `UPDATE short_links SET click_count = click_count + 1 WHERE slug = $1 AND is_active = true RETURNING id, phone, message`,
      [slug]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'link not found' });

    const link = result.rows[0];
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || null;
    const ua = req.headers['user-agent'] || '';

    await pool.query(
      `INSERT INTO link_clicks (link_id, ip, referrer, utm_source, utm_medium, utm_campaign, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [link.id, ip, referrer || null, utm_source, utm_medium, utm_campaign, ua]
    );

    const cleanPhone = String(link.phone).replace(/\D/g, '');
    const url = link.message
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(link.message)}`
      : `https://wa.me/${cleanPhone}`;

    res.json({ url });
  } catch (err) {
    console.error('link-redirect error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
