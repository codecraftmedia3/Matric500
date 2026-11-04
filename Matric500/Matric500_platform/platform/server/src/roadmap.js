'use strict';
const express = require('express');
const { query } = require('./db');
const { requireAuth } = require('./auth');
const data = require('../data/roadmap-data.json');

/* ---------- node index (built once) ---------- */
const INDEX = {};   // nodeId -> { subject, grade, title }
const GROUPS = {};  // "Subject · G9" -> total nodes
for (const [key, s] of Object.entries(data.subjects)) for (const g of s.grades) for (const c of g.chapters) for (const t of c.topics) {
  const label = `${s.name} · G${g.grade}`;
  INDEX[t.topic_id] = { subject: key, grade: g.grade, title: t.topic_title, group: label };
  GROUPS[label] = (GROUPS[label] || 0) + 1;
  for (const sub of t.subtopics || []) {
    INDEX[sub.subtopic_id] = { subject: key, grade: g.grade, title: sub.subtopic_title, group: label };
    GROUPS[label]++;
  }
}
const TOTAL_NODES = Object.keys(INDEX).length;

/* ---------- access ----------
 * Everything is open to everyone (guests, signed-in users and admins). No premium lock. */
const entitlements = (req, res, next) => { req.premium = true; next(); };
const guardGrade = (req, res, next) => {
  const s = data.subjects[req.params.key];
  const g = s && s.grades.find((x) => x.grade === Number(req.params.grade));
  if (!g) return res.status(404).json({ error: 'not_found' });
  req.grade = g;
  next();
};
const visibleRoadmap = () => {
  const subjects = {};
  for (const [key, s] of Object.entries(data.subjects)) {
    subjects[key] = { name: s.name, description: s.description, grades: s.grades.map((g) => ({ ...g, chapter_count: g.chapters.length })) };
  }
  return subjects;
};

const publicUser = (u) => u && ({ userId: u.user_id, name: u.name, email: u.email, role: u.role, premium: true, progress: u.user_progress || {} });

const router = express.Router();

router.get('/roadmap', (req, res) => {
  res.json({ user: publicUser(req.user), googleClientId: process.env.GOOGLE_CLIENT_ID || null, adminLogin: !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD), subjects: visibleRoadmap() });
});

router.get('/subjects/:key/grades/:grade', guardGrade, (req, res) => res.json(req.grade));

router.put('/progress', requireAuth, async (req, res, next) => {
  try {
    const incoming = req.body && req.body.progress;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return res.status(400).json({ error: 'bad_request' });
    const clean = {};
    for (const [id, status] of Object.entries(incoming)) {
      const n = INDEX[id];
      if (!n || !['done', 'challenging'].includes(status)) continue;          // unknown node / status
      clean[id] = status;
    }
    await query('UPDATE users SET user_progress = $2::jsonb, updated_at = now() WHERE user_id = $1', [req.user.user_id, JSON.stringify(clean)]);
    res.json({ ok: true, saved: Object.keys(clean).length });
  } catch (err) { next(err); }
});

module.exports = { router, entitlements, guardGrade, INDEX, GROUPS, TOTAL_NODES };
