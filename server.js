const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.TMA_ADMIN_TOKEN || 'change-me-please';
const indexPath = path.join(__dirname, 'index.html');
const assetsDir = path.join(__dirname, 'assets');

const state = globalThis.__tmaState || (globalThis.__tmaState = { posts: [], counter: 0 });

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(indexPath);
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

app.post('/api/posts', (req, res) => {
  const { name = '', content = '' } = req.body;
  const contentTrimmed = (content || '').trim();

  if (!contentTrimmed) {
    return res.status(400).json({ error: 'content required' });
  }

  state.counter += 1;
  const anonymousName = `User #${state.counter}`;
  const postId = Date.now().toString(36) + randomBytes(3).toString('hex');
  const createdAt = new Date().toISOString();

  state.posts.unshift({
    id: postId,
    name: (name || '').trim(),
    anonymous_name: anonymousName,
    content: contentTrimmed,
    created_at: createdAt
  });

  return res.status(201).json({ status: 'ok' });
});

app.get('/admin', (req, res) => {
  const token = req.query.token || req.get('X-Admin-Token');

  if (token !== ADMIN_TOKEN) {
    return res.status(403).send('Forbidden');
  }

  const rows = state.posts.slice(0, 100);
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
