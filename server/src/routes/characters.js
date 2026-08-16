const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');
const r2 = require('../lib/r2');

const router = express.Router();

// 캐릭터 대표 이미지(portrait) — LUNA 프로젝트의 캐릭터 초상화 기능과 동일한 저장 방식/제한을 따름:
// R2 images/portraits/{id}.{ext} 경로, png/jpeg/webp/gif만 허용, 15MB 제한.
const PORTRAIT_EXTS = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif' };
const portraitUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
function uploadPortraitFile(req, res, next) {
  portraitUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
    return res.status(400).json({ error: 'upload_failed' });
  });
}

function loadTree() {
  const owners = db.prepare('SELECT * FROM oc_owners ORDER BY sort_order').all();
  const subgroups = db.prepare('SELECT * FROM oc_subgroups ORDER BY sort_order').all();
  const characters = db.prepare('SELECT * FROM oc_characters ORDER BY sort_order').all();
  const sections = db.prepare('SELECT * FROM oc_character_sections ORDER BY sort_order').all();

  const sectionsByChar = new Map();
  for (const s of sections) {
    if (!sectionsByChar.has(s.character_id)) sectionsByChar.set(s.character_id, []);
    sectionsByChar.get(s.character_id).push({ title: s.title, content: s.content });
  }

  const charsBySubgroup = new Map();
  for (const c of characters) {
    if (!charsBySubgroup.has(c.subgroup_id)) charsBySubgroup.set(c.subgroup_id, []);
    charsBySubgroup.get(c.subgroup_id).push({
      id: c.id,
      publicCode: c.public_code,
      name: c.name,
      gender: c.gender,
      isCouple: c.is_couple,
      note: c.note,
      portraitUrl: r2.toPublicUrl(c.portrait_path, c.portrait_updated_at),
      info: {
        look: c.info_look || '',
        vibe: c.info_vibe || '',
        speech: c.info_speech || '',
        speechEx: c.info_speech_ex || '',
        personality: c.info_personality || '',
        habits: c.info_habits || '',
      },
      customSections: sectionsByChar.get(c.id) || [],
    });
  }

  const subsByOwner = new Map();
  for (const sg of subgroups) {
    if (!subsByOwner.has(sg.owner_id)) subsByOwner.set(sg.owner_id, []);
    subsByOwner.get(sg.owner_id).push({
      label: sg.label,
      code: sg.code,
      characters: charsBySubgroup.get(sg.id) || [],
    });
  }

  return {
    owners: owners.map((o) => ({
      name: o.name,
      code: o.code,
      subgroups: subsByOwner.get(o.id) || [],
    })),
  };
}

const replaceTree = db.transaction((tree) => {
  // PUT /characters replaces the whole owners/subgroups/characters tree (and thus every
  // row's id) on each save, but portrait_path/portrait_updated_at aren't part of that
  // client-side tree — without carrying them over here, any admin edit (reorder, add,
  // rename, ...) would silently blank out every character's portrait on the next save.
  const portraitById = new Map(
    db.prepare('SELECT id, portrait_path, portrait_updated_at FROM oc_characters').all()
      .map((r) => [r.id, { path: r.portrait_path, updatedAt: r.portrait_updated_at }])
  );

  db.exec('DELETE FROM oc_owners');
  const insertOwner = db.prepare('INSERT INTO oc_owners (name, code, sort_order) VALUES (?, ?, ?)');
  const insertSub = db.prepare('INSERT INTO oc_subgroups (owner_id, label, code, sort_order) VALUES (?, ?, ?, ?)');
  const insertChar = db.prepare(`INSERT INTO oc_characters
    (public_code, subgroup_id, name, gender, is_couple, sort_order, note, info_look, info_vibe, info_speech, info_speech_ex, info_personality, info_habits, portrait_path, portrait_updated_at)
    VALUES (@publicCode, @subgroupId, @name, @gender, @isCouple, @sortOrder, @note, @look, @vibe, @speech, @speechEx, @personality, @habits, @portraitPath, @portraitUpdatedAt)`);
  const insertSection = db.prepare('INSERT INTO oc_character_sections (character_id, title, content, sort_order) VALUES (?, ?, ?, ?)');

  (tree.owners || []).forEach((owner, oi) => {
    const ownerId = insertOwner.run(owner.name, owner.code || null, oi).lastInsertRowid;
    (owner.subgroups || []).forEach((sub, si) => {
      const subId = insertSub.run(ownerId, sub.label, sub.code || null, si).lastInsertRowid;
      (sub.characters || []).forEach((ch, ci) => {
        const info = ch.info || {};
        const portrait = ch.id != null ? portraitById.get(ch.id) : undefined;
        const charId = insertChar.run({
          publicCode: ch.publicCode || null,
          subgroupId: subId,
          name: ch.name,
          gender: ch.gender ? 1 : 0,
          isCouple: ch.isCouple ? 1 : 0,
          sortOrder: ci,
          note: ch.note || null,
          look: info.look || null,
          vibe: info.vibe || null,
          speech: info.speech || null,
          speechEx: info.speechEx || null,
          personality: info.personality || null,
          habits: info.habits || null,
          portraitPath: portrait ? portrait.path : null,
          portraitUpdatedAt: portrait ? portrait.updatedAt : null,
        }).lastInsertRowid;
        (ch.customSections || []).forEach((sec, secIdx) => {
          insertSection.run(charId, sec.title || '', sec.content || '', secIdx);
        });
      });
    });
  });
});

