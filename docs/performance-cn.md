# 国内访问优化记录

线站：Cloudflare（代理）→ 源站 Contabo（法国 Lauterbourg）→ Caddy → Next.js

## 结论：瓶颈在网络路径，不在应用

| 指标 | 实测 |
|---|---|
| 源站渲染 TTFB（直连 app） | **38–58 ms** |
| 首页 HTML（br/gzip 后） | **17 KB** |
| 主要 JS chunk | 46 KB + 54 KB + 若干小文件（均 CF 已缓存） |
| 静态资源（`/_next/static/*`） | CF **HIT**（immutable 1 年） |
| 首页 HTML | 原为 **DYNAMIC**：每次都要回法国 ⛔ |

也就是说：应用很快，问题是「国内 → CF 边缘 → 法国源站」这条链路。

## 已做的优化

### 1. 源站内核（BBR）
`/etc/sysctl.d/99-shuaigay-net.conf`（旧值备份在服务器 `/root/net-tuning.before`）

- `tcp_congestion_control=bbr`、`default_qdisc=fq`，eth0 qdisc=fq
- 缓冲 16 MB、`tcp_slow_start_after_idle=0`、`tcp_mtu_probing=1`、`tcp_fastopen=3`
- 收益：CF 边缘 ↔ 法国源站这段是长肥链路，BBR 抗丢包、恢复快；每次回源都受益

### 2. 匿名页面交给 Cloudflare 边缘缓存（60s）
Caddyfile 里两条 matcher（`@anon_doc` / `@anon_rsc`）：

- **文档请求**：GET + `Accept: text/html` + 无 `session` cookie + 非 RSC/预取 + 非 `/api /admin /settings /notifications /messages /drafts /invite /login /register /reset /forgot /verify-email /u/*`
- **站内跳转的 RSC 载荷**：`RSC: 1` + `?_rsc=` + 无 session，**排除** `Next-Router-Prefetch`（预取只含骨架，缓存后会被后续导航命中）
- 命中后把上游 `private, no-cache, no-store, ...` **查找替换**为
  `public, max-age=0, s-maxage=60, stale-while-revalidate=300`，并去掉 `Vary`
- 文档与 RSC 靠 URL（有无 `_rsc`）天然隔离，互不污染

> Caddy 注意点：`header_down` 对已存在的头是**追加**语义；`-Field` + `Field value` 会整头删掉。
> 用 `header_down Field "<find>" "<replace>"` 才能干净替换。

### 3. 仍需要在 Cloudflare 后台做的一步（关键）

CF 默认不缓存 HTML，必须在 **Caching → Cache Rules** 加两条（顺序不能反）：

**规则 1 — 登录用户绕过缓存**
- 名称：`bypass-session`
- 表达式：`(http.cookie contains "session=")`
- Cache eligibility：**Bypass cache**

**规则 2 — 其余按源站 TTL 缓存**
- 名称：`respect-origin-ttl`
- 表达式：`(http.host eq "shuai.gay")`
- Cache eligibility：**Eligible for cache**
- Edge TTL：**Use cache-control header if present, bypass cache if not**
- Browser TTL：**Respect origin**

不加规则 2：`s-maxage` 不生效，HTML 仍走 DYNAMIC（回法国）。
不加规则 1：登录用户会拿到匿名的缓存页面（cookie 不在 CF 默认缓存键里）。

可选加分项：
- **Caching → Tiered Cache 打开**（免费，优化 CF → 法国这段路径）
- **Argo Smart Routing**（付费）能进一步压 CF→源站的 RTT
- 源站搬到香港/日本/新加坡是最彻底的解法（要迁移 DB + 附件 + DNS）

### 4. 验证方法

```bash
# 匿名文档：应看到 s-maxage，且 cf-cache-status 变成 HIT
curl -s -o /dev/null -D - -H 'Accept: text/html' https://shuai.gay/ | grep -iE 'cache-control|cf-cache-status'
# 登录态：必须仍是 no-store
curl -s -o /dev/null -D - -H 'Accept: text/html' -H 'Cookie: session=x' https://shuai.gay/ | grep -i cache-control
# RSC 跳转载荷：应可缓存；预取必须 no-store
curl -s -o /dev/null -D - -H 'RSC: 1' -H 'Accept: text/x-component' 'https://shuai.gay/?_rsc=t' | grep -i cache-control
```

RSC 载荷每次渲染的 chunk ID 不同，已验证「给客户端喂旧载荷」不会崩（客户端跳转正常、无 JS 报错），故可安全缓存。

## 部署方式：GHCR 预构建镜像（停机 ~1s）

~~CI 的 deploy 步骤在服务器上 `docker compose up -d --build`，本地无构建缓存，重建期间约 **1–2 分钟**站点不可用（CF 521）。~~

**已修复（2026-09-11）**：改为 CI 构建镜像推 GHCR，服务器只拉镜像。

- `docker` job 在 main 上构建并推送 `ghcr.io/joyiok/shuaigay:sha-<commit>` 与 `:latest`（gha 构建缓存）
- `compose.yml` 的 app 支持 `APP_IMAGE` 覆盖（默认 `:latest`），本地开发仍可 `--build`
- deploy 改为 `docker compose pull app` + `up -d --wait app`，只重建 app 容器，并清掉 7 天前的旧镜像
- 镜像按 commit 定版，回滚 = 把 `APP_IMAGE` 指回旧 sha 再 `up -d`

实测（Docker 事件 + 外部每 2s 探测）：

| | 之前 | 现在 |
|---|---|---|
| 容器停机 | 1–2 分钟（构建期） | **约 1 秒**（stop 1789102907 → start 1789102908） |
| deploy job 耗时 | 2m20s | **1m06s** |

GHCR 包为 public（服务器无 docker 凭据、匿名拉取），镜像内不含任何密钥。
