# SHUAI GAY 论坛

原创极简风格的高性能论坛 — 基于 Next.js 15 + Prisma + PostgreSQL + Redis + Caddy。

## 一键部署（生产）

### 1. 准备环境

```bash
git clone <repo> && cd shuaigay
cp .env.example .env
# 编辑 .env,必填:
#   POSTGRES_PASSWORD   强口令
#   DOMAIN=forum.example.com
#   SITE_URL=https://forum.example.com
#   SMTP_URL=smtp://user:pass@smtp.example.com:587   # 留空则邮件仅打印日志
#   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

### 2. 启动

```bash
docker compose up -d --build
# 容器启动时自动执行 prisma migrate deploy,无需手工迁移
# 查看日志
docker compose logs -f app
# 检查健康
curl -f http://localhost:3000/api/health
# 或通过 Caddy 域名
curl -f https://forum.example.com/api/health
```

Caddy 会在首次有真实域名时自动向 Let's Encrypt 申请证书,后续自动续期。`DOMAIN` 与 `SITE_URL` 保持一致,邮件验证链接、sitemap 才能指向正确域名。

### 3. 初始化数据

```bash
# 种子:管理员 + 默认版块
docker compose exec app sh -c "npm run db:seed"
# 或本地
npm run db:seed
```

### 4. 备份（可选）

`backup` 服务已随 compose 启动,每日自动 `pg_dump + restic` 到 `RESTIC_REPOSITORY`。生产建议设为 `b2:bucket:forum-backups` 并配置 `B2_ACCOUNT_ID / KEY` 与强 `RESTIC_PASSWORD`,配合 `HEALTHCHECK_URL` 接 healthchecks.io。

### 5. 更新

```bash
git pull && docker compose up -d --build
# 自动迁移,零停机需配合外部负载
```

## 本地开发

```bash
# 起依赖
docker compose up -d postgres redis
# 或 npm run db:up
npm i
npm run build   # 生成 prisma client
npx prisma migrate dev   # 首次建表
npm run db:seed
npm run dev    # http://localhost:3000
```

健康探针: `GET /api/health` 返回 `{status, uptime, db, redis}`。

可观测: 所有 server action 与 API 路由通过 `src/lib/logger.ts` 输出结构化 JSON 日志,可直采至 Loki/CloudWatch。

邮件: 未配置 `SMTP_URL` 时邮件内容以 `email.mock` JSON 打印到容器日志,配置后经 nodemailer 真实发送。

封禁: 管理后台 → 用户管理 → 封禁/解封(可填天数,留空=永久),被封用户登录时 403,已登录会话的发帖/回帖/私信同样会被拦截。

敏感词: 管理后台 → 敏感词,增删后 1 分钟内生效(内存缓存)。

## 目录

- `src/app` — 路由与 server actions
- `src/lib/email.ts` — 邮件(模拟/真实)
- `src/lib/logger.ts` — 结构化日志
- `src/lib/sensitive.ts` — 敏感词(读库+缓存)
- `src/lib/ban.ts` — 封禁
- `prisma/schema.prisma` — 数据模型
- `compose.yml` / `Caddyfile` / `Dockerfile` — 部署

## 运维

- 附件: `STORAGE_DRIVER=local`, 宿主机 `./uploads` 映射到容器 `/srv/uploads`,Caddy 直出。
- 限流/在线: 依赖 Redis,未配置或故障时自动降级放行。
- 站点 URL: `SITE_URL` 缺省时用 `forum.example.com` 占位,生产必须覆盖。

## 许可证

原创项目,未经许可勿商用。
