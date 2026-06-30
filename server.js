const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { randomBytes } = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'tma.db');
const ADMIN_TOKEN = process.env.TMA_ADMIN_TOKEN || 'change-me-please';

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Initialize database
function initDB() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            name TEXT,
            anonymous_name TEXT,
            content TEXT,
            created_at TEXT
          )
        `);
        
        db.run(`
          CREATE TABLE IF NOT EXISTS counters (
            key TEXT PRIMARY KEY,
            value INTEGER
          )
        `);
        
        db.get('SELECT value FROM counters WHERE key = ?', ['anon'], (err, row) => {
          if (!row) {
            db.run('INSERT INTO counters(key,value) VALUES(?,?)', ['anon', 0]);
          }
          resolve(db);
        });
      });
    });
  });
}

let db;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/posts', (req, res) => {
  const { name = '', content = '' } = req.body;
  const contentTrimmed = (content || '').trim();
  
  if (!contentTrimmed) {
    return res.status(400).json({ error: 'content required' });
  }

  db.serialize(() => {
    db.run('BEGIN');
    db.get('SELECT value FROM counters WHERE key = ?', ['anon'], (err, row) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'db error' });
      }

      const counter = (row?.value || 0) + 1;
      const anonymousName = `User #${counter}`;
      const postId = Date.now().toString(36) + randomBytes(3).toString('hex');
      const createdAt = new Date().toISOString();

      db.run('UPDATE counters SET value = ? WHERE key = ?', [counter, 'anon'], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'db error' });
        }

        db.run(
          'INSERT INTO posts(id, name, anonymous_name, content, created_at) VALUES (?,?,?,?,?)',
          [postId, name, anonymousName, contentTrimmed, createdAt],
          (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'db error' });
            }
            db.run('COMMIT');
            res.status(201).json({ status: 'ok' });
          }
        );
      });
    });
  });
});

app.get('/admin', (req, res) => {
  const token = req.query.token || req.get('X-Admin-Token');
  
  if (token !== ADMIN_TOKEN) {
    return res.status(403).send('Forbidden');
  }

  db.all('SELECT id, anonymous_name, created_at, content FROM posts ORDER BY created_at DESC LIMIT 100', (err, rows) => {
    if (err) {
      return res.status(500).send('Database error');
    }

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Admin - Recent Posts</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
          .post { background: #0b1220; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.04); }
          .meta { color: #94a3b8; font-size: 0.9rem; margin-bottom: 6px; }
          p { white-space: pre-wrap; margin: 8px 0; }
          a { color: #38bdf8; text-decoration: none; }
        </style>
      </head>
      <body>
        <h1>Recent posts (admin)</h1>
        <p><a href="/">Return to public site</a></p>
        ${rows.map(row => `
          <div class="post">
            <div class="meta">${escapeHtml(row.anonymous_name)} • ${row.created_at}</div>
            <p>${escapeHtml(row.content)}</p>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    res.type('text/html').send(html);
  });
});

// Helper function
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

// Start server
initDB().then(database => {
  db = database;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Admin token: ${ADMIN_TOKEN}`);
    console.log(`Admin panel: http://localhost:${port}/admin?token=${ADMIN_TOKEN}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
