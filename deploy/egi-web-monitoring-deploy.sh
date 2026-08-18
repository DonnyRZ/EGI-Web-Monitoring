#!/usr/bin/env bash
set -Eeuo pipefail

# Install this file as /usr/local/sbin/egi-web-monitoring-deploy, owned by
# root and executable only by the dedicated deployment group.
readonly app_dir=/var/www/egi-web-monitoring
readonly compose_file="$app_dir/deploy/docker-compose.vps.yml"
readonly env_file="$app_dir/.env"
readonly state_dir=/var/lib/egi-web-monitoring
readonly log_dir=/var/log/egi-web-monitoring
readonly maintenance_dir=/run/egi-web-monitoring
readonly maintenance_flag="$maintenance_dir/maintenance.flag"

if [[ "$(id -u)" != "0" ]]; then
  echo "This wrapper must run as root through the allowlisted sudo rule." >&2
  exit 90
fi
[[ -d "$app_dir" && -f "$compose_file" && -f "$env_file" ]] || {
  echo "Deployment directory or environment file is missing." >&2
  exit 91
}
[[ "$(realpath -e "$app_dir")" == "$app_dir" ]] || {
  echo "Deployment directory resolved outside the expected path." >&2
  exit 92
}

install -d -m 700 "$state_dir" "$state_dir/releases"
install -d -m 750 "$log_dir"
log_file="$log_dir/deploy-$(date -u +%Y%m%d).log"
exec > >(tee -a "$log_file") 2>&1

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

read_env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$env_file" | tr -d '\r'
}

validate_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || {
    echo "Image tag must be a full lowercase 40-character commit SHA." >&2
    exit 93
  }
}

validate_digest() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo "Image digest must be a full sha256 digest." >&2
    exit 94
  }
}

validate_release_args() {
  [[ "$#" == "5" ]] || {
    echo "Expected: <commit-sha> <backend-digest> <frontend-digest> <scheduler-digest> <worker-digest>" >&2
    exit 95
  }
  validate_sha "$1"
  validate_digest "$2"
  validate_digest "$3"
  validate_digest "$4"
  validate_digest "$5"
}

export_release() {
  export IMAGE_TAG="$1"
  export BACKEND_IMAGE_DIGEST="$2"
  export FRONTEND_IMAGE_DIGEST="$3"
  export SCHEDULER_IMAGE_DIGEST="$4"
  export WORKER_IMAGE_DIGEST="$5"
}

