-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "ThreadCategory" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardModerator" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardModerator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostRating" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadCategory_boardId_order_idx" ON "ThreadCategory"("boardId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadCategory_boardId_name_key" ON "ThreadCategory"("boardId", "name");

-- CreateIndex
CREATE INDEX "BoardModerator_userId_idx" ON "BoardModerator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardModerator_boardId_userId_key" ON "BoardModerator"("boardId", "userId");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_threadId_key" ON "Favorite"("userId", "threadId");

-- CreateIndex
CREATE INDEX "PostRating_postId_value_idx" ON "PostRating"("postId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "PostRating_postId_userId_key" ON "PostRating"("postId", "userId");

-- CreateIndex
CREATE INDEX "Thread_boardId_categoryId_lastPostAt_idx" ON "Thread"("boardId", "categoryId", "lastPostAt");

-- AddForeignKey
ALTER TABLE "ThreadCategory" ADD CONSTRAINT "ThreadCategory_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardModerator" ADD CONSTRAINT "BoardModerator_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardModerator" ADD CONSTRAINT "BoardModerator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRating" ADD CONSTRAINT "PostRating_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRating" ADD CONSTRAINT "PostRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ThreadCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 积分规则上线:补发存量用户的活跃积分(发主题 +10,回复 +3,首帖归主题),
-- 让等级体系对老用户立即可见。此后新增积分由应用层在发帖/回帖时发放,不会重复。
UPDATE "User" u
SET "points" = u."points" + COALESCE(act."delta", 0)
FROM (
  SELECT t."authorId" AS uid,
         COUNT(DISTINCT t.id) * 10 + COALESCE(r."cnt", 0) * 3 AS delta
  FROM "Thread" t
  LEFT JOIN (
    SELECT p."authorId", COUNT(*) AS cnt
    FROM "Post" p
    JOIN "Thread" th ON th.id = p."threadId"
    WHERE p."authorId" <> th."authorId"
    GROUP BY p."authorId"
  ) r ON r."authorId" = t."authorId"
  GROUP BY t."authorId", r."cnt"
) act
WHERE u.id = act.uid;
