import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT || "http://127.0.0.1:9000";
const bucket = process.env.S3_BUCKET || "egi-monitoring";
const prefix = "website/";
const apply = process.env.VISUAL_EVIDENCE_CLEANUP_APPLY === "YES";

assertLocalOnly(endpoint);

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "true").toLowerCase() !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY || "change_me_minio",
  },
});

let continuationToken;
let count = 0;
let bytes = 0;

do {
  const page = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    ContinuationToken: continuationToken,
  }));
  const objects = (page.Contents || [])
    .filter((object) => typeof object.Key === "string" && object.Key.startsWith(prefix))
    .map((object) => ({ Key: object.Key, Size: object.Size || 0 }));

  count += objects.length;
  bytes += objects.reduce((sum, object) => sum + object.Size, 0);
  console.log(`Found ${objects.length} visual object(s) under ${prefix}`);

  if (apply && objects.length > 0) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects.map(({ Key }) => ({ Key })), Quiet: true },
    }));
    console.log(`Deleted ${objects.length} object(s)`);
  }

  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);

console.log(`${apply ? "Applied" : "Dry-run"}: ${count} object(s), ${bytes} byte(s)`);
if (!apply) {
  console.log("No object was deleted. Set VISUAL_EVIDENCE_CLEANUP_APPLY=YES only for an isolated local MinIO bucket.");
}

function assertLocalOnly(value) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Visual evidence cleanup refuses NODE_ENV=production");
  }
  const host = new URL(value).hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "minio"]);
  if (!localHosts.has(host)) {
    throw new Error(`Visual evidence cleanup only accepts local MinIO; received ${host}`);
  }
}