validate_pinned_infrastructure() {
  local redis_image minio_image migration_image deploy_app_dir
  redis_image="$(read_env_value REDIS_IMAGE)"
  minio_image="$(read_env_value MINIO_IMAGE)"
  migration_image="$(read_env_value MIGRATION_IMAGE)"
  deploy_app_dir="$(read_env_value DEPLOY_APP_DIR)"
  [[ "$redis_image" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo "REDIS_IMAGE must include an immutable sha256 digest." >&2
    exit 96
  }
  [[ "$minio_image" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo "MINIO_IMAGE must include an immutable sha256 digest." >&2
    exit 96
  }
  [[ "$migration_image" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo "MIGRATION_IMAGE must include an immutable sha256 digest." >&2
    exit 96
  }
  [[ "$deploy_app_dir" == "$app_dir" ]] || {
    echo "DEPLOY_APP_DIR must point to the expected application directory." >&2
    exit 96
  }
}

validate_compose() {
  compose config > /dev/null
}

verify_image_digest() {
  local service="$1" expected="$2" registry image_ref repo_digests
  registry="$(read_env_value IMAGE_REGISTRY)"
  image_ref="$registry/$service:$IMAGE_TAG"
  repo_digests="$(docker image inspect "$image_ref" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
  grep -Fq "@$expected" <<< "$repo_digests" || {
    echo "Digest mismatch for $service; refusing rollout." >&2
    exit 97
  }
}

verify_pinned_image() {
  local image="$1" expected repo_digests
  expected="${image##*@}"
  repo_digests="$(docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
  grep -Fq "@$expected" <<< "$repo_digests" || {
    echo "Pinned image digest mismatch for $image; refusing operation." >&2
    exit 97
  }
}

pull_release() {
  compose pull redis minio backend frontend scheduler worker > /dev/null
}

backup_current_env() {
  local release_id
  release_id="$(date -u +%Y%m%d-%H%M%S)"
  old_env_backup="$state_dir/releases/$release_id.env"
  install -m 600 "$env_file" "$old_env_backup"
  echo "Previous environment saved as $old_env_backup"
}

restore_previous_env() {
  if [[ -n "${old_env_backup:-}" && -f "$old_env_backup" ]]; then
    install -m 600 "$old_env_backup" "$env_file"
    echo "Restored previous environment after failed rollout."
  fi
}

write_release_to_env() {
  local image_tag="$1" backend_digest="$2" frontend_digest="$3" scheduler_digest="$4" worker_digest="$5"
  local key
  for key in IMAGE_TAG BACKEND_IMAGE_DIGEST FRONTEND_IMAGE_DIGEST SCHEDULER_IMAGE_DIGEST WORKER_IMAGE_DIGEST; do
    grep -q "^$key=" "$env_file" || {
      echo "$key is missing from $env_file; refusing to rewrite production config." >&2
      exit 98
    }
  done
  sed -E -i \
    -e "s|^IMAGE_TAG=.*$|IMAGE_TAG=$image_tag|" \
    -e "s|^BACKEND_IMAGE_DIGEST=.*$|BACKEND_IMAGE_DIGEST=$backend_digest|" \
    -e "s|^FRONTEND_IMAGE_DIGEST=.*$|FRONTEND_IMAGE_DIGEST=$frontend_digest|" \
    -e "s|^SCHEDULER_IMAGE_DIGEST=.*$|SCHEDULER_IMAGE_DIGEST=$scheduler_digest|" \
    -e "s|^WORKER_IMAGE_DIGEST=.*$|WORKER_IMAGE_DIGEST=$worker_digest|" \
    "$env_file"
  chmod 600 "$env_file"
}

wait_for_health() {
  local service="$1" container status attempt
  for attempt in $(seq 1 60); do
    container="$(compose ps -q "$service" 2> /dev/null || true)"
    if [[ -n "$container" ]]; then
      status="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2> /dev/null || true)"
      [[ "$status" == "healthy" ]] && return 0
      [[ "$status" == "unhealthy" ]] && break
    fi
    sleep 2
  done
  echo "$service did not become healthy in time." >&2
  compose ps "$service" || true
  return 1
}

wait_for_running() {
  local service="$1" container status attempt
  for attempt in $(seq 1 30); do
    container="$(compose ps -q "$service" 2> /dev/null || true)"
    if [[ -n "$container" ]]; then
      status="$(docker inspect --format '{{.State.Status}}' "$container" 2> /dev/null || true)"
      [[ "$status" == "running" ]] && return 0
    fi
    sleep 2
  done
  echo "$service did not remain running in time." >&2
  compose ps "$service" || true
  return 1
}

rollout() {
  local mode="$1"
  shift
  validate_release_args "$@"
  validate_pinned_infrastructure
  export_release "$@"
  validate_compose
  pull_release
  verify_image_digest backend "$BACKEND_IMAGE_DIGEST"
  verify_image_digest frontend "$FRONTEND_IMAGE_DIGEST"
  verify_image_digest scheduler "$SCHEDULER_IMAGE_DIGEST"
  verify_image_digest worker "$WORKER_IMAGE_DIGEST"

  if [[ "$mode" == "deploy" || "$mode" == "rollback" ]]; then
    backup_current_env
    trap restore_previous_env ERR
    write_release_to_env "$@"
  fi

  compose up -d --no-build backend frontend
  wait_for_health backend
  wait_for_health frontend
  compose up -d --no-build scheduler worker
  wait_for_running scheduler
  wait_for_running worker
  trap - ERR
  echo "${mode^} rollout completed for $IMAGE_TAG"
}

run_migration() {
  local release_tag="$1"
  validate_release_args "$@"
  validate_pinned_infrastructure
  validate_compose
  migration_image="$(read_env_value MIGRATION_IMAGE)"
  compose pull backend-migrate > /dev/null
  verify_pinned_image "$migration_image"
  compose --profile ops run --rm backend-migrate
  echo "Prisma migration completed for $release_tag"
}

preflight() {
  validate_pinned_infrastructure
  validate_release_args "$(read_env_value IMAGE_TAG)" "$(read_env_value BACKEND_IMAGE_DIGEST)" "$(read_env_value FRONTEND_IMAGE_DIGEST)" "$(read_env_value SCHEDULER_IMAGE_DIGEST)" "$(read_env_value WORKER_IMAGE_DIGEST)"
  validate_compose
  compose ps
}

reload_nginx() {
  nginx -t
  systemctl reload nginx
  echo "Nginx reload completed."
}

maintenance_on() {
  install -d -m 755 "$maintenance_dir"
  install -m 644 /dev/null "$maintenance_flag"
  reload_nginx
  echo "Maintenance mode enabled."
}

maintenance_off() {
  rm -f -- "$maintenance_flag"
  reload_nginx
  echo "Maintenance mode disabled."
}

usage() {
  echo "Usage:"
  echo "  $0 preflight"
  echo "  $0 migrate <sha> <backend-digest> <frontend-digest> <scheduler-digest> <worker-digest>"
  echo "  $0 deploy <sha> <backend-digest> <frontend-digest> <scheduler-digest> <worker-digest>"
  echo "  $0 rollback <sha> <backend-digest> <frontend-digest> <scheduler-digest> <worker-digest>"
  echo "  $0 reload-nginx"
  echo "  $0 maintenance-on|maintenance-off"
}

action="${1:-}"
shift || true
case "$action" in
  preflight)
    [[ "$#" == "0" ]] || { usage; exit 99; }
    preflight
    ;;
  migrate)
    run_migration "$@"
    ;;
  deploy)
    rollout deploy "$@"
    ;;
 rollback)
   rollout rollback "$@"
   ;;
  reload-nginx)
    [[ "$#" == "0" ]] || { usage; exit 99; }
    reload_nginx
    ;;
  maintenance-on)
    [[ "$#" == "0" ]] || { usage; exit 99; }
    maintenance_on
    ;;
  maintenance-off)
    [[ "$#" == "0" ]] || { usage; exit 99; }
    maintenance_off
    ;;
 *)
    usage
    exit 99
    ;;
esac