router.get('/', (req, res) => {
  res.json(loadTree());
});

router.put('/', requireApiKey, (req, res) => {
  replaceTree(req.body || {});
  res.json(loadTree());
});

router.put('/:id', requireApiKey, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM oc_characters WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const body = req.body || {};
  const info = body.info || {};
  db.prepare(`UPDATE oc_characters SET
    name = @name, gender = @gender, is_couple = @isCouple, note = @note,
    info_look = @look, info_vibe = @vibe, info_speech = @speech, info_speech_ex = @speechEx,
    info_personality = @personality, info_habits = @habits
    WHERE id = @id`).run({
    id,
    name: body.name ?? existing.name,
    gender: body.gender != null ? (body.gender ? 1 : 0) : existing.gender,
    isCouple: body.isCouple != null ? (body.isCouple ? 1 : 0) : existing.is_couple,
    note: body.note ?? existing.note,
    look: info.look ?? existing.info_look,
    vibe: info.vibe ?? existing.info_vibe,
    speech: info.speech ?? existing.info_speech,
    speechEx: info.speechEx ?? existing.info_speech_ex,
    personality: info.personality ?? existing.info_personality,
    habits: info.habits ?? existing.info_habits,
  });

  if (Array.isArray(body.customSections)) {
    const replaceSections = db.transaction(() => {
      db.prepare('DELETE FROM oc_character_sections WHERE character_id = ?').run(id);
      const insertSection = db.prepare('INSERT INTO oc_character_sections (character_id, title, content, sort_order) VALUES (?, ?, ?, ?)');
      body.customSections.forEach((sec, i) => insertSection.run(id, sec.title || '', sec.content || '', i));
    });
    replaceSections();
  }

  res.json(loadTree());
});

router.post('/:id/portrait', requireApiKey, uploadPortraitFile, async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT portrait_path FROM oc_characters WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'bad_request' });
  const ext = PORTRAIT_EXTS[req.file.mimetype];
  if (!ext) return res.status(400).json({ error: 'unsupported_type' });

  const path = `images/portraits/${id}.${ext}`;
  try {
    await r2.uploadObject(path, req.file.buffer, req.file.mimetype);
    if (existing.portrait_path && existing.portrait_path !== path) {
      await r2.deleteObject(existing.portrait_path);
    }
  } catch (err) {
    console.error('portrait upload failed:', err);
    return res.status(502).json({ error: 'upload_failed' });
  }
  const updatedAt = Date.now();
  db.prepare('UPDATE oc_characters SET portrait_path = ?, portrait_updated_at = ? WHERE id = ?').run(path, updatedAt, id);
  res.status(201).json({ portraitUrl: r2.toPublicUrl(path, updatedAt) });
});

router.delete('/:id/portrait', requireApiKey, async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT portrait_path FROM oc_characters WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.portrait_path) await r2.deleteObject(existing.portrait_path);
  db.prepare('UPDATE oc_characters SET portrait_path = NULL, portrait_updated_at = NULL WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
