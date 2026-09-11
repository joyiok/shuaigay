#!/bin/sh
# 清理过期统计数据：VisitDaily 保留 180 天（UV 的 Redis key 自带 120 天过期）。
# 由 crontab 每天 04:15 调用；不触碰业务数据。
set -eu

psql -v ON_ERROR_STOP=1 -c "
  DELETE FROM \"VisitDaily\" WHERE day < current_date - interval '180 days';
" || exit 1

# 顺带清理 180 天前的审计日志（管理动作留痕够用即可，避免无限增长）
psql -v ON_ERROR_STOP=1 -c "
  DELETE FROM \"AuditLog\" WHERE \"createdAt\" < now() - interval '180 days';
" || true

# 错误聚合 / Web Vitals 保留 180 天；邮件失败留痕保留 90 天
psql -v ON_ERROR_STOP=1 -c "
  DELETE FROM \"ErrorDaily\" WHERE day < current_date - interval '180 days';
  DELETE FROM \"VitalDaily\" WHERE day < current_date - interval '180 days';
  DELETE FROM \"MailFailure\" WHERE \"createdAt\" < now() - interval '90 days';
" || true

# 登录 IP 留痕保留 180 天（隐私最小化：IP 不无限期留存）
psql -v ON_ERROR_STOP=1 -c "
  DELETE FROM \"UserIpLog\" WHERE \"createdAt\" < now() - interval '180 days';
" || true

printf '[%s] prune-stats done\n' "$(date '+%F %T')"
