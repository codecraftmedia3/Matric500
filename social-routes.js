'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, withTransaction } = require('./db');
const { requireAuth, requireAdmin, requireTier2, isTier2 } = require('./auth');

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_BIGINT = 9223372036854775807n;
const REACTION_TYPES = new Set(['like', 'love', 'helpful', 'insightful']);

const SIGNATURES = {
  'image/jpeg': (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (buffer) => buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP',
};

function parseImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || buffer.toString('base64') !== match[2]) return null;
  return SIGNATURES[match[1]](buffer) ? { type: match[1], buffer } : null;
}

const text = (value, max) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
};

const validId = (value) => {
  if (!/^\d{1,19}$/.test(value)) return false;
  try { return BigInt(value) <= MAX_BIGINT; } catch { return false; }
};

function encodePostCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: new Date(row.created_at).toISOString(), id: String(row.id) }), 'utf8').toString('base64url');
}

function decodePostCursor(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{1,19}$/.test(value)) return { id: value, legacy: true };
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || !validId(parsed.id) || typeof parsed.createdAt !== 'string') return null;
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    return { id: parsed.id, createdAt: createdAt.toISOString() };
  } catch { return null; }
}

const limitFor = (value, fallback = 20) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(Math.trunc(number), 1), 50) : fallback;
};

const postShape = (row, currentUserId) => ({
  id: String(row.id),
  kind: row.post_kind,
  title: row.title,
  body: row.body,
  published: row.published,
  hasImage: row.has_image,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  author: {
    id: row.author_id ? String(row.author_id) : null,
    name: row.author_name || 'Matric500',
  },
  reactionCounts: row.reaction_counts || {},
  reactionCount: Number(row.reaction_count || 0),
  commentCount: Number(row.comment_count || 0),
  currentReaction: row.current_reaction || null,
  mine: !!(currentUserId && row.author_id === currentUserId),
});

const reportSubmissionLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'report_rate_limited' },
});

function validStoredImage(row) {
  if (!row?.image_data || !SIGNATURES[row.image_type]) return false;
  if (row.image_data.length > MAX_IMAGE_BYTES) return false;
  return SIGNATURES[row.image_type](row.image_data);
}

const user = express.Router();

user.get('/posts', async (req, res, next) => {
  try {
    const limit = limitFor(req.query.limit, 10);
    const kind = req.query.kind;
    if (kind && kind !== 'official' && kind !== 'community') return res.status(400).json({ error: 'bad_kind' });

    const before = req.query.before;
    const cursor = before ? decodePostCursor(before) : null;
    if (before && !cursor) return res.status(400).json({ error: 'invalid_cursor' });
    const cursorId = cursor?.legacy ? cursor.id : cursor?.id || String(MAX_BIGINT);
    const cursorCreatedAt = cursor?.legacy ? null : cursor?.createdAt || null;
    const currentUserId = req.user?.user_id || '00000000-0000-0000-0000-000000000000';
    const selectSql = `
      SELECT n.id, n.post_kind, n.title, n.body, n.published,
             (n.image_data IS NOT NULL) AS has_image, n.created_at, n.updated_at,
             n.author_id, u.name AS author_name,
             COALESCE(r.reaction_counts, '{}'::jsonb) AS reaction_counts,
             COALESCE(r.reaction_count, 0)::bigint AS reaction_count,
             COALESCE(c.comment_count, 0)::bigint AS comment_count,
             cr.reaction_type AS current_reaction
        FROM news_posts n
        LEFT JOIN users u ON u.user_id = n.author_id
        LEFT JOIN LATERAL (
          SELECT jsonb_object_agg(reaction_type, reaction_count) AS reaction_counts,
                 SUM(reaction_count)::bigint AS reaction_count
            FROM (SELECT reaction_type, COUNT(*)::int AS reaction_count
                    FROM post_reactions WHERE post_id = n.id GROUP BY reaction_type) counts
        ) r ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS comment_count FROM post_comments
           WHERE post_id = n.id AND deleted_at IS NULL
        ) c ON true
        LEFT JOIN post_reactions cr ON cr.post_id = n.id AND cr.user_id = $1::uuid
       WHERE n.published
    `;

    let sql;
    let params;
    if (cursor?.legacy) {
      sql = selectSql + (kind ? ' AND n.post_kind = $2 AND n.id < $3::bigint ORDER BY n.created_at DESC, n.id DESC LIMIT $4' : ' AND n.id < $2::bigint ORDER BY n.created_at DESC, n.id DESC LIMIT $3');
      params = kind ? [currentUserId, kind, cursor.id, limit + 1] : [currentUserId, cursor.id, limit + 1];
    } else if (cursor) {
      sql = selectSql + (kind
        ? ' AND n.post_kind = $2 AND (n.created_at, n.id) < ($3::timestamptz, $4::bigint) ORDER BY n.created_at DESC, n.id DESC LIMIT $5'
        : ' AND (n.created_at, n.id) < ($2::timestamptz, $3::bigint) ORDER BY n.created_at DESC, n.id DESC LIMIT $4');
      params = kind
        ? [currentUserId, kind, cursor.createdAt, cursor.id, limit + 1]
        : [currentUserId, cursor.createdAt, cursor.id, limit + 1];
    } else {
      sql = selectSql + (kind
        ? ' AND n.post_kind = $2 ORDER BY n.created_at DESC, n.id DESC LIMIT $3'
        : ' ORDER BY n.created_at DESC, n.id DESC LIMIT $2');
      params = kind ? [currentUserId, kind, limit + 1] : [currentUserId, limit + 1];
    }

    const { rows } = await query(sql, params);
    const page = rows.slice(0, limit);
    res.json({
      posts: page.map((row) => postShape(row, req.user?.user_id)),
      nextBefore: rows.length > limit ? encodePostCursor(page[page.length - 1]) : null,
    });
  } catch (err) { next(err); }
});

