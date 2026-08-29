#!/bin/sh
# 恢复(演练或真恢复):
#   sh /scripts/restore.sh              恢复最近一次快照
#   sh /scripts/restore.sh <snapshot-id>  恢复指定快照(restic snapshots 查看)
# 恢复会覆盖当前数据库,确认没有人在线时再执行
set -eu

SNAP="${1:-latest}"
WORK=/tmp/restore
rm -rf "$WORK"
mkdir -p "$WORK"

restic restore "$SNAP" --target "$WORK"

DUMP=$(find "$WORK" -name '*.sql.gz' | head -n1)
if [ -z "$DUMP" ]; then
  echo "快照里没找到数据库 dump"
  exit 1
fi

echo "将用 $DUMP 覆盖数据库 ${PGDATABASE},5 秒内 Ctrl+C 取消..."
sleep 5

gunzip -c "$DUMP" | psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE"

echo "数据库恢复完成。"
if [ -d "$WORK/srv/uploads" ]; then
  echo "快照里包含附件,如需一并恢复,执行:"
  echo "  rsync -a $WORK/srv/uploads/ /srv/uploads/"
fi
