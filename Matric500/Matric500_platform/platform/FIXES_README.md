# Matric500 – what changed

1. "Could not load the roadmap" – fixed. The server now starts even if the database is down, and the page falls back to bundled `client/data/roadmap-data.json` if the API can't be reached (works on plain static hosting too).
2. Login – fixed. Tables are created automatically at startup; a missing JWT_SECRET no longer crashes the server; DB errors no longer break public pages. New **Admin sign in** (email + password) in the login popup.
3. No premium lock – every subject and Grade 9-12 is open to everyone (guests, users, admins). Billing/upgrade code removed.
4. Admin has full access at `/admin` (stats, users, ban/unban, reset sessions).

## Run
cd server && cp .env.example .env   # fill JWT_SECRET, DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm install && npm start            # open http://localhost:3000
