const express = require('express');
const db = require('../db');
const r2 = require('../lib/r2');
const { encodeCursor, decodeCursor } = require('../lib/pagination');

const router = express.Router();

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const cursor = decodeCursor(req.query.cursor);

  const where = [];
  const params = [];
  if (cursor) {
    where.push('(updated_at < ? OR (updated_at = ? AND pid < ?))');
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.pid);
  }

  const sql = `SELECT * FROM (
      SELECT pid, 'story' AS type, title, excerpt, NULL AS thumb_path, comment_count, updated_at FROM oc_stories
      UNION ALL
      SELECT pid, 'image' AS type, title, NULL AS excerpt, thumb_path, comment_count, updated_at FROM oc_images
    ) feed
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY updated_at DESC, pid DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].pid) : null;

  res.json({
    items: page.map((r) => ({
      type: r.type,
      pid: r.pid,
      title: r.title,
      excerpt: r.excerpt,
      thumbUrl: r2.toPublicUrl(r.thumb_path),
      commentCount: r.comment_count,
      updatedAt: r.updated_at,
    })),
    nextCursor,
  });
});

module.exports = router;
