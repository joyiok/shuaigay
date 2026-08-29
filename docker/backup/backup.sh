#!/bin/sh
# 每晚定时备份:数据库全量 dump + 附件目录,一起进 restic 仓库(增量、加密)
# 备份完成后 ping HEALTHCHECK_URL,没 ping 到就会收到告警邮件
set -eu

TS=$(date +%Y%m%d-%H%M%S)
DUMP="/tmp/dump-${TS}.sql.gz"

pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" --no-owner | gzip > "$DUMP"

restic backup "$DUMP" /srv/uploads --tag auto
restic forget --keep-daily 30 --keep-weekly 8 --prune

rm -f "$DUMP"

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null || true
fi

echo "[$TS] backup ok"
