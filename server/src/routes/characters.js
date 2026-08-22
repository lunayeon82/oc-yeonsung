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
  // PUT /characters used to just DELETE the whole owners/subgroups/characters tree and
  // re-INSERT it from scratch on every save. Since oc_characters.id is a plain
  // INTEGER PRIMARY KEY (not AUTOINCREMENT), that reassigned — and silently reused —
  // every character's id on every admin edit (add/reorder/move), even though
  // portrait_path (images/portraits/{id}.ext), the /:id/portrait routes, and
  // character.html's ?id= URL all key directly off that id. A client with a
  // still-open character page (or a stale URL) would then upload/edit onto whatever
  // *other* character had been reassigned its old id. See CLAUDE.md 2026-08-17 entry.
  //
  // So: characters that already exist are UPDATEd in place (id — and thus portrait —
  // never moves), only genuinely new characters get INSERTed, and only characters
  // actually removed from the tree get DELETEd. Owners/subgroups have no client-held
  // references anywhere else, so they're still simply replaced each save; the new
  // subgroups are created *before* the old ones are dropped so every kept character
  // gets repointed to its new subgroup_id before the old subgroup (and the cascade
  // that would otherwise take the character down with it) is deleted.
  const oldOwnerIds = db.prepare('SELECT id FROM oc_owners').all().map((r) => r.id);
  const oldSubgroupIds = db.prepare('SELECT id FROM oc_subgroups').all().map((r) => r.id);
  const existingCharIds = new Set(db.prepare('SELECT id FROM oc_characters').all().map((r) => r.id));

  const insertOwner = db.prepare('INSERT INTO oc_owners (name, code, sort_order) VALUES (?, ?, ?)');
  const insertSub = db.prepare('INSERT INTO oc_subgroups (owner_id, label, code, sort_order) VALUES (?, ?, ?, ?)');
  const insertChar = db.prepare(`INSERT INTO oc_characters
    (public_code, subgroup_id, name, gender, is_couple, sort_order, note, info_look, info_vibe, info_speech, info_speech_ex, info_personality, info_habits)
    VALUES (@publicCode, @subgroupId, @name, @gender, @isCouple, @sortOrder, @note, @look, @vibe, @speech, @speechEx, @personality, @habits)`);
  const updateChar = db.prepare(`UPDATE oc_characters SET
    public_code = @publicCode, subgroup_id = @subgroupId, name = @name, gender = @gender,
    is_couple = @isCouple, sort_order = @sortOrder, note = @note, info_look = @look,
    info_vibe = @vibe, info_speech = @speech, info_speech_ex = @speechEx,
    info_personality = @personality, info_habits = @habits
    WHERE id = @id`);
  const deleteSections = db.prepare('DELETE FROM oc_character_sections WHERE character_id = ?');
  const insertSection = db.prepare('INSERT INTO oc_character_sections (character_id, title, content, sort_order) VALUES (?, ?, ?, ?)');

  const keptCharIds = new Set();

  (tree.owners || []).forEach((owner, oi) => {
    const ownerId = insertOwner.run(owner.name, owner.code || null, oi).lastInsertRowid;
    (owner.subgroups || []).forEach((sub, si) => {
      const subId = insertSub.run(ownerId, sub.label, sub.code || null, si).lastInsertRowid;
      (sub.characters || []).forEach((ch, ci) => {
        const info = ch.info || {};
        const fields = {
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
        };

        let charId;
        if (ch.id != null && existingCharIds.has(ch.id)) {
          updateChar.run({ ...fields, id: ch.id });
          charId = ch.id;
        } else {
          charId = insertChar.run(fields).lastInsertRowid;
        }
        keptCharIds.add(charId);

        deleteSections.run(charId);
        (ch.customSections || []).forEach((sec, secIdx) => {
          insertSection.run(charId, sec.title || '', sec.content || '', secIdx);
        });
      });
    });
  });

  // Characters that existed before but weren't in the new tree were removed via the
  // admin UI — drop them now (their sections cascade-delete with them).
  for (const oldId of existingCharIds) {
    if (!keptCharIds.has(oldId)) {
      db.prepare('DELETE FROM oc_characters WHERE id = ?').run(oldId);
    }
  }

  // Every kept character has already been repointed to a freshly inserted subgroup
  // above, so the old subgroups (and owners) are now safe to drop with no cascade
  // touching anything we meant to keep.
  if (oldSubgroupIds.length) {
    db.prepare(`DELETE FROM oc_subgroups WHERE id IN (${oldSubgroupIds.map(() => '?').join(',')})`).run(...oldSubgroupIds);
  }
  if (oldOwnerIds.length) {
    db.prepare(`DELETE FROM oc_owners WHERE id IN (${oldOwnerIds.map(() => '?').join(',')})`).run(...oldOwnerIds);
  }
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
  await r2.uploadObject(path, req.file.buffer, req.file.mimetype);
  if (existing.portrait_path && existing.portrait_path !== path) {
    await r2.deleteObject(existing.portrait_path);
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
