#!/usr/bin/env bash
set -euo pipefail

backup_root=/var/backups/egi-web-monitoring
stamp=$(date -u +%Y%m%d-%H%M%S)
backup_dir="$backup_root/$stamp"

install -d -m 700 "$backup_dir"
runuser -u postgres -- pg_dump -p 5432 -d egi_monitoring -Fc > "$backup_dir/egi_monitoring.dump"
chmod 600 "$backup_dir/egi_monitoring.dump"
sha256sum "$backup_dir/egi_monitoring.dump" > "$backup_dir/SHA256SUMS"
chmod 600 "$backup_dir/SHA256SUMS"

# Keep two weeks of local rollback material; off-host copies remain the
# recommended disaster-recovery layer.
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf -- {} +
