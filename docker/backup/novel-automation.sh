#!/bin/sh
set -eu

if [ -z "${AI_CRON_KEY:-}" ]; then
  exit 0
fi

# 防重入：上一轮还没跑完就跳过（busybox 无 flock，用 mkdir 原子锁）
LOCK=/tmp/novel-automation.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

curl -sS --max-time 900 -X POST "http://app:3000/api/ai/novel/run" \
  -H "X-AI-Cron-Key: ${AI_CRON_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"cron"}' || true
printf '\n'
