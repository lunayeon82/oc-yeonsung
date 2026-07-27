const sharp = require('sharp');
const db = require('../db');
const r2 = require('./r2');

// Regenerates images/{pid}/thumb.webp server-side from whichever chapter is
// designated as the thumbnail source, reading the already-uploaded full-size
// chapter image straight out of R2. This removes the old constraint where a
// browser could only re-encode a thumbnail from a freshly-selected file.
async function regenerateImageThumbnail(pid) {
  const image = db.prepare('SELECT thumb_chapter_pid FROM oc_images WHERE pid = ?').get(pid);
  if (!image) return;

  const chapters = db.prepare('SELECT pid, image_path FROM oc_image_chapters WHERE image_pid = ? ORDER BY sort_order').all(pid);
  if (chapters.length === 0) {
    db.prepare('UPDATE oc_images SET thumb_path = NULL, thumb_chapter_pid = NULL WHERE pid = ?').run(pid);
    return;
  }

  const source = chapters.find((c) => c.pid === image.thumb_chapter_pid) || chapters[0];

  try {
    const original = await r2.getObjectBuffer(source.image_path);
    const thumbBuffer = await sharp(original).resize({ width: 640 }).webp({ quality: 82 }).toBuffer();
    const thumbPath = `images/${pid}/thumb.webp`;
    await r2.uploadObject(thumbPath, thumbBuffer, 'image/webp');
    db.prepare('UPDATE oc_images SET thumb_path = ?, thumb_chapter_pid = ? WHERE pid = ?').run(thumbPath, source.pid, pid);
  } catch (err) {
    console.error(`thumbnail generation failed for image ${pid}:`, err);
  }
}

module.exports = { regenerateImageThumbnail };
