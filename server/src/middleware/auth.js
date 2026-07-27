function requireApiKey(req, res, next) {
  const key = req.get('X-API-Key');
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = { requireApiKey };
