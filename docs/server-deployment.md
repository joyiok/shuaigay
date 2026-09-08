# 生产服务器部署

本文适用于 Debian 服务器上的单机 Docker Compose 部署。线上约定：

- 站点：`https://shuai.gay`、`https://www.shuai.gay`
- 目录：`/opt/shuaigay`
- GitHub：`joyiok/shuaigay`，服务器使用只读 Deploy Key
- 数据：Docker volumes；附件与本机备份分别在 `uploads/`、`backups/`

不要把 `.env`、私钥、源站 IP 或 `/root/shuaigay-credentials` 提交到 Git。

## 首次部署

### 1. 安装运行环境

```bash
apt-get update
apt-get install -y docker.io docker-compose git ufw fail2ban
systemctl enable --now docker
```

防火墙只开放 SSH、HTTP 和 HTTPS；启用前务必先放行 SSH：

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

写入 `/etc/fail2ban/jail.d/sshd.local` 并启动 SSH 防护：

```ini
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
```

```bash
systemctl enable --now fail2ban
fail2ban-client status sshd
```

### 2. 配置 GitHub Deploy Key

```bash
install -d -m 700 /root/.ssh
ssh-keygen -t ed25519 -N '' -C 'deploy@shuai.gay' -f /root/.ssh/shuaigay_deploy
ssh-keyscan -H github.com >> /root/.ssh/known_hosts
chmod 600 /root/.ssh/shuaigay_deploy /root/.ssh/known_hosts
```

将 `shuaigay_deploy.pub` 添加到 GitHub 仓库的 **Settings → Deploy keys**，保持只读。然后写入 `/root/.ssh/config`：

```sshconfig
Host github-shuaigay
  HostName github.com
  User git
  IdentityFile /root/.ssh/shuaigay_deploy
  IdentitiesOnly yes
```

验证并克隆：

```bash
ssh -T git@github-shuaigay
git clone git@github-shuaigay:joyiok/shuaigay.git /opt/shuaigay
cd /opt/shuaigay
git config pull.ff only
```

### 3. 配置生产环境

```bash
cd /opt/shuaigay
cp .env.example .env
chmod 600 .env
```

至少替换以下配置：

```dotenv
DOMAIN=shuai.gay
CADDY_DOMAINS="shuai.gay, www.shuai.gay"
SITE_URL=https://shuai.gay
POSTGRES_PASSWORD=<独立强口令>
RESTIC_PASSWORD=<独立强口令>
SMTP_URL=<真实 SMTP 地址>
MAIL_FROM="SHUAI GAY 论坛 <noreply@shuai.gay>"
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<正式站点密钥>
TURNSTILE_SECRET_KEY=<正式服务端密钥>
TURNSTILE_HOSTNAMES=shuai.gay,www.shuai.gay
SEED_ADMIN_EMAIL=<管理员邮箱>
SEED_ADMIN_PASSWORD=<管理员强口令>

# 可选:AI 自动运营(配置后每 10 分钟运行一次)
# 这两个是服务器基础设施密钥,不是模型服务密钥
AI_SETTINGS_ENCRYPTION_KEY=<粘贴 openssl rand -hex 32 的输出>
AI_CRON_KEY=<粘贴 openssl rand -hex 32 的输出>
```

生成随机值（每条命令执行一次，把输出粘贴到上面的 `.env`）：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

然后在管理后台「站点设置 → AI 自动运营」配置开关、模型服务地址、模型名称、自动执行置信度、AI 管理 API 密钥和模型服务密钥。面板里的两个密钥会加密存入数据库，页面只显示是否已配置；留空保持原值，勾选清除才会删除。

部署前检查：

```bash
docker run --rm --env-file .env \
  -v "$PWD/scripts/check-production.mjs:/check-production.mjs:ro" \
  node:22-bookworm-slim node /check-production.mjs
```

### 4. 启动和初始化

```bash
docker compose up -d --build
docker compose exec -T app npm run db:seed
docker compose exec -T backup sh /scripts/backup.sh
curl -f https://shuai.gay/api/health
```

`db:seed` 只需在首次部署时执行。Caddy 会自动申请并续期两个域名的 HTTPS 证书。

## 日常发布

```bash
cd /opt/shuaigay
git status --short
docker compose exec -T backup sh /scripts/pre-dump.sh
git pull --ff-only
docker compose up -d --build
curl -f https://shuai.gay/api/health
docker compose ps
```

若 `git status --short` 非空，先处理服务器本地改动，不要强制覆盖。

## 运维

```bash
# 日志
docker compose logs --tail=200 app caddy

# 健康状态
docker compose ps
curl -f http://127.0.0.1:3000/api/health

# 备份列表与手动备份
docker compose exec -T backup restic snapshots
docker compose exec -T backup sh /scripts/backup.sh
```

本机备份不能替代异地灾备。需要异地备份时，在 `.env` 配置 B2 或 S3 兼容存储，并定期演练 `docker/backup/restore.sh`。

AI 自动运营接口：`GET /api/ai/context` 读取公开内容和待处理举报，`POST /api/ai/actions` 执行白名单动作，`POST /api/ai/automation/run` 手动触发一次模型分析。请求使用管理后台里的 AI 管理 API 密钥作为 `Authorization: Bearer <密钥>`。自动任务只会归类、置顶/精华/锁帖或送入待审队列，不提供删除、封号、清空版块或修改权限。

MCP 接入：`https://www.shuai.gay/api/mcp` 是标准 Streamable HTTP MCP 地址。支持 URL 加 Bearer Header 的客户端可这样配置：

```json
{
  "mcpServers": {
    "shuaigay": {
      "url": "https://www.shuai.gay/api/mcp",
      "headers": {
        "Authorization": "Bearer <管理后台 AI 管理 API 密钥>"
      }
    }
  }
}
```

MCP 密钥使用管理后台「站点设置 → AI 自动运营」里的 AI 管理 API 密钥，不是模型服务密钥。

### MCP 工具（相当于 admin CLI）

只读：

- `get_forum_context` — 公开版块/主题/帖子/举报，供 AI 分析
- `get_admin_context` — 版块+分类、待审主题/帖子、待处理举报、用户概览与统计
- `preview_moderation_actions` / `preview_admin_actions` — 预览动作，不改数据

写入：

- `apply_moderation_actions` — AI 运营白名单动作（归类/置顶/精华/锁帖/送审/处理举报），需 `confirm=APPLY`
- `apply_admin_actions` — 管理动作全集：版块与分类增删改、版主任免、主题帖子增删改与审核、
  用户角色/封禁/积分/重置密码/勋章、敏感词、举报处理、全站公告；需 `confirm=APPLY`

安全约定：

- 推荐顺序 `get_*_context` → `preview_*` → `apply_*`
- 含不可逆动作（删版块/合并/清空/删主题帖子/封号/改角色/重置密码/删勋章）时，
  还必须传 `acknowledge="IRREVERSIBLE"`，否则整批拒绝、不做部分执行
- 单次最多 20 个动作，逐个返回 `applied/skipped/failed`；所有实际变更写审计日志
  （actor = 最早的管理员账号），可在后台「审计日志」查看
- MCP 密钥等同管理员权限：**不要与服务器 root 密码共用**，泄露后先到后台轮换密钥

