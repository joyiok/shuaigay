# ===== 构建阶段 =====
FROM node:22-bookworm-slim AS build
WORKDIR /app

# 先拷贝依赖清单和 prisma schema,利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ===== 运行阶段 =====
FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/srv/uploads

# standalone 产物(自带最小 node_modules)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma 运行时 + CLI(容器启动时自动 migrate deploy)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# 启动前先把数据库迁移到位(幂等,靠 PG 咨询锁防并发)
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
