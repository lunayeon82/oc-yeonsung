/**
 * Drops the 3 tables left behind by the lore feature removal:
 * oc_story_lore_refs, oc_lore_chapters, oc_lores (schema.sql no longer defines
 * them, but CREATE TABLE IF NOT EXISTS never drops an existing table on its own).
 *
 * Confirmed empty (0 rows each) in production at backup time — see
 * server/backup/README.md and the JSON files next to it. This script re-checks
 * that before dropping anything and refuses to proceed if any table is non-empty
 * (in case something wrote to them between the backup and this running).
 *
 * NOT run automatically by anything — this is meant to be run once, manually,
 * after a human has reviewed server/backup/ and confirmed it's safe to proceed.
 *
 * Run from server/: node migrate/drop-lore-tables.js
 */
require('dotenv').config();
const db = require('../src/db');

const TABLES = ['oc_story_lore_refs', 'oc_lore_chapters', 'oc_lores'];

function tableExists(name) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function main() {
  console.log(`DB: ${db.name}`);
  console.log('Back up the database file first, e.g.:');
  console.log(`  cp "${db.name}" "${db.name}.bak-$(date +%Y%m%d%H%M%S)"`);
  console.log('');

  const present = TABLES.filter(tableExists);
  if (present.length === 0) {
    console.log('None of the lore tables exist in this database — nothing to do.');
    return;
  }

  for (const t of present) {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
    console.log(`${t}: ${n} row(s)`);
    if (n > 0) {
      console.error(
        `\nABORTING: ${t} has ${n} row(s), but server/backup/ was taken when it was empty. ` +
        `Re-export server/backup/${t.replace('oc_', 'oc_')}.json before dropping anything.`
      );
      process.exitCode = 1;
      return;
    }
  }

  const drop = db.transaction(() => {
    for (const t of present) db.exec(`DROP TABLE ${t}`);
  });
  drop();

  console.log(`\nDropped: ${present.join(', ')}`);
  console.log('Done.');
}

main();
