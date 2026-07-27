/**
 * Downloads every image referenced in the Firestore dump (migrate/dump/images.json,
 * migrate/dump/imageChapters.json) from its Firebase Storage download URL and
 * re-uploads it to Cloudflare R2 at the same deterministic object path SQLite now
 * stores (images/{pid}/chapters/{chapterPid}/full.webp, images/{pid}/thumb.webp).
 * Requires R2_* vars in server/.env. Run AFTER import-to-sqlite.js.
 *
 * Run from server/: node migrate/migrate-images-to-r2.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const r2 = require('../src/lib/r2');

const dumpDir = path.join(__dirname, 'dump');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dumpDir, `${name}.json`), 'utf8'));

async function copyOne(url, objectPath, label) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED ${label}: HTTP ${res.status} for ${url}`);
    return false;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await r2.uploadObject(objectPath, buffer, res.headers.get('content-type') || 'image/webp');
  console.log(`OK ${label} -> ${objectPath} (${buffer.length} bytes)`);
  return true;
}

async function main() {
  const images = readJson('images');
  const imageChapters = readJson('imageChapters');

  let ok = 0;
  let fail = 0;

  for (const c of imageChapters) {
    if (!c.imageUrl) continue;
    const objectPath = `images/${c.setId}/chapters/${c.id}/full.webp`;
    const success = await copyOne(c.imageUrl, objectPath, `chapter ${c.id}`);
    success ? ok++ : fail++;
  }

  for (const im of images) {
    if (!im.thumbUrl) continue;
    const objectPath = `images/${im.id}/thumb.webp`;
    const success = await copyOne(im.thumbUrl, objectPath, `thumb ${im.id}`);
    success ? ok++ : fail++;
  }

  console.log(`Done. ${ok} succeeded, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
