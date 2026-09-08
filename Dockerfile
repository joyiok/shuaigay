# ===== 构建阶段 =====
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# 先拷贝依赖清单和 prisma schema,利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY prisma ./prisma
# npm 缓存挂载：package-lock 变动时也能少下载
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund

COPY . .
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# .next/cache 挂载：服务器上重复构建时复用 Next 编译缓存（BuildKit）
RUN --mount=type=cache,target=/app/.next/cache npx prisma generate && npm run build

# Prisma CLI 是 devDependency，但容器启动时仍需要它执行 migrate deploy。
# standalone 会裁剪这些包，先把 CLI 的运行时依赖按包名整理到临时目录。
RUN mkdir -p /runtime-deps/node_modules \
  && for package in c12 chokidar confbox defu deepmerge-ts destr dotenv effect empathic exsolve fast-check giget jiti ohash pathe perfect-debounce pkg-types pure-rand rc9 readdirp citty consola node-fetch-native nypm tinyexec; do \
       cp -a "node_modules/$package" /runtime-deps/node_modules/; \
     done \
  && cp -a node_modules/@standard-schema /runtime-deps/node_modules/

# ===== 运行阶段 =====
FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/srv/uploads
ENV HOSTNAME=0.0.0.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# standalone 产物(自带最小 node_modules)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma 运行时 + CLI(容器启动时自动 migrate deploy)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=build /runtime-deps/node_modules ./node_modules

# 启动前先把数据库迁移到位(幂等,靠 PG 咨询锁防并发)
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
