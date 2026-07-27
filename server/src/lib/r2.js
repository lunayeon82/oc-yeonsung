const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const bucket = process.env.R2_BUCKET;
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function uploadObject(objectPath, buffer, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectPath,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return objectPath;
}

async function getObjectBuffer(objectPath) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectPath }));
  return Buffer.from(await res.Body.transformToByteArray());
}

async function deleteObject(objectPath) {
  if (!objectPath) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectPath }));
  } catch {
    // best-effort, matches previous Firebase Storage delete behavior
  }
}

function toPublicUrl(objectPath, version) {
  if (!objectPath) return null;
  const url = `${publicBaseUrl}/${objectPath.replace(/^\/+/, '')}`;
  // Chapter/thumbnail objects live at a fixed key that gets overwritten in place on
  // re-upload or thumbnail regeneration, so the URL itself never changes even when the
  // underlying file does — browsers and R2's CDN happily cache that URL indefinitely.
  // Appending the parent row's updated_at as a version param busts that cache exactly
  // when the content actually changes, without needing a real cache-purge integration.
  return version != null ? `${url}?v=${version}` : url;
}

module.exports = { uploadObject, getObjectBuffer, deleteObject, toPublicUrl };
