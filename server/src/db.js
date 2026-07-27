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

const SEED_USERS = ['김굥', '하지', '예밍'];
const insertUser = db.prepare('INSERT OR IGNORE INTO oc_users (name, sort_order) VALUES (?, ?)');
const seedUsers = db.transaction((names) => {
  names.forEach((name, i) => insertUser.run(name, i));
});
seedUsers(SEED_USERS);

module.exports = db;
