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
  // 교체 업로드는 같은 키를 덮어써서 URL이 안 바뀌므로, updated_at을 버전으로 붙여
  // CDN/브라우저가 옛 이미지를 계속 내주는 것을 막는다(캐릭터 대표 이미지와 같은 방식).
  const version = row.updated_at || row.created_at;
  return {
    id: row.id,
    charName: row.char_name,
    emotion: row.emotion,
    variant: row.variant,
    key: row.lookup_key,
    url: r2.toPublicUrl(row.image_path, version),
    thumbUrl: r2.toPublicUrl(row.thumb_path, version),
    updatedAt: version,
  };
}

function findRow(charName, emotion, variant) {
  return db.prepare('SELECT * FROM oc_emotes WHERE char_name = ? AND emotion = ? AND variant = ?')
    .get(charName, emotion, variant);
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

    const now = Date.now();
    db.prepare(`
      INSERT INTO oc_emotes (char_name, emotion, variant, lookup_key, image_path, thumb_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (char_name, emotion, variant) DO UPDATE SET
        lookup_key = excluded.lookup_key,
        image_path = excluded.image_path,
        thumb_path = excluded.thumb_path,
        updated_at = excluded.updated_at
    `).run(charName, emotion, variant, normalizeKey(`${charName}${emotion}`), imagePath, thumbPath, now, now);

    res.status(201).json(toRow(findRow(charName, emotion, variant)));
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

// 이미 올라간 에셋의 이름(캐릭터/감정/변형)을 고친다. R2 키에 이름이 들어가므로 파일도 옮긴다.
// smiling -> smile처럼 잘못된 이름으로 올라간 것을 지웠다 다시 올리지 않고 고치기 위한 것.
router.patch('/:id', requireApiKey, async (req, res) => {
  const row = db.prepare('SELECT * FROM oc_emotes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const charName = String((req.body && req.body.charName) || row.char_name).trim();
  const emotion = String((req.body && req.body.emotion) || row.emotion).trim();
  const variant = Number((req.body && req.body.variant) || row.variant);

  if (!SAFE_SEGMENT.test(charName) || !SAFE_SEGMENT.test(emotion) || !Number.isInteger(variant) || variant < 1) {
    return res.status(400).json({ error: 'bad_request' });
  }
  if (charName === row.char_name && emotion === row.emotion && variant === row.variant) {
    return res.json(toRow(row));
  }
  if (findRow(charName, emotion, variant)) return res.status(409).json({ error: 'already_exists' });

  const base = `images/emotes/${charName}/${emotion}.${variant}`;
  const imagePath = `${base}.webp`;
  const thumbPath = row.thumb_path ? `${base}.thumb.webp` : null;

  // R2에는 이름 바꾸기가 없어서 받아서 새 키로 올리고 옛 키를 지운다.
  await r2.uploadObject(imagePath, await r2.getObjectBuffer(row.image_path), 'image/webp');
  if (row.thumb_path) {
    await r2.uploadObject(thumbPath, await r2.getObjectBuffer(row.thumb_path), 'image/webp');
  }

  db.prepare(`
    UPDATE oc_emotes
       SET char_name = ?, emotion = ?, variant = ?, lookup_key = ?, image_path = ?, thumb_path = ?, updated_at = ?
     WHERE id = ?
  `).run(charName, emotion, variant, normalizeKey(`${charName}${emotion}`), imagePath, thumbPath, Date.now(), row.id);

  await r2.deleteObject(row.image_path);
  if (row.thumb_path) await r2.deleteObject(row.thumb_path);

  res.json(toRow(db.prepare('SELECT * FROM oc_emotes WHERE id = ?').get(row.id)));
});

module.exports = router;
