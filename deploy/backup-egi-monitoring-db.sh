#!/usr/bin/env bash
set -euo pipefail

backup_root="${BACKUP_ROOT:-/var/backups/egi-web-monitoring}"
backup_s3_required="${BACKUP_S3_REQUIRED:-true}"
aws_bin="${AWS_CLI_BIN:-aws}"
pg_port="${PGPORT:-5432}"
pg_database="${PGDATABASE:-egi_monitoring}"
lock_file="${BACKUP_LOCK_FILE:-/run/lock/egi-web-monitoring-db-backup.lock}"

install -d -m 700 "$backup_root"
install -d -m 755 "$(dirname "$lock_file")"
exec 9>"$lock_file"
flock -n 9 || {
  echo "A PostgreSQL backup is already running; refusing to overlap backups." >&2
  exit 11
}

stamp="$(date -u +%Y%m%d-%H%M%S)"
backup_dir="$backup_root/$stamp"
dump_file="$backup_dir/egi_monitoring.dump"
checksum_file="$backup_dir/SHA256SUMS"

install -d -m 700 "$backup_dir"
runuser -u postgres -- pg_dump -p "$pg_port" -d "$pg_database" -Fc > "$dump_file"
chmod 600 "$dump_file"

if [[ ! -s "$dump_file" ]]; then
  echo "The PostgreSQL dump is empty: $dump_file" >&2
  exit 12
fi

pg_restore --list "$dump_file" > /dev/null
sha256sum "$dump_file" > "$checksum_file"
chmod 600 "$checksum_file"
sha256sum -c "$checksum_file" > /dev/null

backup_s3_endpoint="${BACKUP_S3_ENDPOINT:-}"
backup_s3_bucket="${BACKUP_S3_BUCKET:-}"
backup_s3_prefix="${BACKUP_S3_PREFIX:-egi-web-monitoring/postgresql}"
backup_s3_region="${BACKUP_S3_REGION:-us-east-1}"
backup_s3_sse="${BACKUP_S3_SSE:-AES256}"

if [[ "$backup_s3_required" == "true" ]]; then
  [[ -n "$backup_s3_endpoint" ]] || { echo "BACKUP_S3_ENDPOINT is required." >&2; exit 13; }
  [[ -n "$backup_s3_bucket" ]] || { echo "BACKUP_S3_BUCKET is required." >&2; exit 13; }
  command -v "$aws_bin" > /dev/null || {
    echo "AWS CLI not found at $aws_bin; refusing a backup without offsite copy." >&2
    exit 13
  }
fi

if [[ -n "$backup_s3_endpoint" && -n "$backup_s3_bucket" ]]; then
  object_prefix="${backup_s3_prefix#/}"
  object_prefix="${object_prefix%/}/$stamp"
  dump_key="$object_prefix/egi_monitoring.dump"
  checksum_key="$object_prefix/SHA256SUMS"
  dump_uri="s3://$backup_s3_bucket/$dump_key"
  checksum_uri="s3://$backup_s3_bucket/$checksum_key"

  s3_common_args=(--endpoint-url "$backup_s3_endpoint" --region "$backup_s3_region")
  if [[ -n "$backup_s3_sse" ]]; then
    s3_common_args+=(--sse "$backup_s3_sse")
  fi

  "$aws_bin" s3 cp "$dump_file" "$dump_uri" "${s3_common_args[@]}"
  "$aws_bin" s3 cp "$checksum_file" "$checksum_uri" "${s3_common_args[@]}"

  remote_size="$("$aws_bin" s3api head-object \
    --bucket "$backup_s3_bucket" \
    --key "$dump_key" \
    --endpoint-url "$backup_s3_endpoint" \
    --region "$backup_s3_region" \
    --query ContentLength \
    --output text)"
  local_size="$(stat -c '%s' "$dump_file")"
  [[ "$remote_size" == "$local_size" ]] || {
    echo "Offsite dump size mismatch: local=$local_size remote=$remote_size" >&2
    exit 14
  }
  remote_checksum="$("$aws_bin" s3 cp "$checksum_uri" - --endpoint-url "$backup_s3_endpoint" --region "$backup_s3_region")"
  local_checksum="$(cat "$checksum_file")"
  [[ "$remote_checksum" == "$local_checksum" ]] || {
    echo "Offsite checksum manifest mismatch." >&2
    exit 14
  }
else
  echo "Offsite backup is not configured; BACKUP_S3_REQUIRED=false allows local-only mode." >&2
fi

# Prune only after local integrity and the required offsite copy have passed.
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf -- {} +

echo "Backup completed: id=$stamp local=$dump_file offsite=$([[ -n "$backup_s3_endpoint" && -n "$backup_s3_bucket" ]] && echo yes || echo no)"
