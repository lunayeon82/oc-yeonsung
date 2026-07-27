function encodeCursor(updatedAt, pid) {
  return Buffer.from(`${updatedAt}:${pid}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const idx = raw.lastIndexOf(':');
    const updatedAt = Number(raw.slice(0, idx));
    const pid = raw.slice(idx + 1);
    if (!Number.isFinite(updatedAt) || !pid) return null;
    return { updatedAt, pid };
  } catch {
    return null;
  }
}

function placeholders(arr) {
  return arr.map(() => '?').join(',');
}

function splitParam(value) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = { encodeCursor, decodeCursor, placeholders, splitParam };