user.get('/posts/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'not_found' });
    const { rows } = await query(`
      SELECT n.id, n.post_kind, n.title, n.body, n.published,
             (n.image_data IS NOT NULL) AS has_image, n.created_at, n.updated_at,
             n.author_id, u.name AS author_name,
             COALESCE((SELECT jsonb_object_agg(reaction_type, reaction_count)
               FROM (SELECT reaction_type, COUNT(*)::int reaction_count
                       FROM post_reactions WHERE post_id = n.id GROUP BY reaction_type) counts), '{}'::jsonb) AS reaction_counts,
             COALESCE((SELECT COUNT(*) FROM post_reactions WHERE post_id = n.id), 0)::bigint AS reaction_count,
             COALESCE((SELECT COUNT(*) FROM post_comments WHERE post_id = n.id AND deleted_at IS NULL), 0)::bigint AS comment_count,
             (SELECT reaction_type FROM post_reactions
               WHERE post_id = n.id AND user_id = $2::uuid) AS current_reaction
        FROM news_posts n LEFT JOIN users u ON u.user_id = n.author_id
       WHERE n.id = $1::bigint
         AND (n.published OR $3 OR n.author_id = $4::uuid)
    `, [req.params.id, req.user?.user_id || '00000000-0000-0000-0000-000000000000', !!(req.user && req.user.role === 'admin'), req.user?.user_id || '00000000-0000-0000-0000-000000000000']);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ post: postShape(rows[0], req.user?.user_id) });
  } catch (err) { next(err); }
});

user.get('/posts/:id/image', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).end();
    const { rows } = await query(`
      SELECT image_data, image_type, published, author_id FROM news_posts
       WHERE id = $1::bigint AND image_data IS NOT NULL
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).end();
    const post = rows[0];
    const canAccess = post.published || !!(req.user && (req.user.role === 'admin' || String(post.author_id) === String(req.user.user_id)));
    if (!canAccess || !validStoredImage(post)) return res.status(404).end();
    res.set({ 'Content-Type': post.image_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' }).send(post.image_data);
  } catch (err) { next(err); }
});

user.post('/posts', requireTier2, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const title = text(body.title, 120);
    const message = text(body.body, 4000);
    if (!title || !message) return res.status(400).json({ error: 'bad_request' });

    const kind = body.kind === 'official' ? 'official' : 'community';
    if (kind === 'official' && req.user.role !== 'admin') return res.status(403).json({ error: 'admin_only_official_post' });
    if (kind === 'community' && !isTier2(req.user)) return res.status(403).json({ error: 'tier2_required' });
    if (body.published !== undefined && typeof body.published !== 'boolean') return res.status(400).json({ error: 'bad_request' });

    let image = null;
    if (body.image !== undefined && body.image !== null) {
      image = parseImage(body.image);
      if (!image) return res.status(400).json({ error: 'bad_image' });
    }

    const { rows } = await query(`
      INSERT INTO news_posts (title, body, image_data, image_type, published, author_id, post_kind)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [title, message, image?.buffer || null, image?.type || null, body.published !== false, req.user.user_id, kind]);
    res.status(201).json({ ok: true, id: String(rows[0].id), kind });
  } catch (err) { next(err); }
});

