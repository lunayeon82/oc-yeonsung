const express = require('express');
require('express-async-errors');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/characters', require('./routes/characters'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/aus', require('./routes/aus'));
app.use('/api/users', require('./routes/users'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/lores', require('./routes/lores'));
app.use('/api/images', require('./routes/images'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/users/:name/draw-box', require('./routes/drawBox'));
app.use('/api/users/:name/read-later', require('./routes/readLater'));
app.use('/api/users/:name/story-box', require('./routes/storyBox'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/feed', require('./routes/feed'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

module.exports = app;
