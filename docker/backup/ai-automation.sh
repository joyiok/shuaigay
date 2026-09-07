#!/bin/sh
set -eu

if [ -z "${AI_ADMIN_API_KEY:-}" ]; then
  exit 0
fi

curl -sS --max-time 90 -X POST "http://app:3000/api/ai/automation/run" \
  -H "Authorization: Bearer ${AI_ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"cron"}'
printf '\n'
