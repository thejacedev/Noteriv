const fs = require("fs");
const path = require("path");
const { walkFiles, ensureParentDir, SYNC_EXTS } = require("./helpers");

async function sync(vaultPath, config) {
  const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
  } = require("@aws-sdk/client-s3");

  const { endpoint, bucket, accessKey, secretKey, region, prefix } = config;

  const client = new S3Client({
    endpoint: endpoint || undefined,
    region: region || "us-east-1",
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: !!endpoint,
  });

  const keyPrefix = prefix ? (prefix.endsWith("/") ? prefix : prefix + "/") : "";
  const localFiles = walkFiles(vaultPath);
  const localMap = new Map(localFiles.map((f) => [f.rel, f]));

  // List all remote objects
  const remoteEntries = new Map();
  let continuationToken;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: keyPrefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of resp.Contents || []) {
      const rel = obj.Key.slice(keyPrefix.length);
      if (rel && SYNC_EXTS.has(path.extname(rel).toLowerCase())) {
        remoteEntries.set(rel, {
          rel,
          key: obj.Key,
          mtime: new Date(obj.LastModified).getTime(),
        });
      }
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  let pushed = 0;
  let pulled = 0;

  // Push: local → S3
  for (const [rel, local] of localMap) {
    const remote = remoteEntries.get(rel);
    if (!remote || local.mtime > remote.mtime) {
      const content = fs.readFileSync(local.full);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: keyPrefix + rel,
          Body: content,
          ContentType: "text/markdown",
        })
      );
      pushed++;
    }
  }

  // Pull: S3 → local
  for (const [rel, remote] of remoteEntries) {
    const local = localMap.get(rel);
    if (!local || remote.mtime > local.mtime) {
      const resp = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: remote.key })
      );
      const chunks = [];
      for await (const chunk of resp.Body) chunks.push(chunk);
      const dest = path.join(vaultPath, rel);
      ensureParentDir(dest);
      fs.writeFileSync(dest, Buffer.concat(chunks));
      pulled++;
    }
  }

  return { pushed, pulled };
}

async function testConnection(config) {
  try {
    const { S3Client, HeadBucketCommand } = require("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: config.endpoint || undefined,
      region: config.region || "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: !!config.endpoint,
    });
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sync, testConnection };
