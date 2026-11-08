'use strict';

const express = require('express');
const { query } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_BIGINT = 9223372036854775807n;
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

const user = express.Router();
user.get('/news', requireAuth, async (req, res, next) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 20) : 10;
    const rawBefore = req.query.before;
    const before = rawBefore && validId(rawBefore) ? rawBefore : String(MAX_BIGINT);
    const { rows } = await query(
      `SELECT n.id, n.title, n.body, (n.image_data IS NOT NULL) AS has_image, n.created_at, u.name AS author_name
         FROM news_posts n LEFT JOIN users u ON u.user_id = n.author_id
        WHERE n.published AND n.id < $1::bigint ORDER BY n.id DESC LIMIT $2`,
      [before, limit + 1]
    );
    const page = rows.slice(0, limit);
    res.json({
      posts: page.map((row) => ({
        id: String(row.id),
        title: row.title,
        body: row.body,
        hasImage: row.has_image,
        createdAt: row.created_at,
        authorName: row.author_name,
      })),
      nextBefore: rows.length > limit ? String(page[page.length - 1].id) : null,
    });
  } catch (err) { next(err); }
});

user.get('/news/:id/image', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).end();
    const { rows } = await query(
      `SELECT image_data, image_type FROM news_posts
       WHERE id = $1::bigint AND image_data IS NOT NULL AND (published OR $2)`,
      [req.params.id, req.user.role === 'admin']
    );
    if (!rows[0]) return res.status(404).end();
    res.set({
      'Content-Type': rows[0].image_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400',
    }).send(rows[0].image_data);
  } catch (err) { next(err); }
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get('/news', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, title, body, published, (image_data IS NOT NULL) AS has_image, created_at
         FROM news_posts ORDER BY id DESC`
    );
    res.json({ posts: rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      body: row.body,
      published: row.published,
      hasImage: row.has_image,
      createdAt: row.created_at,
    })) });
  } catch (err) { next(err); }
});

admin.post('/news', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const title = text(body.title, 120);
    const message = text(body.body, 4000);
    if (!title || !message || (body.published !== undefined && typeof body.published !== 'boolean')) {
      return res.status(400).json({ error: 'bad_request' });
    }
    let image = null;
    if (body.image !== undefined && body.image !== null) {
      image = parseImage(body.image);
      if (!image) return res.status(400).json({ error: 'bad_image' });
    }
    const { rows } = await query(
      `INSERT INTO news_posts (title, body, image_data, image_type, published, author_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [title, message, image && image.buffer, image && image.type, body.published !== false, req.user.user_id]
    );
    res.status(201).json({ ok: true, id: String(rows[0].id) });
  } catch (err) { next(err); }
});

admin.put('/news/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const updates = [];
    const values = [];
    const add = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (Object.hasOwn(body, 'title')) {
      const title = text(body.title, 120);
      if (!title) return res.status(400).json({ error: 'bad_request' });
      add('title', title);
    }
    if (Object.hasOwn(body, 'body')) {
      const message = text(body.body, 4000);
      if (!message) return res.status(400).json({ error: 'bad_request' });
      add('body', message);
    }
    if (Object.hasOwn(body, 'published')) {
      if (typeof body.published !== 'boolean') return res.status(400).json({ error: 'bad_request' });
      add('published', body.published);
    }
    if (Object.hasOwn(body, 'image')) {
      if (body.image === null) {
        add('image_data', null);
        add('image_type', null);
      } else {
        const image = parseImage(body.image);
        if (!image) return res.status(400).json({ error: 'bad_image' });
        add('image_data', image.buffer);
        add('image_type', image.type);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'bad_request' });
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE news_posts SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${values.length}::bigint RETURNING id`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, id: String(rows[0].id) });
  } catch (err) { next(err); }
});

admin.delete('/news/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'bad_id' });
    const { rows } = await query('DELETE FROM news_posts WHERE id = $1::bigint RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { user, admin };
