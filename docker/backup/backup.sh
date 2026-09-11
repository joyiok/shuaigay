#!/bin/sh
# 每晚定时备份:数据库全量 dump + 附件目录,一起进 restic 仓库(增量、加密)
# 备份完成后 ping HEALTHCHECK_URL,没 ping 到就会收到告警邮件
set -eu

TS=$(date +%Y%m%d-%H%M%S)
DUMP="/tmp/dump-${TS}.sql.gz"

restic snapshots >/dev/null 2>&1 || restic init
pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" --no-owner | gzip > "$DUMP"

restic backup "$DUMP" /srv/uploads --tag auto
restic forget --keep-daily 30 --keep-weekly 8 --prune

rm -f "$DUMP"

# 给后台看的备份状态（app 以只读方式挂载 ./backups）
# restic snapshots 不含仓库体积，用 restic stats 取 total_size
STATS=$(restic stats --json 2>/dev/null | tr -d '\n')
SIZE=$(printf '%s' "$STATS" | sed -n 's/.*"total_size":\([0-9]*\).*/\1/p' | head -1)
FILES=$(printf '%s' "$STATS" | sed -n 's/.*"total_file_count":\([0-9]*\).*/\1/p' | head -1)
SNAPS=$(printf '%s' "$STATS" | sed -n 's/.*"snapshots_count":\([0-9]*\).*/\1/p' | head -1)
cat > /backups/last-backup.json <<JSON
{"at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","ok":true,"sizeBytes":${SIZE:-null},"fileCount":${FILES:-null},"snapshots":${SNAPS:-null},"note":"restic + pg_dump"}
JSON

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null || true
fi

echo "[$TS] backup ok"
