#!/usr/bin/env python3
import os
import json
import sqlite3
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'tma.db')
ADMIN_TOKEN = os.environ.get('TMA_ADMIN_TOKEN', 'change-me-please')

def init_db():
    first = not os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            name TEXT,
            anonymous_name TEXT,
            content TEXT,
            created_at TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS counters (
            key TEXT PRIMARY KEY,
            value INTEGER
        )
    ''')
    cur.execute('SELECT value FROM counters WHERE key = ?', ('anon',))
    if cur.fetchone() is None:
        cur.execute('INSERT INTO counters(key,value) VALUES(?,?)', ('anon', 0))
    conn.commit()
    conn.close()

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/posts':
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length).decode('utf-8')
            try:
                data = json.loads(raw)
            except Exception:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'invalid json')
                return
            content = (data.get('content') or '').strip()
            name = (data.get('name') or '').strip()
            if not content:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'content required')
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('BEGIN')
            cur.execute('SELECT value FROM counters WHERE key = ?', ('anon',))
            row = cur.fetchone()
            counter = (row[0] if row else 0) + 1
            cur.execute('UPDATE counters SET value = ? WHERE key = ?', (counter, 'anon'))
            anon_name = f'User #{counter}'
            post_id = datetime.utcnow().strftime('%Y%m%d%H%M%S%f') + str(counter)
            created_at = datetime.utcnow().isoformat() + 'Z'
            cur.execute('INSERT INTO posts(id, name, anonymous_name, content, created_at) VALUES (?,?,?,?,?)',
                        (post_id, name, anon_name, content, created_at))
            conn.commit()
            conn.close()
            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status':'ok'}).encode('utf-8'))
            return
        # fallback to default
        return SimpleHTTPRequestHandler.do_POST(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/admin':
            qs = parse_qs(parsed.query)
            token = qs.get('token', [None])[0]
            if token != ADMIN_TOKEN:
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b'forbidden')
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT id, anonymous_name, created_at, content FROM posts ORDER BY created_at DESC LIMIT 100')
            rows = cur.fetchall()
            conn.close()
            html = ['<!doctype html><html><head><meta charset="utf-8"><title>Admin - Recent Posts</title>'
                    '<style>body{font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:#f8fafc;padding:20px} .post{background:#0b1220;padding:12px;border-radius:8px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.04)}</style></head><body>']
            html.append('<h1>Recent posts (admin)</h1>')
            html.append('<p><a href="/">Return to public site</a></p>')
            for it in rows:
                anon = it[1]
                created = it[2]
                safe = (it[3] or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
                html.append(f'<div class="post"><div style="color:#94a3b8;font-size:0.9rem">{anon} • {created}</div>')
                html.append(f'<p style="white-space:pre-wrap;margin:8px 0">{safe}</p></div>')
            html.append('</body></html>')
            body = '\n'.join(html).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # serve static files for others
        return SimpleHTTPRequestHandler.do_GET(self)

def run():
    init_db()
    port = int(os.environ.get('PORT', '3000'))
    print('Starting server on port', port)
    print('Admin token is:', ADMIN_TOKEN)
    os.chdir(BASE_DIR)
    server = HTTPServer(('0.0.0.0', port), Handler)
    server.serve_forever()

if __name__ == '__main__':
    run()
