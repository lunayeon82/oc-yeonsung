const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { generatePid } = require('../lib/pid');
const { encodeCursor, decodeCursor, placeholders, splitParam } = require('../lib/pagination');
const r2 = require('../lib/r2');
const { regenerateImageThumbnail } = require('../lib/thumbnail');

const router = express.Router();

function attachRelations(images) {
  if (images.length === 0) return images;
  const pids = images.map((i) => i.pid);
  const ph = placeholders(pids);
  const chars = db.prepare(`SELECT * FROM oc_image_characters WHERE image_pid IN (${ph})`).all(...pids);
  const tags = db.prepare(`SELECT * FROM oc_image_tags WHERE image_pid IN (${ph})`).all(...pids);

  const byPid = new Map(images.map((i) => [i.pid, i]));
  for (const i of images) {
    i.characters = [];
    i.tags = [];
  }
  for (const c of chars) byPid.get(c.image_pid).characters.push(c.character_name);
  for (const t of tags) byPid.get(t.image_pid).tags.push(t.tag);
  return images;
}

function toJson(row) {
  return {
    pid: row.pid,
    title: row.title,
    description: row.description,
    characters: row.characters,
    tags: row.tags,
    thumbChapterPid: row.thumb_chapter_pid,
    thumbPath: row.thumb_path,
    thumbUrl: r2.toPublicUrl(row.thumb_path, row.updated_at),
    chapterCount: row.chapter_count,
    commentCount: row.comment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 5, 100);
  const cursor = decodeCursor(req.query.cursor);
  const characters = splitParam(req.query.characters);
  const charMode = req.query.charMode === 'and' ? 'and' : 'or';
  const tags = splitParam(req.query.tags);

  const where = [];
  const params = [];

  if (characters.length) {
    if (charMode === 'and') {
      where.push(`i.pid IN (
        SELECT image_pid FROM oc_image_characters WHERE character_name IN (${placeholders(characters)})
        GROUP BY image_pid HAVING COUNT(DISTINCT character_name) = ${characters.length}
      )`);
    } else {
      where.push(`i.pid IN (SELECT image_pid FROM oc_image_characters WHERE character_name IN (${placeholders(characters)}))`);
    }
    params.push(...characters);
  }
  if (tags.length) {
    where.push(`i.pid IN (SELECT image_pid FROM oc_image_tags WHERE tag IN (${placeholders(tags)}))`);
    params.push(...tags);
  }
  if (cursor) {
    where.push('(i.updated_at < ? OR (i.updated_at = ? AND i.pid < ?))');
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.pid);
  }

  const sql = `SELECT * FROM oc_images i ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY i.updated_at DESC, i.pid DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit + 1);

  const hasMore = rows.length > limit;
  const page = attachRelations(rows.slice(0, limit).map((r) => ({ ...r })));
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].pid) : null;

  res.json({ items: page.map(toJson), nextCursor });
});

router.get('/tags', (req, res) => {
  const rows = db.prepare(`SELECT tag, COUNT(*) AS uses FROM oc_image_tags GROUP BY tag ORDER BY uses DESC, tag ASC`).all();
  res.json(rows.map((r) => r.tag));
});

router.get('/:pid', (req, res) => {
  const row = db.prepare('SELECT * FROM oc_images WHERE pid = ?').get(req.params.pid);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const [withRelations] = attachRelations([{ ...row }]);
  const chapters = db.prepare('SELECT * FROM oc_image_chapters WHERE image_pid = ? ORDER BY sort_order').all(req.params.pid);
  res.json({
    ...toJson(withRelations),
    chapters: chapters.map((c) => ({ pid: c.pid, imagePath: c.image_path, imageUrl: r2.toPublicUrl(c.image_path, withRelations.updated_at) })),
  });
});

const saveImageTx = db.transaction((pid, body, isNew) => {
  const now = Date.now();
  const chapters = Array.isArray(body.chapters) ? body.chapters : [];

  const oldChapters = isNew ? [] : db.prepare('SELECT pid, image_path FROM oc_image_chapters WHERE image_pid = ?').all(pid);

  if (isNew) {
    db.prepare(`INSERT INTO oc_images (pid, title, description, thumb_chapter_pid, chapter_count, comment_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(pid, body.title || '', body.description || '', body.thumbChapterPid || null, chapters.length, now, now);
  } else {
    db.prepare(`UPDATE oc_images SET title = ?, description = ?, thumb_chapter_pid = ?, chapter_count = ?, updated_at = ? WHERE pid = ?`)
      .run(body.title || '', body.description || '', body.thumbChapterPid || null, chapters.length, now, pid);
  }

  db.prepare('DELETE FROM oc_image_characters WHERE image_pid = ?').run(pid);
  db.prepare('DELETE FROM oc_image_tags WHERE image_pid = ?').run(pid);
  db.prepare('DELETE FROM oc_image_chapters WHERE image_pid = ?').run(pid);

  const insChar = db.prepare('INSERT OR IGNORE INTO oc_image_characters (image_pid, character_name) VALUES (?, ?)');
  (body.characters || []).forEach((name) => insChar.run(pid, name));
  const insTag = db.prepare('INSERT OR IGNORE INTO oc_image_tags (image_pid, tag) VALUES (?, ?)');
  (body.tags || []).forEach((t) => insTag.run(pid, t));

  const insChapter = db.prepare('INSERT INTO oc_image_chapters (pid, image_pid, sort_order, image_path) VALUES (?, ?, ?, ?)');
  chapters.forEach((c, i) => insChapter.run(c.pid || generatePid(), pid, i, c.imagePath));

  const newPaths = new Set(chapters.map((c) => c.imagePath));
  const orphanedPaths = oldChapters.filter((c) => !newPaths.has(c.image_path)).map((c) => c.image_path);

  return { pid, orphanedPaths };
});

