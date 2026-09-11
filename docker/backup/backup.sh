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
SIZE=$(restic snapshots --json --latest 1 2>/dev/null | tr -d '\n' | sed -n 's/.*"total_size":\([0-9]*\).*/\1/p' | head -1)
cat > /backups/last-backup.json <<JSON
{"at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","ok":true,"sizeBytes":${SIZE:-null},"note":"restic + pg_dump"}
JSON

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null || true
fi

echo "[$TS] backup ok"
