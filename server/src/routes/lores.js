const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { generatePid } = require('../lib/pid');
const { encodeCursor, decodeCursor } = require('../lib/pagination');

const router = express.Router();

function toJson(row) {
  return {
    pid: row.pid,
    title: row.title,
    chapterCount: row.chapter_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const cursor = decodeCursor(req.query.cursor);
  const q = (req.query.q || '').trim();

  const where = [];
  const params = [];
  if (q) {
    where.push('title LIKE ?');
    params.push(`%${q}%`);
  }
  if (cursor) {
    where.push('(created_at < ? OR (created_at = ? AND pid < ?))');
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.pid);
  }

  const sql = `SELECT * FROM oc_lores ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC, pid DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].pid) : null;

  res.json({ items: page.map(toJson), nextCursor });
});

router.get('/:pid', (req, res) => {
  const row = db.prepare('SELECT * FROM oc_lores WHERE pid = ?').get(req.params.pid);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const chapters = db.prepare('SELECT * FROM oc_lore_chapters WHERE lore_pid = ? ORDER BY sort_order').all(req.params.pid);
  res.json({
    ...toJson(row),
    chapters: chapters.map((c) => ({ pid: c.pid, title: c.title, body: c.body, createdAt: c.created_at })),
  });
});

const saveLoreTx = db.transaction((pid, body, isNew) => {
  const now = Date.now();
  const chapters = Array.isArray(body.chapters) ? body.chapters : [];

  if (isNew) {
    db.prepare('INSERT INTO oc_lores (pid, title, chapter_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(pid, body.title || '', chapters.length, now, now);
  } else {
    db.prepare('UPDATE oc_lores SET title = ?, chapter_count = ?, updated_at = ? WHERE pid = ?')
      .run(body.title || '', chapters.length, now, pid);
  }

  db.prepare('DELETE FROM oc_lore_chapters WHERE lore_pid = ?').run(pid);
  const insChapter = db.prepare('INSERT INTO oc_lore_chapters (pid, lore_pid, sort_order, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  chapters.forEach((c, i) => insChapter.run(c.pid || generatePid(), pid, i, c.title || '', c.body || '', now));

  return pid;
});

router.post('/', requireApiKey, (req, res) => {
  const requestedPid = (req.body && req.body.pid) || null;
  if (requestedPid && db.prepare('SELECT 1 FROM oc_lores WHERE pid = ?').get(requestedPid)) {
    return res.status(409).json({ error: 'pid_taken' });
  }
  const pid = requestedPid || generatePid();
  saveLoreTx(pid, req.body || {}, true);
  res.status(201).json({ pid });
});

router.put('/:pid', requireApiKey, (req, res) => {
  const existing = db.prepare('SELECT 1 FROM oc_lores WHERE pid = ?').get(req.params.pid);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  saveLoreTx(req.params.pid, req.body || {}, false);
  res.json({ pid: req.params.pid });
});

router.delete('/:pid', requireApiKey, (req, res) => {
  db.prepare('DELETE FROM oc_lores WHERE pid = ?').run(req.params.pid); // cascades lore_chapters
  res.status(204).end();
});

module.exports = router;
