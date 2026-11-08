'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./auth');

const router = express.Router();
const limiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user && req.user.user_id ? req.user.user_id : req.ip),
  message: { error: 'rate_limited' },
});

router.post('/ai/chat', requireAuth, limiter, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ai_unavailable' });
  const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages.slice(-10) : [];
  const messages = raw.map((m) => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m && typeof m.content === 'string' ? m.content.slice(0, 1000).replace(/[\u0000-\u001f]+/g, ' ').trim() : '',
  })).filter((m) => m.content);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'bad_request' });
  const ctx = req.body && req.body.context ? req.body.context : {};
  const system = `You are the Matric500 study assistant for Ethiopian secondary-school students. Keep replies under 180 words unless asked for more. Use short examples and clear steps. Reply in the language the student writes in. Stay on school subjects and be helpful but do not do graded work for the student.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-haiku-5-5',
        max_tokens: 600,
        system,
        messages,
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'ai_failed' });
    const j = await r.json();
    const reply = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    res.json({ reply: reply || 'Sorry, I could not answer that.' });
  } catch (err) {
    console.error('[ai]', err && err.name ? err.name : err);
    res.status(502).json({ error: 'ai_failed' });
  }
});

module.exports = router;
