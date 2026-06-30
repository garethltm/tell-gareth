Tell Me Anything - Local Prototype

This folder contains a small prototype web app where visitors can post anonymously.

Key points:
- Public site lets anyone submit a post, but posts are private and only visible to an admin.
- Admin views recent posts by visiting `/admin?token=YOUR_TOKEN`.

Quick start:

```bash
cd ~/tell-me-anything
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# set a secure admin token before running (optional):
export TMA_ADMIN_TOKEN="my-secret-token"
python3 app.py
```

Open http://localhost:3000 in your browser. Then visit `http://localhost:3000/admin?token=MY_TOKEN` replacing MY_TOKEN with the printed token or the one you set.
