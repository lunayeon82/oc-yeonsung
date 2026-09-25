const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

// 조합은 "이름 붙인 캐릭터 목록"일 뿐이라 글(oc_stories)에는 아무것도 저장하지 않는다.
// 멤버는 캐릭터 id가 아니라 이름으로 들고 있다 — 글의 캐릭터 태그(oc_story_characters)도
// 이름 기준이라, 목록 필터에 그대로 넘기려면 이름이어야 맞는다.

function membersOf(comboId) {
  return db
    .prepare('SELECT character_name FROM oc_combo_members WHERE combo_id = ? ORDER BY sort_order, character_name')
    .all(comboId)
    .map((r) => r.character_name);
}

function toJson(row) {
  return { id: row.id, name: row.name, members: membersOf(row.id) };
}

function cleanMembers(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  input.forEach((raw) => {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  });
  return out;
}

const setMembers = db.transaction((comboId, members) => {
  db.prepare('DELETE FROM oc_combo_members WHERE combo_id = ?').run(comboId);
  const ins = db.prepare('INSERT INTO oc_combo_members (combo_id, character_name, sort_order) VALUES (?, ?, ?)');
  members.forEach((name, i) => ins.run(comboId, name, i));
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM oc_combos ORDER BY sort_order, id').all();
  res.json({ items: rows.map(toJson) });
});

router.post('/', requireApiKey, (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name || name.length > 40) return res.status(400).json({ error: 'bad_request' });
  if (db.prepare('SELECT 1 FROM oc_combos WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'already_exists' });
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM oc_combos').get().m;
  const info = db
    .prepare('INSERT INTO oc_combos (name, sort_order, created_at) VALUES (?, ?, ?)')
    .run(name, maxOrder + 1, Date.now());

  setMembers(info.lastInsertRowid, cleanMembers(req.body && req.body.members));
  res.status(201).json(toJson(db.prepare('SELECT * FROM oc_combos WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', requireApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM oc_combos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const name = String((req.body && req.body.name) || row.name).trim();
  if (!name || name.length > 40) return res.status(400).json({ error: 'bad_request' });
  const clash = db.prepare('SELECT 1 FROM oc_combos WHERE name = ? AND id != ?').get(name, row.id);
  if (clash) return res.status(409).json({ error: 'already_exists' });

  db.prepare('UPDATE oc_combos SET name = ? WHERE id = ?').run(name, row.id);
  if (req.body && req.body.members !== undefined) {
    setMembers(row.id, cleanMembers(req.body.members));
  }
  res.json(toJson(db.prepare('SELECT * FROM oc_combos WHERE id = ?').get(row.id)));
});

// 순서 변경. 받은 id 순서대로 sort_order를 다시 매긴다.
router.put('/', requireApiKey, (req, res) => {
  const order = Array.isArray(req.body && req.body.order) ? req.body.order : null;
  if (!order) return res.status(400).json({ error: 'bad_request' });

  const reorder = db.transaction((ids) => {
    const upd = db.prepare('UPDATE oc_combos SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => upd.run(i, id));
  });
  reorder(order.map(Number).filter(Number.isInteger));

  const rows = db.prepare('SELECT * FROM oc_combos ORDER BY sort_order, id').all();
  res.json({ items: rows.map(toJson) });
});

router.delete('/:id', requireApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM oc_combos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM oc_combos WHERE id = ?').run(row.id);
  res.status(204).end();
});

module.exports = router;
