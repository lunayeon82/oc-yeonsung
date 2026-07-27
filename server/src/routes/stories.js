const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { generatePid } = require('../lib/pid');
const { encodeCursor, decodeCursor, placeholders, splitParam } = require('../lib/pagination');

const router = express.Router();

function attachRelations(stories) {
  if (stories.length === 0) return stories;
  const pids = stories.map((s) => s.pid);
  const ph = placeholders(pids);
  const chars = db.prepare(`SELECT * FROM oc_story_characters WHERE story_pid IN (${ph})`).all(...pids);
  const roles = db.prepare(`SELECT * FROM oc_story_roles WHERE story_pid IN (${ph})`).all(...pids);
  const aus = db.prepare(`SELECT * FROM oc_story_aus WHERE story_pid IN (${ph})`).all(...pids);
  const loreRefs = db.prepare(`SELECT * FROM oc_story_lore_refs WHERE story_pid IN (${ph}) ORDER BY sort_order`).all(...pids);

  const byPid = new Map(stories.map((s) => [s.pid, s]));
  for (const s of stories) {
    s.characters = [];
    s.roles = [];
    s.aus = [];
    s.loreRefs = [];
  }
  for (const c of chars) byPid.get(c.story_pid).characters.push(c.character_name);
  for (const r of roles) byPid.get(r.story_pid).roles.push(r.role);
  for (const a of aus) byPid.get(a.story_pid).aus.push(a.au);
  for (const l of loreRefs) byPid.get(l.story_pid).loreRefs.push({ id: l.lore_pid, title: l.lore_title_snapshot });
  return stories;
}

