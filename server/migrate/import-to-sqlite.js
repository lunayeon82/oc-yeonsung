/**
 * Reads migrate/dump/*.json (produced by firestore-export.js) and loads it into the
 * oc_ tables in shared.db, normalizing the two historical Firestore quirks documented
 * in the migration plan:
 *   - `characters` (top-level) + `data/characters` (embedded array) are merged into one
 *     `oc_characters` row per character (data/characters wins for name/gender/couple/order,
 *     characters/{id} wins for note/info/customSections when present).
 *   - `comments.storyId` pointed at either a story or an image with no discriminator;
 *     here we resolve parent_type by checking which id set it belongs to.
 *
 * Run from server/: node migrate/import-to-sqlite.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const dumpDir = path.join(__dirname, 'dump');

function readJson(name) {
  const file = path.join(dumpDir, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing dump file: ${file}. Run firestore-export.js first.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toGroupsShape(doc) {
  if (!doc) return { groups: [] };
  if (Array.isArray(doc.groups)) return { groups: doc.groups };
  if (Array.isArray(doc.list)) return { groups: [{ label: '기본', items: doc.list }] };
  return { groups: [] };
}

function importCharacters(dataDoc, characterDocs) {
  const byId = new Map(characterDocs.map((d) => [d.id, d]));
  const tree = toGroupsShape(dataDoc);

  const insertOwner = db.prepare('INSERT INTO oc_owners (name, code, sort_order) VALUES (?, ?, ?)');
  const insertSub = db.prepare('INSERT INTO oc_subgroups (owner_id, label, code, sort_order) VALUES (?, ?, ?, ?)');
  const insertChar = db.prepare(`INSERT INTO oc_characters
    (public_code, subgroup_id, name, gender, is_couple, sort_order, note, info_look, info_vibe, info_speech, info_speech_ex, info_personality, info_habits)
    VALUES (@publicCode, @subgroupId, @name, @gender, @isCouple, @sortOrder, @note, @look, @vibe, @speech, @speechEx, @personality, @habits)`);
  const insertSection = db.prepare('INSERT INTO oc_character_sections (character_id, title, content, sort_order) VALUES (?, ?, ?, ?)');

  let count = 0;
  (tree.groups || []).forEach((owner, oi) => {
    const ownerId = insertOwner.run(owner.owner || '', owner.code || null, oi).lastInsertRowid;
    (owner.subs || []).forEach((sub, si) => {
      const subId = insertSub.run(ownerId, sub.label || '', sub.code || null, si).lastInsertRowid;
      (sub.items || []).forEach((item, ci) => {
        const denorm = item.id ? byId.get(item.id) : null;
        const useCustomSections = denorm && Array.isArray(denorm.customSections) && denorm.customSections.length > 0;
        const info = useCustomSections ? {} : ((denorm && denorm.info) || {});
        const note = (denorm && denorm.note) || item.nt || null;

        const charId = insertChar.run({
          publicCode: item.id || null,
          subgroupId: subId,
          name: item.n || '',
          gender: item.g ? 1 : 0,
          isCouple: item.c ? 1 : 0,
          sortOrder: ci,
          note,
          look: info.look || null,
          vibe: info.vibe || null,
          speech: info.speech || null,
          speechEx: info.speechEx || null,
          personality: info.personality || null,
          habits: info.habits || null,
        }).lastInsertRowid;

        if (useCustomSections) {
          denorm.customSections.forEach((sec, secIdx) => {
            insertSection.run(charId, sec.title || '', sec.content || '', secIdx);
          });
        }
        count += 1;
      });
    });
  });
  console.log(`characters: imported ${count}`);
}

function importTagVocab(dataDoc, groupTable, itemTable, groupFk) {
  const tree = toGroupsShape(dataDoc);
  const insertGroup = db.prepare(`INSERT INTO ${groupTable} (label, sort_order) VALUES (?, ?)`);
  const insertItem = db.prepare(`INSERT INTO ${itemTable} (${groupFk}, label, sort_order) VALUES (?, ?, ?)`);
  (tree.groups || []).forEach((group, gi) => {
    const groupId = insertGroup.run(group.label || '', gi).lastInsertRowid;
    (group.items || []).forEach((label, ii) => insertItem.run(groupId, label, ii));
  });
  console.log(`${groupTable}: imported ${(tree.groups || []).length} group(s)`);
}

function importUsers(dataUsersDoc, personalNames) {
  const names = [];
  if (dataUsersDoc && Array.isArray(dataUsersDoc.names)) names.push(...dataUsersDoc.names);
  for (const n of personalNames) if (!names.includes(n)) names.push(n);
  const insert = db.prepare('INSERT OR IGNORE INTO oc_users (name, sort_order) VALUES (?, ?)');
  names.forEach((name, i) => insert.run(name, i));
  console.log(`users: ensured ${names.length}`);
}

function importStories(stories, chapters) {
  const chaptersByStory = new Map();
  for (const c of chapters) {
    if (!chaptersByStory.has(c.storyId)) chaptersByStory.set(c.storyId, []);
    chaptersByStory.get(c.storyId).push(c);
  }

  const insertStory = db.prepare(`INSERT INTO oc_stories (pid, title, rating, chapter_count, comment_count, created_at, updated_at)
    VALUES (@pid, @title, @rating, @chapterCount, 0, @createdAt, @updatedAt)`);
  const insertChar = db.prepare('INSERT OR IGNORE INTO oc_story_characters (story_pid, character_name) VALUES (?, ?)');
  const insertRole = db.prepare('INSERT OR IGNORE INTO oc_story_roles (story_pid, role) VALUES (?, ?)');
  const insertAu = db.prepare('INSERT OR IGNORE INTO oc_story_aus (story_pid, au) VALUES (?, ?)');
  const insertLoreRef = db.prepare('INSERT INTO oc_story_lore_refs (story_pid, lore_pid, lore_title_snapshot, sort_order) VALUES (?, ?, ?, ?)');
  const insertChapter = db.prepare('INSERT INTO oc_chapters (pid, story_pid, sort_order, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  for (const s of stories) {
    const storyChapters = (chaptersByStory.get(s.id) || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    insertStory.run({
      pid: s.id,
      title: s.title || '',
      rating: s.rating || '',
      chapterCount: storyChapters.length,
      createdAt: s.createdAt || s.updatedAt || Date.now(),
      updatedAt: s.updatedAt || s.createdAt || Date.now(),
    });
    (s.characters || []).forEach((name) => insertChar.run(s.id, name));
    (s.roles || []).forEach((r) => insertRole.run(s.id, r));
    (s.aus || []).forEach((a) => insertAu.run(s.id, a));
    (s.loreRefs || []).forEach((ref, i) => insertLoreRef.run(s.id, ref.id, ref.title || '', i));
    storyChapters.forEach((c, i) => insertChapter.run(c.id, s.id, i, c.title || '', c.body || '', c.createdAt || Date.now()));
  }
  console.log(`stories: imported ${stories.length}, chapters: ${chapters.length}`);
}

function importLores(lores, loreChapters) {
  const chaptersByLore = new Map();
  for (const c of loreChapters) {
    if (!chaptersByLore.has(c.loreId)) chaptersByLore.set(c.loreId, []);
    chaptersByLore.get(c.loreId).push(c);
  }

  const insertLore = db.prepare(`INSERT INTO oc_lores (pid, title, chapter_count, created_at, updated_at)
    VALUES (@pid, @title, @chapterCount, @createdAt, @updatedAt)`);
  const insertChapter = db.prepare('INSERT INTO oc_lore_chapters (pid, lore_pid, sort_order, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  for (const l of lores) {
    const loreChaptersForLore = (chaptersByLore.get(l.id) || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    insertLore.run({
      pid: l.id,
      title: l.title || '',
      chapterCount: loreChaptersForLore.length,
      createdAt: l.createdAt || l.updatedAt || Date.now(),
      updatedAt: l.updatedAt || l.createdAt || Date.now(),
    });
    loreChaptersForLore.forEach((c, i) => insertChapter.run(c.id, l.id, i, c.title || '', c.body || '', c.createdAt || Date.now()));
  }
  console.log(`lores: imported ${lores.length}, loreChapters: ${loreChapters.length}`);
}

function importImages(images, imageChapters) {
  const chaptersBySet = new Map();
  for (const c of imageChapters) {
    if (!chaptersBySet.has(c.setId)) chaptersBySet.set(c.setId, []);
    chaptersBySet.get(c.setId).push(c);
  }

  const insertImage = db.prepare(`INSERT INTO oc_images
    (pid, title, description, thumb_chapter_pid, thumb_path, chapter_count, comment_count, created_at, updated_at)
    VALUES (@pid, @title, @description, @thumbChapterPid, @thumbPath, @chapterCount, 0, @createdAt, @updatedAt)`);
  const insertChar = db.prepare('INSERT OR IGNORE INTO oc_image_characters (image_pid, character_name) VALUES (?, ?)');
  const insertTag = db.prepare('INSERT OR IGNORE INTO oc_image_tags (image_pid, tag) VALUES (?, ?)');
  const insertChapter = db.prepare('INSERT INTO oc_image_chapters (pid, image_pid, sort_order, image_path) VALUES (?, ?, ?, ?)');

  for (const im of images) {
    const setChapters = (chaptersBySet.get(im.id) || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    insertImage.run({
      pid: im.id,
      title: im.title || '',
      description: im.description || '',
      thumbChapterPid: im.thumbChapterId || null,
      thumbPath: im.thumbUrl ? `images/${im.id}/thumb.webp` : null,
      chapterCount: setChapters.length,
      createdAt: im.createdAt || im.updatedAt || Date.now(),
      updatedAt: im.updatedAt || im.createdAt || Date.now(),
    });
    (im.characters || []).forEach((name) => insertChar.run(im.id, name));
    (im.tags || []).forEach((t) => insertTag.run(im.id, t));
    setChapters.forEach((c, i) => {
      insertChapter.run(c.id, im.id, i, `images/${im.id}/chapters/${c.id}/full.webp`);
    });
  }
  console.log(`images: imported ${images.length}, imageChapters: ${imageChapters.length}`);
}

function importComments(comments, storyIds, imageIds) {
  const insert = db.prepare('INSERT INTO oc_comments (parent_type, parent_pid, chapter_pid, body, created_at) VALUES (?, ?, ?, ?, ?)');
  let skipped = 0;
  for (const c of comments) {
    let parentType = null;
    if (storyIds.has(c.storyId)) parentType = 'story';
    else if (imageIds.has(c.storyId)) parentType = 'image';
    if (!parentType) { skipped += 1; continue; }
    insert.run(parentType, c.storyId, c.chapterPid || null, c.body || '', c.createdAt || Date.now());
  }
  console.log(`comments: imported ${comments.length - skipped}, skipped ${skipped} (orphaned parent)`);
}

function importPersonal(personal) {
  const getUserId = db.prepare('SELECT id FROM oc_users WHERE name = ?');
  const insertDraw = db.prepare('INSERT INTO oc_draw_box (user_id, names, roles, au, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertReadLater = db.prepare('INSERT INTO oc_read_later (user_id, parent_type, parent_pid, title_snapshot, added_at) VALUES (?, ?, ?, ?, ?)');
  const insertStoryBox = db.prepare('INSERT INTO oc_story_box (user_id, parent_type, parent_pid, title_snapshot, added_at) VALUES (?, ?, ?, ?, ?)');

  for (const [name, lists] of Object.entries(personal)) {
    const user = getUserId.get(name);
    if (!user) { console.warn(`skipping personal data for unknown user ${name}`); continue; }

    for (const d of lists.drawBox || []) {
      const isPairShape = 'left' in d || 'right' in d;
      const names = isPairShape ? [d.left, d.right] : (d.names || []);
      const roles = isPairShape ? [d.roleL, d.roleR] : (d.roles || []);
      insertDraw.run(user.id, JSON.stringify(names), JSON.stringify(roles), d.au || '', d.memo || '', d.createdAt || Date.now());
    }
    for (const r of lists.readLater || []) {
      insertReadLater.run(user.id, r.type === 'image' ? 'image' : 'story', r.storyId, r.title || '', r.addedAt || Date.now());
    }
    for (const s of lists.storyBox || []) {
      insertStoryBox.run(user.id, s.type === 'image' ? 'image' : 'story', s.storyId, s.title || '', s.addedAt || Date.now());
    }
  }
  console.log('personal: imported drawBox/readLater/storyBox for', Object.keys(personal).length, 'user(s)');
}

function main() {
  const dataDump = readJson('data');
  const characterDocs = readJson('characters');
  const stories = readJson('stories');
  const chapters = readJson('chapters');
  const lores = readJson('lores');
  const loreChapters = readJson('loreChapters');
  const images = readJson('images');
  const imageChapters = readJson('imageChapters');
  const comments = readJson('comments');
  const personal = readJson('personal');

  const run = db.transaction(() => {
    importUsers(dataDump.users, Object.keys(personal));
    importCharacters(dataDump.characters, characterDocs);
    importTagVocab(dataDump.roles, 'oc_role_groups', 'oc_roles', 'group_id');
    importTagVocab(dataDump.aus, 'oc_au_groups', 'oc_aus', 'group_id');
    importStories(stories, chapters);
    importLores(lores, loreChapters);
    importImages(images, imageChapters);
    importComments(comments, new Set(stories.map((s) => s.id)), new Set(images.map((i) => i.id)));
    importPersonal(personal);
  });
  run();

  console.log('Import complete.');
}

main();
