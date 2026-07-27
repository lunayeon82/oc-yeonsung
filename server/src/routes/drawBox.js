const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

function getUser(name) {
  return db.prepare('SELECT id FROM oc_users WHERE name = ?').get(name);
}

router.get('/', (req, res) => {
  const user = getUser(req.params.name);
  if (!user) return res.status(404).json({ error: 'unknown_user' });
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : null;
  const sql = 'SELECT * FROM oc_draw_box WHERE user_id = ? ORDER BY created_at DESC' + (limit ? ' LIMIT ?' : '');
  const params = limit ? [user.id, limit] : [user.id];
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((r) => ({
    id: r.id,
    names: JSON.parse(r.names),
    roles: JSON.parse(r.roles),
    au: r.au,
    memo: r.memo,
    createdAt: r.created_at,
  })));
});

router.post('/', requireApiKey, (req, res) => {
  const user = getUser(req.params.name);
  if (!user) return res.status(404).json({ error: 'unknown_user' });
  const { names, roles, au, memo } = req.body || {};
  if (!Array.isArray(names) || !Array.isArray(roles)) return res.status(400).json({ error: 'bad_request' });

  const now = Date.now();
  const info = db.prepare('INSERT INTO oc_draw_box (user_id, names, roles, au, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, JSON.stringify(names), JSON.stringify(roles), au || '', memo || '', now);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', requireApiKey, (req, res) => {
  const user = getUser(req.params.name);
  if (!user) return res.status(404).json({ error: 'unknown_user' });
  const existing = db.prepare('SELECT * FROM oc_draw_box WHERE id = ? AND user_id = ?').get(req.params.id, user.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { names, roles, au, memo } = req.body || {};
  db.prepare('UPDATE oc_draw_box SET names = ?, roles = ?, au = ?, memo = ? WHERE id = ?').run(
    JSON.stringify(names || JSON.parse(existing.names)),
    JSON.stringify(roles || JSON.parse(existing.roles)),
    au != null ? au : existing.au,
    memo != null ? memo : existing.memo,
    req.params.id
  );
  res.status(204).end();
});

router.delete('/:id', requireApiKey, (req, res) => {
  const user = getUser(req.params.name);
  if (!user) return res.status(404).json({ error: 'unknown_user' });
  db.prepare('DELETE FROM oc_draw_box WHERE id = ? AND user_id = ?').run(req.params.id, user.id);
  res.status(204).end();
});

module.exports = router;
