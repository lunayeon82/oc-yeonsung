/**
 * Rebuilds the 9 oc_* tables that were created with a bare `INTEGER PRIMARY KEY`
 * (no AUTOINCREMENT) so their rowids stop being reused after a DELETE — the same
 * class of bug that caused the id-reassignment incident documented in the project's
 * CLAUDE.md (2026-08-17 "id가 트리 저장마다 재배정되던 근본 버그"). `schema.sql` now
 * declares AUTOINCREMENT on these columns, but `CREATE TABLE IF NOT EXISTS` never
 * retrofits an existing table — SQLite has no `ALTER TABLE ... ADD AUTOINCREMENT`,
 * the table has to be rebuilt. This script does that, following SQLite's own
 * documented 12-step "how to alter a table" procedure:
 * https://www.sqlite.org/lang_altertable.html#otheralter
 *
 * All ids are preserved exactly (INSERT INTO new SELECT * FROM old carries the old
 * id values across — AUTOINCREMENT only fires when the id column is omitted/NULL),
 * so every foreign key elsewhere in the database (subgroup_id, character_id,
 * group_id, user_id, ...) stays valid without needing any other table to change.
 *
 * This does NOT run automatically as part of app startup or `npm ci` — it must be
 * run once, manually, against the target database, and the database should be
 * backed up first (see the printed instructions below).
 *
 * `PRAGMA legacy_alter_table = ON` and the pre-commit foreign_key_check (with an
 * automatic rollback on violation) are both load-bearing, not defensive filler — the
 * first production run of this script, before they were added, silently corrupted 7
 * unrelated tables' FK reference text and had to be repaired by hand afterward. See
 * CLAUDE.md (2026-08-23) for the incident writeup.
 *
 * Run from server/: node migrate/add-autoincrement.js
 */
require('dotenv').config();
const db = require('../src/db');

const TABLES = [
  {
    name: 'oc_owners',
    create: `CREATE TABLE oc_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: [],
  },
  {
    name: 'oc_subgroups',
    create: `CREATE TABLE oc_subgroups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES oc_owners(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      code TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: [],
  },
  {
    name: 'oc_characters',
    create: `CREATE TABLE oc_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_code TEXT UNIQUE,
      subgroup_id INTEGER REFERENCES oc_subgroups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      gender INTEGER NOT NULL DEFAULT 0,
      is_couple INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      info_look TEXT,
      info_vibe TEXT,
      info_speech TEXT,
      info_speech_ex TEXT,
      info_personality TEXT,
      info_habits TEXT,
      portrait_path TEXT,
      portrait_updated_at INTEGER
    )`,
    indexes: ['CREATE INDEX idx_oc_characters_subgroup ON oc_characters(subgroup_id)'],
  },
  {
    name: 'oc_character_sections',
    create: `CREATE TABLE oc_character_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL REFERENCES oc_characters(id) ON DELETE CASCADE,
      title TEXT,
      content TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: ['CREATE INDEX idx_oc_character_sections_char ON oc_character_sections(character_id)'],
  },
  {
    name: 'oc_role_groups',
    create: `CREATE TABLE oc_role_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: [],
  },
  {
    name: 'oc_roles',
    create: `CREATE TABLE oc_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES oc_role_groups(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: ['CREATE INDEX idx_oc_roles_group ON oc_roles(group_id)'],
  },
  {
    name: 'oc_au_groups',
    create: `CREATE TABLE oc_au_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: [],
  },
  {
    name: 'oc_aus',
    create: `CREATE TABLE oc_aus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES oc_au_groups(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: ['CREATE INDEX idx_oc_aus_group ON oc_aus(group_id)'],
  },
  {
    name: 'oc_users',
    create: `CREATE TABLE oc_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    indexes: [],
  },
];

function rebuildTable({ name, create, indexes }) {
  const before = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  const tmp = `${name}_pre_autoincrement`;
  db.exec(`ALTER TABLE ${name} RENAME TO ${tmp}`);

  // Column list comes from the live (renamed) table, not from `create` above, so this
  // works even if a column was added later via db.js's ensureColumn() (e.g.
  // oc_characters.portrait_path) and isn't literally spelled out in `create` in the
  // same order. Selecting/inserting by explicit name (not `SELECT *`) means physical
  // column order never has to match between the old and rebuilt table.
  const cols = db.prepare(`PRAGMA table_info(${tmp})`).all().map((c) => c.name);

  db.exec(create);
  db.exec(`INSERT INTO ${name} (${cols.join(',')}) SELECT ${cols.join(',')} FROM ${tmp}`);
  db.exec(`DROP TABLE ${tmp}`);
  for (const idx of indexes) db.exec(idx);
  const after = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  if (before !== after) throw new Error(`row count mismatch for ${name}: ${before} -> ${after}`);
  console.log(`rebuilt ${name} (${after} rows preserved)`);
}

function main() {
  console.log(`DB: ${db.name}`);
  console.log('Back up the database file first, e.g.:');
  console.log(`  cp "${db.name}" "${db.name}.bak-$(date +%Y%m%d%H%M%S)"`);
  console.log('');

  // Without this, SQLite's own "smart" ALTER TABLE RENAME silently rewrites every
  // *other* table's stored FK reference text to follow the rename (e.g. oc_subgroups'
  // `REFERENCES oc_owners(id)` becomes `REFERENCES oc_owners_pre_autoincrement(id)`
  // the moment oc_owners is renamed away) — corrupting any table that references one
  // being rebuilt here but isn't itself in TABLES (oc_draw_box/oc_read_later/
  // oc_story_box reference oc_users; oc_subgroups/oc_characters/oc_roles/oc_aus
  // reference each other within this same list). legacy_alter_table=ON disables that
  // rewrite, so a table recreated under its original name is transparently valid
  // again to everything that already referenced that name. This is not hypothetical:
  // the first production run of this script (before this fix) did exactly this and
  // had to be repaired by hand — see CLAUDE.md.
  db.exec('PRAGMA legacy_alter_table = ON');
  db.pragma('foreign_keys = OFF');

  let violations = [];
  const run = db.transaction(() => {
    for (const t of TABLES) rebuildTable(t);
    // Checked *inside* the transaction, before commit, specifically so that finding a
    // violation throws here and better-sqlite3 rolls the whole transaction back —
    // checking after commit (as this script originally did) can't undo anything.
    violations = db.pragma('foreign_key_check');
    if (violations.length) {
      throw new Error(`foreign_key_check found ${violations.length} violation(s) — rolling back`);
    }
  });

  try {
    run();
  } catch (err) {
    db.pragma('foreign_keys = ON');
    db.exec('PRAGMA legacy_alter_table = OFF');
    console.error(err.message, violations);
    process.exitCode = 1;
    return;
  }

  db.pragma('foreign_keys = ON');
  db.exec('PRAGMA legacy_alter_table = OFF');
  console.log('foreign_key_check: OK, no violations.');
  console.log('Done.');
}

main();
