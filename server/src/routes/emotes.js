const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');
const r2 = require('../lib/r2');
const { normalizeKey } = require('../lib/emoteToken');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function toRow(row) {
  return {
    id: row.id,
    charName: row.char_name,
    emotion: row.emotion,
    variant: row.variant,
    key: row.lookup_key,
    url: r2.toPublicUrl(row.image_path),
    thumbUrl: r2.toPublicUrl(row.thumb_path),
  };
}

router.get('/', (req, res) => {
  const charName = (req.query.charName || '').trim();
  const rows = charName
    ? db.prepare('SELECT * FROM oc_emotes WHERE char_name = ? ORDER BY emotion, variant').all(charName)
    : db.prepare('SELECT * FROM oc_emotes ORDER BY char_name, emotion, variant').all();
  res.json({ items: rows.map(toRow) });
});

router.post(
  '/',
  requireApiKey,
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]),
  async (req, res) => {
    const file = req.files && req.files.file && req.files.file[0];
    const thumb = req.files && req.files.thumb && req.files.thumb[0];
    const charName = String((req.body && req.body.charName) || '').trim();
    const emotion = String((req.body && req.body.emotion) || '').trim();
    const variant = Number((req.body && req.body.variant) || 1);

    if (!file || !SAFE_SEGMENT.test(charName) || !SAFE_SEGMENT.test(emotion) || !Number.isInteger(variant) || variant < 1) {
      return res.status(400).json({ error: 'bad_request' });
    }

    const base = `images/emotes/${charName}/${emotion}.${variant}`;
    const imagePath = `${base}.webp`;
    const thumbPath = thumb ? `${base}.thumb.webp` : null;

    await r2.uploadObject(imagePath, file.buffer, file.mimetype || 'image/webp');
    if (thumb) await r2.uploadObject(thumbPath, thumb.buffer, thumb.mimetype || 'image/webp');

    db.prepare(`
      INSERT INTO oc_emotes (char_name, emotion, variant, lookup_key, image_path, thumb_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (char_name, emotion, variant) DO UPDATE SET
        lookup_key = excluded.lookup_key,
        image_path = excluded.image_path,
        thumb_path = excluded.thumb_path
    `).run(charName, emotion, variant, normalizeKey(`${charName}${emotion}`), imagePath, thumbPath, Date.now());

    const row = db.prepare('SELECT * FROM oc_emotes WHERE char_name = ? AND emotion = ? AND variant = ?')
      .get(charName, emotion, variant);
    res.status(201).json(toRow(row));
  }
);

router.delete('/:id', requireApiKey, async (req, res) => {
  const row = db.prepare('SELECT * FROM oc_emotes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  await r2.deleteObject(row.image_path);
  if (row.thumb_path) await r2.deleteObject(row.thumb_path);
  db.prepare('DELETE FROM oc_emotes WHERE id = ?').run(row.id);
  res.status(204).end();
});

module.exports = router;