function toJson(row) {
  return {
    pid: row.pid,
    title: row.title,
    rating: row.rating,
    excerpt: row.excerpt,
    characters: row.characters,
    roles: row.roles,
    aus: row.aus,
    loreRefs: row.loreRefs,
    chapterCount: row.chapter_count,
    commentCount: row.comment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EXCERPT_LENGTH = 150;

function extractExcerpt(chapters) {
  const firstBody = (chapters[0] && chapters[0].body) || '';
  const text = firstBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= EXCERPT_LENGTH) return text;
  return `${text.slice(0, EXCERPT_LENGTH)}…`;
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 5, 100);
  const cursor = decodeCursor(req.query.cursor);
  const q = (req.query.q || '').trim();
  const characters = splitParam(req.query.characters);
  const charMode = req.query.charMode === 'and' ? 'and' : 'or';
  const roles = splitParam(req.query.roles);
  const aus = splitParam(req.query.aus);
  const ratings = splitParam(req.query.rating);

  const where = [];
  const params = [];

  if (q) {
    where.push('s.title LIKE ?');
    params.push(`%${q}%`);
  }
  if (ratings.length) {
    where.push(`s.rating IN (${placeholders(ratings)})`);
    params.push(...ratings);
  }
  if (characters.length) {
    if (charMode === 'and') {
      where.push(`s.pid IN (
        SELECT story_pid FROM oc_story_characters WHERE character_name IN (${placeholders(characters)})
        GROUP BY story_pid HAVING COUNT(DISTINCT character_name) = ${characters.length}
      )`);
    } else {
      where.push(`s.pid IN (SELECT story_pid FROM oc_story_characters WHERE character_name IN (${placeholders(characters)}))`);
    }
    params.push(...characters);
  }
  if (roles.length || aus.length) {
    const parts = [];
    if (roles.length) {
      parts.push(`s.pid IN (SELECT story_pid FROM oc_story_roles WHERE role IN (${placeholders(roles)}))`);
      params.push(...roles);
    }
    if (aus.length) {
      parts.push(`s.pid IN (SELECT story_pid FROM oc_story_aus WHERE au IN (${placeholders(aus)}))`);
      params.push(...aus);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (cursor) {
    where.push('(s.updated_at < ? OR (s.updated_at = ? AND s.pid < ?))');
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.pid);
  }

  const sql = `SELECT * FROM oc_stories s ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.updated_at DESC, s.pid DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit + 1);

  const hasMore = rows.length > limit;
  const page = attachRelations(rows.slice(0, limit).map((r) => ({ ...r })));
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].pid) : null;

  res.json({ items: page.map(toJson), nextCursor });
});

router.get('/:pid', (req, res) => {
  const row = db.prepare('SELECT * FROM oc_stories WHERE pid = ?').get(req.params.pid);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const [withRelations] = attachRelations([{ ...row }]);
  const chapters = db.prepare('SELECT * FROM oc_chapters WHERE story_pid = ? ORDER BY sort_order').all(req.params.pid);
  res.json({
    ...toJson(withRelations),
    chapters: chapters.map((c) => ({ pid: c.pid, title: c.title, body: c.body, createdAt: c.created_at })),
  });
});

const saveStoryTx = db.transaction((pid, body, isNew) => {
  const now = Date.now();
  const chapters = Array.isArray(body.chapters) ? body.chapters : [];
  const excerpt = extractExcerpt(chapters);

  if (isNew) {
    db.prepare(`INSERT INTO oc_stories (pid, title, rating, excerpt, chapter_count, comment_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(pid, body.title || '', body.rating || '', excerpt, chapters.length, now, now);
  } else {
    db.prepare(`UPDATE oc_stories SET title = ?, rating = ?, excerpt = ?, chapter_count = ?, updated_at = ? WHERE pid = ?`)
      .run(body.title || '', body.rating || '', excerpt, chapters.length, now, pid);
  }

  db.prepare('DELETE FROM oc_story_characters WHERE story_pid = ?').run(pid);
  db.prepare('DELETE FROM oc_story_roles WHERE story_pid = ?').run(pid);
  db.prepare('DELETE FROM oc_story_aus WHERE story_pid = ?').run(pid);
  db.prepare('DELETE FROM oc_story_lore_refs WHERE story_pid = ?').run(pid);
  db.prepare('DELETE FROM oc_chapters WHERE story_pid = ?').run(pid);

  const insChar = db.prepare('INSERT OR IGNORE INTO oc_story_characters (story_pid, character_name) VALUES (?, ?)');
  (body.characters || []).forEach((name) => insChar.run(pid, name));
  const insRole = db.prepare('INSERT OR IGNORE INTO oc_story_roles (story_pid, role) VALUES (?, ?)');
  (body.roles || []).forEach((r) => insRole.run(pid, r));
  const insAu = db.prepare('INSERT OR IGNORE INTO oc_story_aus (story_pid, au) VALUES (?, ?)');
  (body.aus || []).forEach((a) => insAu.run(pid, a));
  const insLore = db.prepare('INSERT INTO oc_story_lore_refs (story_pid, lore_pid, lore_title_snapshot, sort_order) VALUES (?, ?, ?, ?)');
  (body.loreRefs || []).forEach((l, i) => insLore.run(pid, l.id, l.title || '', i));

  const insChapter = db.prepare('INSERT INTO oc_chapters (pid, story_pid, sort_order, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  chapters.forEach((c, i) => insChapter.run(c.pid || generatePid(), pid, i, c.title || '', c.body || '', now));

  return pid;
});

router.post('/', requireApiKey, (req, res) => {
  // story-list.html generates the pid client-side (before any server round-trip) and
  // passes it via URL to story-write.html, so creation must accept that pid rather than
  // minting its own — falls back to generating one if the caller omits it.
  const requestedPid = (req.body && req.body.pid) || null;
  if (requestedPid && db.prepare('SELECT 1 FROM oc_stories WHERE pid = ?').get(requestedPid)) {
    return res.status(409).json({ error: 'pid_taken' });
  }
  const pid = requestedPid || generatePid();
  saveStoryTx(pid, req.body || {}, true);
  res.status(201).json({ pid });
});

router.put('/:pid', requireApiKey, (req, res) => {
  const existing = db.prepare('SELECT 1 FROM oc_stories WHERE pid = ?').get(req.params.pid);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  saveStoryTx(req.params.pid, req.body || {}, false);
  res.json({ pid: req.params.pid });
});

const deleteStoryTx = db.transaction((pid) => {
  db.prepare("DELETE FROM oc_comments WHERE parent_type = 'story' AND parent_pid = ?").run(pid);
  db.prepare('DELETE FROM oc_stories WHERE pid = ?').run(pid); // cascades chapters/characters/roles/aus/loreRefs
});

router.delete('/:pid', requireApiKey, (req, res) => {
  deleteStoryTx(req.params.pid);
  res.status(204).end();
});

module.exports = router;
