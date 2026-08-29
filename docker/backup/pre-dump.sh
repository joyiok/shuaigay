#!/bin/sh
# 数据库迁移/升级前手动备份:
#   docker compose exec backup sh /scripts/pre-dump.sh
set -eu

TS=$(date +%Y%m%d-%H%M%S)

pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" --no-owner --no-privileges \
  | gzip \
  | restic backup --stdin --stdin-filename "pre-migrate-${TS}.sql.gz" --tag pre-migrate

echo "[$TS] 迁移前备份完成(tag=pre-migrate)。升级出问题时:sh /scripts/restore.sh latest"
