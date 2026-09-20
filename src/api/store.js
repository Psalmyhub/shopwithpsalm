const { Pool } = require('pg');

const ADMIN_SECRET = "admin123"; // must match ADMIN_PASSWORD in admin.html

const CONNECTION_STRING =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

let pool;
function getPool() {
  if (!pool) {
    if (!CONNECTION_STRING) {
      throw new Error('No database connection string found in environment variables.');
    }
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY,
      data JSONB DEFAULT '{}'::jsonb
    );
  `);
  await client.query(`
    INSERT INTO settings (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function migrateOldData(client) {
  try {
    const { rows } = await client.query(`
      SELECT to_regclass('public.app_data') as exists;
    `);
    if (!rows[0] || !rows[0].exists) return;

    const countResult = await client.query('SELECT COUNT(*) FROM products;');
    if (parseInt(countResult.rows[0].count, 10) > 0) return;

    const old = await client.query('SELECT settings, products FROM app_data WHERE id = 1;');
    if (!old.rows[0]) return;

    const oldSettings = old.rows[0].settings || {};
    const oldProducts = old.rows[0].products || [];

    if (Object.keys(oldSettings).length > 0) {
      await client.query('UPDATE settings SET data = $1::jsonb WHERE id = 1;', [JSON.stringify(oldSettings)]);
    }
    for (const p of oldProducts) {
      if (p && p.id) {
        await client.query(
          `INSERT INTO products (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING;`,
          [p.id, JSON.stringify(p)]
        );
      }
    }
  } catch (e) {
    console.error('Migration check failed (non-fatal):', e);
  }
}

module.exports = async (req, res) => {
  let client;
  try {
    client = await getPool().connect();
    await ensureTables(client);
    await migrateOldData(client);

    if (req.method === 'GET') {
      const settingsResult = await client.query('SELECT data FROM settings WHERE id = 1;');
      const productsResult = await client.query('SELECT data FROM products ORDER BY created_at ASC;');
      res.status(200).json({
        settings: (settingsResult.rows[0] && settingsResult.rows[0].data) || {},
        products: productsResult.rows.map(r => r.data)
      });
      return;
    }

    if (req.method === 'POST') {
      const secret = req.headers['x-admin-secret'];
      if (secret !== ADMIN_SECRET) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const { action } = body || {};

      if (action === 'saveSettings') {
        await client.query('UPDATE settings SET data = $1::jsonb WHERE id = 1;', [JSON.stringify(body.settings || {})]);
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'upsertProduct') {
        const product = body.product;
        if (!product || !product.id) {
          res.status(400).json({ error: 'Missing product or product.id' });
          return;
        }
        await client.query(
          `INSERT INTO products (id, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO UPDATE SET data = $2::jsonb;`,
          [product.id, JSON.stringify(product)]
        );
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'deleteProduct') {
        const id = body.id;
        if (!id) {
          res.status(400).json({ error: 'Missing id' });
          return;
        }
        await client.query('DELETE FROM products WHERE id = $1;', [id]);
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API /api/store error:', err);
    res.status(500).json({ error: err.message || String(err) });
  } finally {
    if (client) client.release();
  }
};
