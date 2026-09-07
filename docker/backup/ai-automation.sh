#!/bin/sh
set -eu

if [ "${AI_AUTOMATION_ENABLED:-0}" != "1" ] || [ -z "${AI_ADMIN_API_KEY:-}" ]; then
  exit 0
fi

curl -fsS --max-time 90 -X POST "${AI_AUTOMATION_URL:-http://app:3000/api/ai/automation/run}" \
  -H "Authorization: Bearer ${AI_ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"cron"}'
printf '\n'
