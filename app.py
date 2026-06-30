import os
import sqlite3
from flask import Flask, request, jsonify, send_from_directory, abort
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'tma.db')
ADMIN_TOKEN = os.environ.get('TMA_ADMIN_TOKEN', 'change-me-please')

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    first = not os.path.exists(DB_PATH)
    conn = get_db()
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
    # ensure anon counter exists
    cur.execute('SELECT value FROM counters WHERE key = ?', ('anon',))
    if cur.fetchone() is None:
        cur.execute('INSERT INTO counters(key,value) VALUES(?,?)', ('anon', 0))
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/api/posts', methods=['POST'])
def create_post():
    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    name = (data.get('name') or '').strip()
    if not content:
        return 'content required', 400

    conn = get_db()
    cur = conn.cursor()
    # increment anon counter atomically
    cur.execute('BEGIN')
    cur.execute('SELECT value FROM counters WHERE key = ?', ('anon',))
    row = cur.fetchone()
    counter = (row['value'] if row else 0) + 1
    cur.execute('UPDATE counters SET value = ? WHERE key = ?', (counter, 'anon'))

    anon_name = f'User #{counter}'
    post_id = datetime.utcnow().strftime('%Y%m%d%H%M%S%f') + str(counter)
    created_at = datetime.utcnow().isoformat() + 'Z'
    cur.execute('INSERT INTO posts(id, name, anonymous_name, content, created_at) VALUES (?,?,?,?,?)',
                (post_id, name, anon_name, content, created_at))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'}), 201

@app.route('/admin')
def admin_view():
    token = request.args.get('token') or request.headers.get('X-Admin-Token')
    if token != ADMIN_TOKEN:
        abort(403)
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, anonymous_name, created_at, content FROM posts ORDER BY created_at DESC LIMIT 100')
    rows = cur.fetchall()
    items = [dict(r) for r in rows]
    # render a simple HTML page
    html = ['<!doctype html><html><head><meta charset="utf-8"><title>Admin - Recent Posts</title>'
            '<style>body{font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:#f8fafc;padding:20px} .post{background:#0b1220;padding:12px;border-radius:8px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.04)}</style></head><body>']
    html.append('<h1>Recent posts (admin)</h1>')
    html.append('<p><a href="/">Return to public site</a></p>')
    for it in items:
        html.append(f'<div class="post"><div style="color:#94a3b8;font-size:0.9rem">{it["anonymous_name"]} • {it["created_at"]}</div>')
        safe = (it['content'] or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        html.append(f'<p style="white-space:pre-wrap;margin:8px 0">{safe}</p></div>')
    html.append('</body></html>')
    return '\n'.join(html)

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)

if __name__ == '__main__':
    init_db()
    print('Admin token is:', ADMIN_TOKEN)
    app.run(host='0.0.0.0', port=3000)
