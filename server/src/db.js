const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data/shared.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// `CREATE TABLE IF NOT EXISTS` doesn't add columns to a table that already exists,
// so columns added after a DB has already been created need an explicit ALTER TABLE.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('oc_stories', 'excerpt', "TEXT NOT NULL DEFAULT ''");
ensureColumn('oc_characters', 'portrait_path', 'TEXT');
ensureColumn('oc_characters', 'portrait_updated_at', 'INTEGER');

const SEED_USERS = ['김굥', '하지', '예밍'];
const insertUser = db.prepare('INSERT OR IGNORE INTO oc_users (name, sort_order) VALUES (?, ?)');
const seedUsers = db.transaction((names) => {
  names.forEach((name, i) => insertUser.run(name, i));
});
seedUsers(SEED_USERS);

module.exports = db;
