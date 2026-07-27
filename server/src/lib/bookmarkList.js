const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');

// Shared factory for `readLater` and `storyBox`, which are structurally identical:
// a per-user list of bookmarks pointing at a story or image, deduped by parent_pid.
function createBookmarkListRouter(table) {
  const router = express.Router({ mergeParams: true });

  function getUser(name) {
    return db.prepare('SELECT id FROM oc_users WHERE name = ?').get(name);
  }

  router.get('/', (req, res) => {
    const user = getUser(req.params.name);
    if (!user) return res.status(404).json({ error: 'unknown_user' });
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : null;
    const sql = `SELECT * FROM ${table} WHERE user_id = ? ORDER BY added_at DESC` + (limit ? ' LIMIT ?' : '');
    const params = limit ? [user.id, limit] : [user.id];
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map((r) => ({
      id: r.id, parentType: r.parent_type, parentPid: r.parent_pid, title: r.title_snapshot, addedAt: r.added_at,
    })));
  });

  router.post('/', requireApiKey, (req, res) => {
    const user = getUser(req.params.name);
    if (!user) return res.status(404).json({ error: 'unknown_user' });
    const { parentType, parentPid, title } = req.body || {};
    if (!parentType || !parentPid) return res.status(400).json({ error: 'bad_request' });

    const dup = db.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND parent_pid = ?`).get(user.id, parentPid);
    if (dup) return res.status(409).json({ error: 'already_saved' });

    const now = Date.now();
    const info = db.prepare(`INSERT INTO ${table} (user_id, parent_type, parent_pid, title_snapshot, added_at) VALUES (?, ?, ?, ?, ?)`)
      .run(user.id, parentType, parentPid, title || '', now);
    res.status(201).json({ id: info.lastInsertRowid });
  });

  router.delete('/:id', requireApiKey, (req, res) => {
    const user = getUser(req.params.name);
    if (!user) return res.status(404).json({ error: 'unknown_user' });
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(req.params.id, user.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { createBookmarkListRouter };