user.put('/posts/:id', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const { rows: existingRows } = await query('SELECT id, author_id, post_kind FROM news_posts WHERE id = $1::bigint', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const own = String(existing.author_id) === String(req.user.user_id);
    if (existing.post_kind === 'official' && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    if (existing.post_kind === 'community' && req.user.role !== 'admin' && (!own || !isTier2(req.user))) return res.status(403).json({ error: 'forbidden' });

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const updates = [];
    const values = [];
    const add = (column, value) => { values.push(value); updates.push(`${column} = $${values.length}`); };
    if (Object.hasOwn(body, 'title')) { const title = text(body.title, 120); if (!title) return res.status(400).json({ error: 'bad_request' }); add('title', title); }
    if (Object.hasOwn(body, 'body')) { const message = text(body.body, 4000); if (!message) return res.status(400).json({ error: 'bad_request' }); add('body', message); }
    if (Object.hasOwn(body, 'published')) { if (typeof body.published !== 'boolean') return res.status(400).json({ error: 'bad_request' }); add('published', body.published); }
    if (Object.hasOwn(body, 'image')) {
      if (body.image === null) { add('image_data', null); add('image_type', null); }
      else { const image = parseImage(body.image); if (!image) return res.status(400).json({ error: 'bad_image' }); add('image_data', image.buffer); add('image_type', image.type); }
    }
    if (!updates.length) return res.status(400).json({ error: 'bad_request' });
    values.push(req.params.id);
    const { rows } = await query(`UPDATE news_posts SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length}::bigint RETURNING id`, values);
    res.json({ ok: true, id: String(rows[0].id) });
  } catch (err) { next(err); }
});

user.delete('/posts/:id', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const { rows } = await query('SELECT id, author_id, post_kind FROM news_posts WHERE id = $1::bigint', [req.params.id]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'not_found' });
    const own = String(post.author_id) === String(req.user.user_id);
    if (post.post_kind === 'official' && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    if (post.post_kind === 'community' && req.user.role !== 'admin' && (!own || !isTier2(req.user))) return res.status(403).json({ error: 'forbidden' });
    await withTransaction(async (client) => {
      await client.query('DELETE FROM news_posts WHERE id = $1::bigint', [req.params.id]);
      if (req.user.role === 'admin') {
        await client.query(`INSERT INTO moderation_audit (admin_id, action, target_type, target_id, metadata)
                            VALUES ($1, 'post_deleted', 'post', $2, '{}'::jsonb)`, [req.user.user_id, req.params.id]);
      }
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

user.get('/posts/:id/comments', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'not_found' });

    const { rows: postRows } = await query(
      'SELECT id, published, author_id FROM news_posts WHERE id = $1::bigint',
      [req.params.id]
    );
    const post = postRows[0];
    if (!post) return res.status(404).json({ error: 'not_found' });
    const canView = post.published || req.user?.role === 'admin' || String(post.author_id) === String(req.user?.user_id);
    if (!canView) return res.status(404).json({ error: 'not_found' });

    const limit = limitFor(req.query.limit, 20);
    const before = req.query.before;
    if (before && !validId(before)) return res.status(400).json({ error: 'invalid_cursor' });
    const cursor = before || String(MAX_BIGINT);
    const { rows } = await query(`
      SELECT c.comment_id, c.post_id, c.parent_id, c.body, c.created_at, c.updated_at,
             c.deleted_at, c.author_id, u.name AS author_name
        FROM post_comments c LEFT JOIN users u ON u.user_id = c.author_id
       WHERE c.post_id = $1::bigint AND c.comment_id < $2::bigint
       ORDER BY c.comment_id DESC LIMIT $3
    `, [req.params.id, cursor, limit + 1]);
    const page = rows.slice(0, limit);
    res.json({
      comments: page.map((row) => ({
        id: String(row.comment_id), postId: String(row.post_id),
        parentId: row.parent_id ? String(row.parent_id) : null,
        body: row.deleted_at ? '[comment removed]' : row.body,
        deleted: !!row.deleted_at, createdAt: row.created_at, updatedAt: row.updated_at,
        author: { id: row.author_id ? String(row.author_id) : null, name: row.deleted_at ? 'Matric500' : (row.author_name || 'User') },
      })),
      nextBefore: rows.length > limit ? String(page[page.length - 1].comment_id) : null,
    });
  } catch (err) { next(err); }
});

