import {
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function createS3Client(): S3Client {
  // Workers use the private Docker endpoint for uploads. Signed URLs must use
  // an endpoint reachable by the browser through the public Nginx vhost.
  const endpoint =
    process.env.S3_PUBLIC_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    "http://localhost:9000";
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";

  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY || "change_me_minio",
    },
  });
}

function getBucket(): string {
  return process.env.S3_BUCKET || "egi-monitoring";
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Private-bucket signed URL for a screenshot object key.
 * Absolute http(s) values (legacy/test fixtures) are returned as-is.
 */
export async function createScreenshotSignedUrl(
  screenshotRef: string,
  expiresInSeconds = 15 * 60,
): Promise<{ url: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  if (isHttpUrl(screenshotRef)) {
    return { url: screenshotRef, expiresAt };
  }

  const client = createS3Client();
  const bucket = getBucket();
  const key = screenshotRef.replace(/^\//, "");

  // Optional existence check — if MinIO is down, still attempt signing
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );

  return { url, expiresAt };
}
