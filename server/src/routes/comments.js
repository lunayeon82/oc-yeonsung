const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

const parentTable = { story: 'oc_stories', image: 'oc_images' };
const parentPk = { story: 'pid', image: 'pid' };

router.get('/', (req, res) => {
  const { parentType, parentPid } = req.query;
  if (!parentTable[parentType] || !parentPid) return res.status(400).json({ error: 'bad_request' });
  const rows = db.prepare('SELECT * FROM oc_comments WHERE parent_type = ? AND parent_pid = ? ORDER BY created_at DESC')
    .all(parentType, parentPid);
  res.json(rows.map((r) => ({
    id: r.id, parentType: r.parent_type, parentPid: r.parent_pid, chapterPid: r.chapter_pid, body: r.body, createdAt: r.created_at,
  })));
});

router.post('/', requireApiKey, (req, res) => {
  const { parentType, parentPid, chapterPid, body } = req.body || {};
  const table = parentTable[parentType];
  if (!table || !parentPid || !body) return res.status(400).json({ error: 'bad_request' });

  const now = Date.now();
  const result = db.transaction(() => {
    const parent = db.prepare(`SELECT 1 FROM ${table} WHERE ${parentPk[parentType]} = ?`).get(parentPid);
    if (!parent) return null;
    const info = db.prepare('INSERT INTO oc_comments (parent_type, parent_pid, chapter_pid, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(parentType, parentPid, chapterPid || null, body, now);
    db.prepare(`UPDATE ${table} SET comment_count = comment_count + 1 WHERE ${parentPk[parentType]} = ?`).run(parentPid);
    return info.lastInsertRowid;
  })();

  if (result == null) return res.status(404).json({ error: 'parent_not_found' });
  res.status(201).json({ id: result });
});

router.delete('/:id', requireApiKey, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT * FROM oc_comments WHERE id = ?').get(id);
  if (!comment) return res.status(404).json({ error: 'not_found' });

  db.transaction(() => {
    db.prepare('DELETE FROM oc_comments WHERE id = ?').run(id);
    const table = parentTable[comment.parent_type];
    db.prepare(`UPDATE ${table} SET comment_count = MAX(0, comment_count - 1) WHERE ${parentPk[comment.parent_type]} = ?`)
      .run(comment.parent_pid);
  })();

  res.status(204).end();
});

module.exports = router;
