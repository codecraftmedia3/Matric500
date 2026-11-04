'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const { query } = require('./db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET missing/short: using a temporary one (logins reset on restart). Set JWT_SECRET in .env');
}
const COOKIE = 'm500_session';
const isProd = process.env.NODE_ENV === 'production';
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const adminEmails = new Set((process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

const cookieOpts = { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000 };
const sign = (u) => jwt.sign({ sub: u.user_id, tv: u.token_version }, process.env.JWT_SECRET, { expiresIn: '7d' });

/** Optional auth: attaches req.user when the session is valid. Banned users are refused everywhere. */
async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies[COOKIE];
  if (!token) return next();
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query('SELECT * FROM users WHERE user_id = $1', [p.sub]);
    const u = rows[0];
    if (!u || u.token_version !== p.tv) { res.clearCookie(COOKIE); return next(); } // revoked or deleted
    if (u.account_status === 'banned') { res.clearCookie(COOKIE); return res.status(403).json({ error: 'account_banned' }); }
    req.user = u;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') res.clearCookie(COOKIE);
    else console.error('[auth] session lookup failed:', err.code || err.message);
    req.user = null; next();   // never block public content because of a session/db problem
  }
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'auth_required' }));
const requireAdmin = (req, res, next) =>
  !req.user ? res.status(401).json({ error: 'auth_required' })
  : req.user.role !== 'admin' ? res.status(403).json({ error: 'forbidden' }) : next();
/** Cheap CSRF defence: browsers can't add this header cross-site without a CORS preflight we never allow. */
const requireFetchHeader = (req, res, next) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('X-Requested-With') === 'fetch' ? next() : res.status(403).json({ error: 'csrf' });

const router = express.Router();

router.post('/google', async (req, res, next) => {
  try {
    const credential = req.body && req.body.credential;
    if (typeof credential !== 'string' || credential.length > 4096) return res.status(400).json({ error: 'bad_request' });
    let payload;
    try {
      payload = (await google.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })).getPayload();
    } catch { return res.status(401).json({ error: 'invalid_google_token' }); }
    if (!payload.email || !payload.email_verified) return res.status(401).json({ error: 'email_not_verified' });

    const isAdmin = adminEmails.has(payload.email.toLowerCase());
    const { rows } = await query(
      `INSERT INTO users (name, email, google_id, role, last_login_at)
       VALUES ($1, $2, $3, CASE WHEN $4 THEN 'admin' ELSE 'user' END, now())
       ON CONFLICT (google_id) DO UPDATE
         SET name = EXCLUDED.name, email = EXCLUDED.email, last_login_at = now(),
             role = CASE WHEN $4 THEN 'admin' ELSE users.role END
       RETURNING *`,
      [payload.name || payload.email.split('@')[0], payload.email, payload.sub, isAdmin]
    );
    const user = rows[0];
    if (user.account_status === 'banned') return res.status(403).json({ error: 'account_banned' });
    res.cookie(COOKIE, sign(user), cookieOpts).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email_in_use' });
    next(err);
  }
});

const safeEq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

/** Admin sign-in with ADMIN_EMAIL / ADMIN_PASSWORD from .env (no Google needed). */
router.post('/admin-login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const AE = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), AP = process.env.ADMIN_PASSWORD || '';
    if (!AE || !AP) return res.status(503).json({ error: 'admin_login_not_configured' });
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'bad_request' });
    if (!(safeEq(email.trim().toLowerCase(), AE) & safeEq(password, AP))) return res.status(401).json({ error: 'invalid_credentials' });
    const { rows } = await query(
      `INSERT INTO users (name, email, google_id, role, last_login_at) VALUES ('Admin', $1, $2, 'admin', now())
       ON CONFLICT (google_id) DO UPDATE SET role = 'admin', account_status = 'active', last_login_at = now() RETURNING *`,
      [AE, 'local:' + AE]);
    res.cookie(COOKIE, sign(rows[0]), cookieOpts).json({ ok: true, admin: true });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => res.clearCookie(COOKIE).json({ ok: true }));

module.exports = { router, loadUser, requireAuth, requireAdmin, requireFetchHeader };
