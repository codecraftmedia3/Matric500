'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const auth = require('./auth');
const roadmap = require('./roadmap');
const admin = require('./admin');

/* ---------- fail fast on bad configuration ---------- */
if (!process.env.GOOGLE_CLIENT_ID) console.warn('[config] GOOGLE_CLIENT_ID not set: Google sign-in is disabled');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  // Google sign-in opens a popup that must talk back to this page; helmet's default (same-origin) blocks that and leaves it stuck on accounts.google.com/gsi/transform
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    // 'unsafe-inline' + cdn.tailwindcss.com are only needed for the in-browser Tailwind build. Compile Tailwind for production and drop both.
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://accounts.google.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
    connectSrc: ["'self'", 'https://accounts.google.com'],
    frameSrc: ["'self'", 'https://accounts.google.com'],
  } },
}));
app.use(compression());

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', auth.requireFetchHeader, auth.loadUser, roadmap.entitlements);

app.use('/api/auth', auth.router);
app.use('/api', roadmap.router);                  // public roadmap routes, gated by entitlements middleware
app.use('/api/admin', admin.router);              // admin-only

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// Admin page shell is only served to signed-in admins
app.get('/admin', auth.loadUser, (req, res) =>
  req.user && req.user.role === 'admin' ? res.sendFile(path.join(__dirname, 'admin.html')) : res.redirect('/'));

// Only these public files are served (everything else in this folder, e.g. server code and .env, stays private)
const PUBLIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/login': 'login.html', '/login.html': 'login.html', '/login.js': 'login.js', '/roadmap-data.json': 'roadmap-data.json' };
app.get(Object.keys(PUBLIC), (req, res) => res.sendFile(path.join(__dirname, PUBLIC[req.path]), { maxAge: '5m' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.code || '', err.message);
  res.status(500).json({ error: 'server_error' });
});

(async () => {
  try {
    // The roadmap is public and works even if the database is down; only sign-in/admin/progress-sync need it.
    await db.connectDb(3, 1000).catch((err) => console.error('[startup] running WITHOUT database (login/admin disabled):', err.message));
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, () => console.log(`[server] http://localhost:${port}`));
    const stop = () => server.close(() => Promise.resolve(db.close()).then(() => process.exit(0)));
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  } catch (err) { console.error('[startup]', err.message); process.exit(1); }
})();
