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

function toPublicUrl(objectPath) {
  if (!objectPath) return null;
  return `${publicBaseUrl}/${objectPath.replace(/^\/+/, '')}`;
}

module.exports = { uploadObject, getObjectBuffer, deleteObject, toPublicUrl };
