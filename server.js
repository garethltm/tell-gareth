const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.TMA_ADMIN_TOKEN || 'change-me-please';
const indexPath = path.join(__dirname, 'index.html');
const assetsDir = path.join(__dirname, 'assets');

app.use(express.json());

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

let dbReady = false;

async function ensureDb() {
  if (!pool) {
    throw new Error('DATABASE_URL is not set');
  }
  if (dbReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      name TEXT,
      anonymous_name TEXT,
      content TEXT,
      created_at TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS counters (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )
  `);

  await pool.query(`
    INSERT INTO counters (key, value)
    VALUES ('anon', 0)
    ON CONFLICT (key) DO NOTHING
  `);

  dbReady = true;
}

app.get('/', (req, res) => {
  res.sendFile(indexPath);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, dbConfigured: Boolean(pool) });
});

app.get('/assets/:file(*)', (req, res) => {
  const file = req.params.file;
  const filePath = path.join(assetsDir, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Asset not found');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ico': 'image/x-icon'
  };

  res.type(mimeTypes[ext] || 'application/octet-stream');
  res.sendFile(filePath);
});

app.post('/api/posts', async (req, res) => {
  try {
    const { name = '', content = '' } = req.body;
    const contentTrimmed = (content || '').trim();

    if (!contentTrimmed) {
      return res.status(400).json({ error: 'content required' });
    }

    if (!pool) {
      return res.status(503).json({ error: 'Database is not configured yet' });
    }

    await ensureDb();

    const counterResult = await pool.query(
      "UPDATE counters SET value = value + 1 WHERE key = $1 RETURNING value",
      ['anon']
    );

    const counter = counterResult.rows[0]?.value ?? 1;
    const anonymousName = `User #${counter}`;
    const postId = Date.now().toString(36) + randomBytes(3).toString('hex');
    const createdAt = new Date().toISOString();

    await pool.query(
      'INSERT INTO posts (id, name, anonymous_name, content, created_at) VALUES ($1, $2, $3, $4, $5)',
      [postId, (name || '').trim(), anonymousName, contentTrimmed, createdAt]
    );

    return res.status(201).json({ status: 'ok' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.get('/admin', async (req, res) => {
  try {
    const token = req.query.token || req.get('X-Admin-Token');

    if (token !== ADMIN_TOKEN) {
      return res.status(403).send('Forbidden');
    }

    if (!pool) {
      return res.status(503).send('Database is not configured yet. Add DATABASE_URL in Vercel to enable persistence.');
    }

    await ensureDb();
    const { rows } = await pool.query(
      'SELECT id, name, anonymous_name, created_at, content FROM posts ORDER BY created_at DESC LIMIT 100'
    );

    const cards = rows.map((row) => {
      const displayName = (row.name || '').trim() ? row.name : row.anonymous_name;
      const badge = (row.name || '').trim() ? 'Named' : 'Anonymous';
      return `
        <article class="post">
          <div class="post-top">
            <div>
              <div class="name">${escapeHtml(displayName)}</div>
              <div class="meta">${escapeHtml(badge)} • ${escapeHtml(row.created_at)}</div>
            </div>
            <span class="pill">${escapeHtml(row.anonymous_name)}</span>
          </div>
          <p>${escapeHtml(row.content)}</p>
        </article>
      `;
    }).join('');

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Admin - Recent Posts</title>
        <style>
          :root { color-scheme: dark; }
          body {
            margin: 0;
            font-family: Inter, Arial, sans-serif;
            background: linear-gradient(135deg, #020617, #0f172a 45%, #111827);
            color: #f8fafc;
            padding: 24px;
          }
          .shell {
            max-width: 900px;
            margin: 0 auto;
          }
          .hero {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 18px;
          }
          h1 { margin: 0; font-size: 1.8rem; }
          .sub { color: #94a3b8; margin-top: 4px; }
          .link {
            color: #38bdf8;
            text-decoration: none;
            background: rgba(56, 189, 248, 0.12);
            padding: 8px 12px;
            border-radius: 999px;
            border: 1px solid rgba(56, 189, 248, 0.24);
          }
          .post {
            background: rgba(15, 23, 42, 0.9);
            padding: 16px;
            border-radius: 16px;
            margin-bottom: 14px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
          }
          .post-top { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px; }
          .name { font-size: 1.05rem; font-weight: 700; }
          .meta { color: #94a3b8; font-size: 0.9rem; margin-top: 3px; }
          .pill {
            font-size: 0.8rem;
            color: #cbd5e1;
            background: rgba(167, 139, 250, 0.16);
            border: 1px solid rgba(167, 139, 250, 0.24);
            padding: 5px 8px;
            border-radius: 999px;
          }
          p { white-space: pre-wrap; margin: 8px 0 0; line-height: 1.55; color: #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="hero">
            <div>
              <h1>Recent posts</h1>
              <div class="sub">A cleaner overview of the latest Tell Gareth submissions.</div>
            </div>
            <a class="link" href="/">Return to public site</a>
          </div>
          ${cards}
        </div>
      </body>
      </html>
    `;
    res.type('text/html').send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send('Database error');
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not found' });
  }
  res.sendFile(indexPath);
});

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return (text || '').replace(/[&<>"']/g, m => map[m]);
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Admin token: ${ADMIN_TOKEN}`);
    console.log(`Admin panel: http://localhost:${port}/admin?token=${ADMIN_TOKEN}`);
  });
}

module.exports = app;
module.exports.handler = app;
