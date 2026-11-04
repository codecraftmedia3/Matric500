'use strict';
const express = require('express');
const { query } = require('./db');
const { requireAdmin } = require('./auth');
const { INDEX, GROUPS, TOTAL_NODES } = require('./roadmap');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const router = express.Router();
router.use(requireAdmin);

router.get('/stats', async (req, res, next) => {
  try {
    const [totals, signups, avg] = await Promise.all([
      query(`SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE account_status = 'active')::int AS active,
                    count(*) FILTER (WHERE account_status = 'banned')::int AS banned,
                    count(*) FILTER (WHERE subscription_tier = 'commercial' AND subscription_verified_until > now())::int AS commercial,
                    count(*) FILTER (WHERE registration_date > now() - interval '7 days')::int AS new7d
             FROM users`),
      query(`SELECT to_char(d, 'MM-DD') AS day, count(u.user_id)::int AS n
             FROM generate_series(current_date - 13, current_date, interval '1 day') d
             LEFT JOIN users u ON u.registration_date::date = d::date GROUP BY d ORDER BY d`),
      query(`SELECT coalesce(avg((SELECT count(*) FROM jsonb_each_text(user_progress) e WHERE e.value = 'done')), 0)::float AS avg_done FROM users`),
    ]);
    res.json({ ...totals.rows[0], totalNodes: TOTAL_NODES, avgCompletionPct: +((avg.rows[0].avg_done / TOTAL_NODES) * 100).toFixed(1), signups: signups.rows });
  } catch (err) { next(err); }
});

router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 10));
    const q = String(req.query.q || '').trim().slice(0, 80).replace(/[\\%_]/g, '\\$&');
    const status = ['active', 'banned'].includes(req.query.status) ? req.query.status : null;
    const tier = ['personal', 'commercial'].includes(req.query.tier) ? req.query.tier : null;
    const { rows } = await query(
      `SELECT user_id, name, email, registration_date, subscription_tier, subscription_verified_until, account_status, ban_reason, role, last_login_at,
              (SELECT count(*) FROM jsonb_each_text(user_progress) e WHERE e.value = 'done')::int AS done_count,
              count(*) OVER()::int AS total
       FROM users
       WHERE ($1::text IS NULL OR name ILIKE $1 OR email ILIKE $1)
         AND ($2::text IS NULL OR account_status = $2) AND ($3::text IS NULL OR subscription_tier = $3)
       ORDER BY registration_date DESC LIMIT $4 OFFSET $5`,
      [q ? `%${q}%` : null, status, tier, limit, (page - 1) * limit]);
    const total = rows[0] ? rows[0].total : 0;
    res.json({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), totalNodes: TOTAL_NODES,
      users: rows.map(({ total: _t, ...u }) => ({ ...u, completionPct: +((u.done_count / TOTAL_NODES) * 100).toFixed(1) })) });
  } catch (err) { next(err); }
});

router.get('/users/:id/progress', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const { rows } = await query('SELECT name, user_progress FROM users WHERE user_id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    const groups = Object.fromEntries(Object.entries(GROUPS).map(([k, total]) => [k, { total, done: 0, challenging: 0 }]));
    for (const [id, st] of Object.entries(rows[0].user_progress)) {
      const n = INDEX[id]; if (!n) continue;
      if (groups[n.group] && groups[n.group][st] !== undefined) groups[n.group][st]++;
    }
    res.json({ name: rows[0].name, groups: Object.entries(groups).map(([label, v]) => ({ label, ...v })) });
  } catch (err) { next(err); }
});

async function audit(adminId, targetId, action, detail) {
  await query('INSERT INTO admin_audit (admin_id, target_id, action, detail) VALUES ($1, $2, $3, $4)', [adminId, targetId, action, detail || null]);
}

/** Ban / unban. Bumps token_version so existing sessions die immediately. */
router.post('/users/:id/ban', async (req, res, next) => {
  try {
    const { id } = req.params, { banned, reason } = req.body || {};
    if (!UUID.test(id) || typeof banned !== 'boolean') return res.status(400).json({ error: 'bad_request' });
    if (id === req.user.user_id) return res.status(400).json({ error: 'cannot_ban_self' });
    const { rows } = await query(
      `UPDATE users SET account_status = $2, ban_reason = $3, token_version = token_version + 1, updated_at = now()
       WHERE user_id = $1 AND role <> 'admin' RETURNING user_id, account_status`,
      [id, banned ? 'banned' : 'active', banned ? String(reason || '').slice(0, 200) || null : null]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found_or_protected' });
    await audit(req.user.user_id, id, banned ? 'ban' : 'unban', reason);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/** Resets access tokens: every session this user holds becomes invalid; they must sign in again. */
router.post('/users/:id/reset-tokens', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const { rows } = await query('UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE user_id = $1 RETURNING user_id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    await audit(req.user.user_id, req.params.id, 'reset_tokens');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router };
