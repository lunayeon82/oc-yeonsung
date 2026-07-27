const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/auth');

// Shared factory for the `roles` and `aus` vocabularies, which are
// structurally identical (a list of labeled groups, each holding free-text tag strings)
// and always read/written as a whole tree, matching the original Firestore doc shape.
function createTagVocabRouter(groupTable, itemTable, groupFk) {
  const router = express.Router();

  function loadTree() {
    const groups = db.prepare(`SELECT * FROM ${groupTable} ORDER BY sort_order`).all();
    const items = db.prepare(`SELECT * FROM ${itemTable} ORDER BY sort_order`).all();
    const itemsByGroup = new Map();
    for (const it of items) {
      if (!itemsByGroup.has(it.group_id)) itemsByGroup.set(it.group_id, []);
      itemsByGroup.get(it.group_id).push(it.label);
    }
    return {
      groups: groups.map((g) => ({ label: g.label, items: itemsByGroup.get(g.id) || [] })),
    };
  }

  const replaceTree = db.transaction((tree) => {
    db.exec(`DELETE FROM ${groupTable}`);
    const insertGroup = db.prepare(`INSERT INTO ${groupTable} (label, sort_order) VALUES (?, ?)`);
    const insertItem = db.prepare(`INSERT INTO ${itemTable} (${groupFk}, label, sort_order) VALUES (?, ?, ?)`);
    (tree.groups || []).forEach((group, gi) => {
      const groupId = insertGroup.run(group.label, gi).lastInsertRowid;
      (group.items || []).forEach((label, ii) => insertItem.run(groupId, label, ii));
    });
  });

  router.get('/', (req, res) => res.json(loadTree()));
  router.put('/', requireApiKey, (req, res) => {
    replaceTree(req.body || {});
    res.json(loadTree());
  });

  return router;
}

module.exports = { createTagVocabRouter };
