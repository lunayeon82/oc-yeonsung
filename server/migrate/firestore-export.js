/**
 * Dumps every Firestore collection used by oc-yeonsung to JSON files under migrate/dump/.
 * Requires GOOGLE_APPLICATION_CREDENTIALS (service account key path) in server/.env.
 * The `feed` collection is intentionally skipped — nothing in the app ever reads it.
 *
 * Run from server/: node migrate/firestore-export.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const dumpDir = path.join(__dirname, 'dump');
fs.mkdirSync(dumpDir, { recursive: true });

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

function snapshotToArray(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function serialize(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

function write(name, data) {
  fs.writeFileSync(path.join(dumpDir, `${name}.json`), JSON.stringify(serialize(data), null, 2));
  console.log(`wrote ${name}.json (${Array.isArray(data) ? data.length : 1} item(s))`);
}

async function main() {
  const dataDocs = ['characters', 'roles', 'aus', 'users', 'meta'];
  const dataOut = {};
  for (const id of dataDocs) {
    const snap = await db.collection('data').doc(id).get();
    dataOut[id] = snap.exists ? snap.data() : null;
  }
  write('data', dataOut);

  for (const col of ['characters', 'stories', 'chapters', 'lores', 'loreChapters', 'images', 'imageChapters', 'comments']) {
    const snap = await db.collection(col).get();
    write(col, snapshotToArray(snap));
  }

  const userDocs = await db.collection('users').listDocuments();
  const personalData = {};
  for (const userDoc of userDocs) {
    const name = userDoc.id;
    personalData[name] = {};
    for (const sub of ['drawBox', 'readLater', 'storyBox']) {
      const snap = await userDoc.collection(sub).get();
      personalData[name][sub] = snapshotToArray(snap);
    }
  }
  write('personal', personalData);

  console.log('Export complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
