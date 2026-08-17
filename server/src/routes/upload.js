const express = require('express');
const multer = require('multer');
const { requireApiKey } = require('../middleware/auth');
const r2 = require('../lib/r2');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/', requireApiKey, upload.single('file'), async (req, res) => {
  const { imagePid, chapterPid } = req.body || {};
  if (!req.file || !imagePid || !chapterPid) return res.status(400).json({ error: 'bad_request' });

  const objectPath = `images/${imagePid}/chapters/${chapterPid}/full.webp`;
  try {
    await r2.uploadObject(objectPath, req.file.buffer, req.file.mimetype);
  } catch (err) {
    // Express 4 doesn't forward async handler rejections to the error middleware on
    // its own, so an uncaught R2 failure here would hang the request forever instead
    // of surfacing an error to the client.
    console.error('chapter image upload failed:', err);
    return res.status(502).json({ error: 'upload_failed' });
  }
  res.status(201).json({ path: objectPath, url: r2.toPublicUrl(objectPath) });
});

module.exports = router;