router.post('/', requireApiKey, async (req, res) => {
  // image-list.html generates the pid client-side and uses it to build the R2 upload
  // paths *before* this request is ever made, so creation must accept that pid.
  const requestedPid = (req.body && req.body.pid) || null;
  if (requestedPid && db.prepare('SELECT 1 FROM oc_images WHERE pid = ?').get(requestedPid)) {
    return res.status(409).json({ error: 'pid_taken' });
  }
  const pid = requestedPid || generatePid();
  const { orphanedPaths } = saveImageTx(pid, req.body || {}, true);
  await Promise.all(orphanedPaths.map((p) => r2.deleteObject(p)));
  await regenerateImageThumbnail(pid);
  res.status(201).json({ pid });
});

router.put('/:pid', requireApiKey, async (req, res) => {
  const existing = db.prepare('SELECT 1 FROM oc_images WHERE pid = ?').get(req.params.pid);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { orphanedPaths } = saveImageTx(req.params.pid, req.body || {}, false);
  await Promise.all(orphanedPaths.map((p) => r2.deleteObject(p)));
  await regenerateImageThumbnail(req.params.pid);
  res.json({ pid: req.params.pid });
});

router.delete('/:pid', requireApiKey, async (req, res) => {
  const pid = req.params.pid;
  const chapters = db.prepare('SELECT image_path FROM oc_image_chapters WHERE image_pid = ?').all(pid);
  const image = db.prepare('SELECT thumb_path FROM oc_images WHERE pid = ?').get(pid);

  db.transaction(() => {
    db.prepare("DELETE FROM oc_comments WHERE parent_type = 'image' AND parent_pid = ?").run(pid);
    db.prepare('DELETE FROM oc_images WHERE pid = ?').run(pid); // cascades chapters/characters/tags
  })();

  const paths = chapters.map((c) => c.image_path).concat(image && image.thumb_path ? [image.thumb_path] : []);
  await Promise.all(paths.map((p) => r2.deleteObject(p)));
  res.status(204).end();
});

module.exports = router;
