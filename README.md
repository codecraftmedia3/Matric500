# Matric500
All files live in the project root (no sub-folders).
- Public: index.html, app.js, roadmap-data.json
- Server: server.js, auth.js, roadmap.js, admin.js, db.js, schema.sql, admin.html
## Run
cp .env.example .env  (fill in values) && npm install && npm start
## Render
Root directory: (blank) · Build: npm install · Start: npm start
## GitHub Pages (static, no login)
Settings > Pages > deploy from main / root. The roadmap loads from roadmap-data.json.

## Design
Redesigned with the LearNix-inspired look: see ../Matric500-design/DESIGN.md. Colours and fonts are set in the Tailwind config at the top of index.html and admin.html.
