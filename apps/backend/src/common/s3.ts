import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cachedClient: S3Client | null = null;

export function createS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  // Workers use the private Docker endpoint for uploads. Signed URLs must use
  // an endpoint reachable by the browser through the public Nginx vhost.
  const endpoint =
    process.env.S3_PUBLIC_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    "http://localhost:9000";
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";

  cachedClient = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY || "change_me_minio",
    },
  });
  return cachedClient;
}

function getBucket(): string {
  return process.env.S3_BUCKET || "egi-monitoring";
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Private-bucket signed URL for an object key.
 * Absolute http(s) values are returned as-is for compatibility with existing
 * attachment fixtures and migration-safe records.
 */
export async function createSignedObjectUrl(
  objectRef: string,
  expiresInSeconds = 15 * 60,
): Promise<{ url: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  if (isHttpUrl(objectRef)) {
    return { url: objectRef, expiresAt };
  }

  const client = createS3Client();
  const bucket = getBucket();
  const key = objectRef.replace(/^\//, "");

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );

  return { url, expiresAt };
}


export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
) {
  const client = createS3Client();
  await client.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return key;
}
