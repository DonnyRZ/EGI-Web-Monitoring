#!/usr/bin/env bash
set -euo pipefail

backup_root="${BACKUP_ROOT:-/var/backups/egi-web-monitoring}"
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

# Prune only after local integrity validation has passed.
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf -- {} +

echo "Backup completed: id=$stamp local=$dump_file"
