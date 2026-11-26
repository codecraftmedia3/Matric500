'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query } = require('./db');
const { requireAuth, isTier2 } = require('./auth');

const FILES = ['roadmap-data.json', 'roadmap-social.json'];
const STREAMS = ['natural', 'social', 'both'];
const subjects = {};
const seen = new Set();

const claim = (id, where) => {
  if (!id || seen.has(id)) throw new Error(`[roadmap] duplicate or missing id "${id}" in ${where}`);
  seen.add(id);
};

for (const fileName of FILES) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`[roadmap] ${fileName} not found, skipped`);
    continue;
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const [key, subject] of Object.entries(json.subjects || {})) {
    if (subjects[key]) throw new Error(`[roadmap] duplicate subject key "${key}" in ${fileName}`);
    if (!subject || typeof subject !== 'object') throw new Error(`[roadmap] invalid subject "${key}" in ${fileName}`);
    if (!STREAMS.includes(subject.stream)) subject.stream = 'natural';
    for (const g of subject.grades || []) {
      for (const c of g.chapters || []) {
        claim(c.chapter_id, fileName);
        for (const t of c.topics || []) {
          claim(t.topic_id, fileName);
          for (const sub of t.subtopics || []) claim(sub.subtopic_id, fileName);
        }
      }
    }
    subjects[key] = subject;
  }
}

const data = { subjects };

const INDEX = {};
const GROUPS = {};
for (const [key, s] of Object.entries(data.subjects)) {
  for (const g of s.grades || []) {
    for (const c of g.chapters || []) {
      for (const t of c.topics || []) {
        const group = `${s.name} · G${g.grade}`;
        INDEX[t.topic_id] = { subject: key, grade: g.grade, title: t.topic_title, group, key };
        GROUPS[group] = (GROUPS[group] || 0) + 1;
        for (const sub of t.subtopics || []) {
          INDEX[sub.subtopic_id] = { subject: key, grade: g.grade, title: sub.subtopic_title, group, key };
          GROUPS[group]++;
        }
      }
    }
  }
}
const TOTAL_NODES = Object.keys(INDEX).length;

const myStream = (u) => (u && u.stream) || null;
const visibleSubjects = (u) => u && u.role === 'admin'
  ? data.subjects
  : Object.fromEntries(Object.entries(data.subjects).filter(([, s]) => s.stream === 'both' || s.stream === myStream(u)));
const visibleKeys = (u) => new Set(Object.keys(visibleSubjects(u)));
const visibleIds = (u) => Object.keys(INDEX).filter((id) => visibleKeys(u).has(INDEX[id].key));

const entitlements = (req, res, next) => { req.premium = isTier2(req.user); next(); };

const guardGrade = (req, res, next) => {
  const s = data.subjects[req.params.key];
  const g = s && s.grades.find((x) => x.grade === Number(req.params.grade));
  if (!g) return res.status(404).json({ error: 'not_found' });
  req.grade = g;
  next();
};

const visibleRoadmap = (u) => {
  const subjectsMap = {};
  for (const [key, s] of Object.entries(visibleSubjects(u))) {
    subjectsMap[key] = {
      ...s,
      grades: (s.grades || []).map((g) => ({ ...g, chapter_count: (g.chapters || []).length })),
      stream: s.stream || 'natural',
    };
  }
  return subjectsMap;
};

const publicUser = (u) =>
  u && {
    userId: u.user_id,
    name: u.name,
    email: u.email,
    role: u.role,
    premium: isTier2(u),
    progress: u.user_progress || {},
    profile: { name: u.name, grade: u.grade, school: u.school, stream: u.stream, username: u.username },
    profileComplete: !!(u.name && u.grade && u.school && u.stream && u.username),
  };

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({ user: publicUser(req.user), googleClientId: process.env.GOOGLE_CLIENT_ID || null, adminLogin: !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) });
});

router.get('/roadmap', requireAuth, (req, res) => {
  if (req.user.role !== 'admin' && !publicUser(req.user).profileComplete) {
    return res.status(403).json({ error: 'profile_incomplete' });
  }
  res.json({ user: publicUser(req.user), subjects: visibleRoadmap(req.user) });
});

router.get('/profiles/:username', async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return res.status(404).json({ error: 'not_found' });
    const { rows } = await query(
      `SELECT name, username, grade, school, stream
         FROM users
        WHERE lower(username) = lower($1) AND account_status = 'active'`,
      [username]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ profile: rows[0] });
  } catch (err) { next(err); }
});

router.get('/username-availability', requireAuth, async (req, res, next) => {
  try {
    const raw = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(raw)) return res.json({ status: raw ? 'invalid' : 'invalid', available: false });
    const { rows } = await query(
      'SELECT user_id FROM users WHERE lower(username) = lower($1) AND user_id <> $2',
      [raw, req.user.user_id]
    );
    res.json({ status: rows[0] ? 'taken' : 'available', available: !rows[0] });
  } catch (err) { next(err); }
});

router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, grade, school, stream, username } = req.body || {};
    const n = typeof name === 'string' ? name.trim() : '';
    const g = grade === null || grade === '' ? null : Number(grade);
    const s = typeof school === 'string' ? school.trim() : '';
    const usernameValue = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (n.length < 1 || n.length > 80) return res.status(400).json({ error: 'bad_request' });
    if (!/^[A-Za-z0-9_]{3,20}$/.test(usernameValue)) return res.status(400).json({ error: 'invalid_username' });
    if (g !== null && !(Number.isInteger(g) && g >= 9 && g <= 12)) return res.status(400).json({ error: 'bad_request' });
    if (s.length > 120) return res.status(400).json({ error: 'bad_request' });
    if (stream !== null && stream !== undefined && !['natural', 'social'].includes(stream)) return res.status(400).json({ error: 'bad_request' });
    const { rows } = await query(
      `UPDATE users SET name=$2, grade=$3, school=$4, stream=$5, username=$6,
                        username_updated_at=now(), updated_at=now()
       WHERE user_id=$1
       RETURNING name, grade, school, stream, username`,
      [req.user.user_id, n, g, s || null, stream || null, usernameValue]
    );
    if (!rows[0]) return res.status(401).json({ error: 'auth_required' });
    res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username_taken' });
    next(err);
  }
});

router.get('/subjects/:key/grades/:grade', requireAuth, guardGrade, (req, res) => res.json(req.grade));

router.put('/progress', requireAuth, async (req, res, next) => {
  try {
    const incoming = req.body && req.body.progress;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return res.status(400).json({ error: 'bad_request' });
    const clean = {};
    for (const [id, status] of Object.entries(incoming)) {
      const n = INDEX[id];
      if (!n || !['done', 'challenging'].includes(status)) continue;
      clean[id] = status;
    }
    await query('UPDATE users SET user_progress = $2::jsonb, updated_at = now() WHERE user_id = $1', [req.user.user_id, JSON.stringify(clean)]);
    res.json({ ok: true, saved: Object.keys(clean).length });
  } catch (err) { next(err); }
});

module.exports = { router, entitlements, guardGrade, INDEX, GROUPS, TOTAL_NODES, visibleSubjects, visibleIds, visibleRoadmap, myStream, publicUser };