user.post('/posts/:id/comments', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const message = text(body.body, 2000);
    if (!message) return res.status(400).json({ error: 'bad_request' });

    const { rows: posts } = await query('SELECT id, published FROM news_posts WHERE id = $1::bigint', [req.params.id]);
    if (!posts[0]?.published) return res.status(404).json({ error: 'not_found' });

    let parentId = null;
    if (body.parentId !== undefined && body.parentId !== null) {
      if (!validId(body.parentId)) return res.status(400).json({ error: 'bad_parent' });
      const { rows: parents } = await query('SELECT comment_id FROM post_comments WHERE comment_id = $1::bigint AND post_id = $2::bigint AND deleted_at IS NULL', [body.parentId, req.params.id]);
      if (!parents[0]) return res.status(404).json({ error: 'parent_not_found' });
      parentId = body.parentId;
    }

    const { rows } = await query(`
      INSERT INTO post_comments (post_id, author_id, parent_id, body)
      VALUES ($1::bigint, $2::uuid, $3::bigint, $4) RETURNING comment_id
    `, [req.params.id, req.user.user_id, parentId, message]);
    res.status(201).json({ ok: true, id: String(rows[0].comment_id) });
  } catch (err) { next(err); }
});

user.put('/posts/:postId/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.postId) || !validId(req.params.commentId)) return res.status(400).json({ error: 'bad_id' });
    const message = text(req.body?.body, 2000);
    if (!message) return res.status(400).json({ error: 'bad_request' });
    const { rows } = await query(`
      UPDATE post_comments SET body = $1, updated_at = now()
       WHERE comment_id = $2::bigint AND post_id = $3::bigint
         AND author_id = $4::uuid AND deleted_at IS NULL
      RETURNING comment_id
    `, [message, req.params.commentId, req.params.postId, req.user.user_id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

user.delete('/posts/:postId/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.postId) || !validId(req.params.commentId)) return res.status(400).json({ error: 'bad_id' });
    await withTransaction(async (client) => {
      const updated = await client.query(`
        UPDATE post_comments SET deleted_at = now(), updated_at = now()
         WHERE comment_id = $1::bigint AND post_id = $2::bigint
           AND (author_id = $3::uuid OR $4)
           AND deleted_at IS NULL
        RETURNING comment_id
      `, [req.params.commentId, req.params.postId, req.user.user_id, req.user.role === 'admin']);
      if (!updated.rows[0]) throw Object.assign(new Error('not_found'), { statusCode: 404 });
      if (req.user.role === 'admin') {
        await client.query(`INSERT INTO moderation_audit (admin_id, action, target_type, target_id, metadata)
                            VALUES ($1, 'comment_removed', 'comment', $2, $3::jsonb)`,
          [req.user.user_id, req.params.commentId, JSON.stringify({ postId: req.params.postId })]);
      }
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

user.put('/posts/:id/reactions/:type', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id) || !REACTION_TYPES.has(req.params.type)) return res.status(400).json({ error: 'bad_request' });
    const { rows: posts } = await query('SELECT id FROM news_posts WHERE id = $1::bigint AND published', [req.params.id]);
    if (!posts[0]) return res.status(404).json({ error: 'not_found' });
    await query(`
      INSERT INTO post_reactions (post_id, user_id, reaction_type)
      VALUES ($1::bigint, $2::uuid, $3)
      ON CONFLICT (post_id, user_id) DO UPDATE SET reaction_type = EXCLUDED.reaction_type, created_at = now()
    `, [req.params.id, req.user.user_id, req.params.type]);
    res.json({ ok: true, reaction: req.params.type });
  } catch (err) { next(err); }
});

user.delete('/posts/:id/reactions', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    await query('DELETE FROM post_reactions WHERE post_id = $1::bigint AND user_id = $2::uuid', [req.params.id, req.user.user_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

user.post('/posts/:id/reports', requireAuth, reportSubmissionLimiter, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const reason = text(req.body?.reason, 1000);
    if (!reason) return res.status(400).json({ error: 'bad_request' });
    const { rows: posts } = await query('SELECT id FROM news_posts WHERE id = $1::bigint AND published', [req.params.id]);
    if (!posts[0]) return res.status(404).json({ error: 'not_found' });
    try {
      await query('INSERT INTO post_reports (reporter_id, post_id, reason) VALUES ($1::uuid, $2::bigint, $3)', [req.user.user_id, req.params.id, reason]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'duplicate_report' });
      throw err;
    }
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

user.post('/posts/:postId/comments/:commentId/reports', requireAuth, reportSubmissionLimiter, async (req, res, next) => {
  try {
    if (!validId(req.params.postId) || !validId(req.params.commentId)) return res.status(400).json({ error: 'bad_id' });
    const reason = text(req.body?.reason, 1000);
    if (!reason) return res.status(400).json({ error: 'bad_request' });
    const { rows } = await query('SELECT comment_id FROM post_comments WHERE comment_id = $1::bigint AND post_id = $2::bigint AND deleted_at IS NULL', [req.params.commentId, req.params.postId]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    try {
      await query('INSERT INTO post_reports (reporter_id, comment_id, reason) VALUES ($1::uuid, $2::bigint, $3)', [req.user.user_id, req.params.commentId, reason]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'duplicate_report' });
      throw err;
    }
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get('/reports', async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status && !['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'bad_status' });
    const limit = limitFor(req.query.limit, 20);
    const before = req.query.before && validId(req.query.before) ? req.query.before : String(MAX_BIGINT);
    const params = [before, limit + 1];
    let statusSql = '';
    if (status) { params.push(status); statusSql = 'AND r.status = $3'; }
    const { rows } = await query(`
      SELECT r.report_id, r.reporter_id, r.post_id, r.comment_id, r.reason, r.status,
             r.reviewed_by, r.reviewed_at, r.created_at, u.name AS reporter_name
        FROM post_reports r LEFT JOIN users u ON u.user_id = r.reporter_id
       WHERE r.report_id < $1::bigint ${statusSql}
       ORDER BY r.report_id DESC LIMIT $2
    `.replace('${statusSql}', statusSql), params);
    const page = rows.slice(0, limit);
    res.json({
      reports: page.map((row) => ({
        id: String(row.report_id), postId: row.post_id ? String(row.post_id) : null,
        commentId: row.comment_id ? String(row.comment_id) : null, reason: row.reason,
        status: row.status, createdAt: row.created_at, reviewedAt: row.reviewed_at,
        reporter: { id: String(row.reporter_id), name: row.reporter_name },
      })),
      nextBefore: rows.length > limit ? String(page[page.length - 1].report_id) : null,
    });
  } catch (err) { next(err); }
});

admin.put('/reports/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const status = req.body?.status;
    if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'bad_status' });
    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT report_id, status, post_id, comment_id FROM post_reports WHERE report_id = $1::bigint FOR UPDATE', [req.params.id]);
      if (!existing.rows[0]) return null;
      const current = existing.rows[0].status;
      const allowed = {
        open: ['reviewing', 'resolved', 'dismissed'],
        reviewing: ['open', 'resolved', 'dismissed'],
        resolved: ['open'],
        dismissed: ['open'],
      };
      if (status !== current && !(allowed[current] || []).includes(status)) throw Object.assign(new Error('invalid_status_transition'), { statusCode: 409 });
      const updated = await client.query(`
        UPDATE post_reports SET status = $1, reviewed_by = $2::uuid,
               reviewed_at = CASE WHEN $1 IN ('resolved','dismissed') THEN now() ELSE NULL END
         WHERE report_id = $3::bigint RETURNING report_id, post_id, comment_id
      `, [status, req.user.user_id, req.params.id]);
      await client.query(`INSERT INTO moderation_audit (admin_id, action, target_type, target_id, metadata)
                          VALUES ($1, 'report_status_changed', 'report', $2, $3::jsonb)`,
        [req.user.user_id, req.params.id, JSON.stringify({ from: current, to: status, postId: updated.rows[0].post_id, commentId: updated.rows[0].comment_id })]);
      return updated.rows[0];
    });
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode === 409) return res.status(409).json({ error: 'invalid_status_transition' });
    next(err);
  }
});

module.exports = { user, admin };
