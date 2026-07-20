import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export function assertS3ProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const unsafe = new Set(["minioadmin", "change_me_minio"]);
  for (const key of ["S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
    const value = env[key]?.trim();
    if (!value || unsafe.has(value)) {
      throw new Error(`${key} must be configured with a non-default secret in production`);
    }
  }
}

export function createS3Client(env: NodeJS.ProcessEnv = process.env): S3Client {
  const endpoint = env.S3_ENDPOINT || "http://localhost:9000";
  const forcePathStyle =
    (env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";

  return new S3Client({
    region: env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY || "minioadmin",
      secretAccessKey: env.S3_SECRET_KEY || "change_me_minio",
    },
  });
}

export function getBucket(env: NodeJS.ProcessEnv = process.env): string {
  return env.S3_BUCKET || "egi-monitoring";
}

export async function ensureBucket(
  client: S3Client,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    // Only a known-missing bucket can be created. Permission, networking, and
    // authentication errors must remain visible to the worker/operator.
    if (statusCode !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

/**
 * Object key: website/{website_id}/{yyyy}/{mm}/{dd}/{HH-mm}.webp
 * Uses UTC components of scheduled_at for stable paths across workers.
 */
export function screenshotObjectKey(
  websiteId: string,
  scheduledAt: Date,
): string {
  const yyyy = scheduledAt.getUTCFullYear().toString().padStart(4, "0");
  const mm = (scheduledAt.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = scheduledAt.getUTCDate().toString().padStart(2, "0");
  const HH = scheduledAt.getUTCHours().toString().padStart(2, "0");
  const min = scheduledAt.getUTCMinutes().toString().padStart(2, "0");
  return `website/${websiteId}/${yyyy}/${mm}/${dd}/${HH}-${min}.webp`;
}

export async function uploadScreenshot(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/webp",
    }),
  );
}

export async function deleteScreenshotsOlderThan(
  client: S3Client,
  bucket: string,
  olderThan: Date,
): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "website/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of listed.Contents ?? []) {
      if (!obj.Key || !obj.LastModified) continue;
      if (obj.LastModified >= olderThan) continue;
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }),
      );
      deleted += 1;
    }

    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return deleted;
}
