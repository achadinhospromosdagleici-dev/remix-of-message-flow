import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'remix',
  password: process.env.PG_PASSWORD || 'remix123',
  database: process.env.PG_DATABASE || 'remix',
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] Pool error:', err);
});

export default pool;
